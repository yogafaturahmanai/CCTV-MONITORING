const axios = require('axios');
const xml2js = require('xml2js');
const crypto = require('crypto');

// MD5 Helper
const md5 = (str) => crypto.createHash('md5').update(str).digest('hex');

// Parse WWW-Authenticate Digest header values
const parseDigestHeader = (header) => {
  const parts = header.substring(7).split(/,\s*/);
  const params = {};
  for (const part of parts) {
    const [key, val] = part.split('=');
    if (key && val) {
      params[key.trim()] = val.replace(/"/g, '').trim();
    }
  }
  return params;
};

// Custom Axios instance with Digest Auth support
const makeDigestRequest = async (url, method, username, password, timeout = 4000) => {
  try {
    // First try unauthenticated request to trigger 401 challenge
    return await axios({ method, url, timeout });
  } catch (err) {
    if (err.response && err.response.status === 401 && err.response.headers['www-authenticate']) {
      const authHeader = err.response.headers['www-authenticate'];
      if (!authHeader.startsWith('Digest')) {
        // Fallback to basic authentication if server asks for Basic
        const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
        return await axios({
          method,
          url,
          timeout,
          headers: { 'Authorization': `Basic ${basicAuth}` }
        });
      }

      const params = parseDigestHeader(authHeader);
      const realm = params.realm;
      const nonce = params.nonce;
      const qop = params.qop;
      const opaque = params.opaque;
      
      const uri = new URL(url).pathname;
      const nc = '00000001';
      const cnonce = crypto.randomBytes(8).toString('hex');
      
      const HA1 = md5(`${username}:${realm}:${password}`);
      const HA2 = md5(`${method}:${uri}`);
      
      let response;
      if (qop === 'auth' || qop === 'auth-int') {
        response = md5(`${HA1}:${nonce}:${nc}:${cnonce}:${qop}:${HA2}`);
      } else {
        response = md5(`${HA1}:${nonce}:${HA2}`);
      }

      let authStr = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
      if (qop) {
        authStr += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
      }
      if (opaque) {
        authStr += `, opaque="${opaque}"`;
      }

      return await axios({
        method,
        url,
        timeout,
        headers: { 'Authorization': authStr }
      });
    }
    throw err;
  }
};

// Parse Hikvision XML to JSON
const parseXml = async (xmlString) => {
  try {
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    return await parser.parseStringPromise(xmlString);
  } catch (err) {
    console.error('[XML Parse Error]', err.message);
    return null;
  }
};

/**
 * Poll real Hikvision NVR via ISAPI
 */
const pollNvrDevice = async (nvr, decryptedPassword) => {
  const baseURL = `${nvr.protocol}://${nvr.ip_address}:${nvr.port}`;
  
  try {
    // 1. Verify connection & authenticate with DeviceInfo
    console.log(`[ISAPI] Connecting to NVR: ${nvr.name} (${nvr.ip_address})`);
    const devInfoRes = await makeDigestRequest(
      `${baseURL}/ISAPI/System/deviceInfo`,
      'GET',
      nvr.username,
      decryptedPassword,
      5000
    );

    // 2. Fetch Channel Status
    let channels = [];
    try {
      const chRes = await makeDigestRequest(
        `${baseURL}/ISAPI/ContentMgmt/InputProxy/channels/status`,
        'GET',
        nvr.username,
        decryptedPassword,
        5000
      );
      const parsedCh = await parseXml(chRes.data);
      channels = mapIsapiChannels(parsedCh);
    } catch (chErr) {
      console.warn(`[ISAPI] Failed to fetch channels for ${nvr.name}:`, chErr.message);
    }

    // 3. Fetch Storage HDD Status
    let hdds = [];
    try {
      const hddRes = await makeDigestRequest(
        `${baseURL}/ISAPI/System/Storage/volumes`,
        'GET',
        nvr.username,
        decryptedPassword,
        5000
      );
      const parsedHdd = await parseXml(hddRes.data);
      hdds = mapIsapiHdds(parsedHdd);
    } catch (hddErr) {
      console.warn(`[ISAPI] Failed to fetch HDDs for ${nvr.name}:`, hddErr.message);
    }

    return {
      status: 'ONLINE',
      channels,
      hdds
    };

  } catch (err) {
    // Handle error states strictly per PRD spec
    console.error(`[ISAPI] Connection to ${nvr.name} failed:`, err.message);
    
    if (err.response && err.response.status === 401) {
      return {
        status: 'AUTH_FAILED',
        channels: [],
        hdds: []
      };
    }

    return {
      status: 'NETWORK_TIMEOUT',
      channels: [],
      hdds: []
    };
  }
};

// Map Hikvision XML Channel Status to internal schema
const mapIsapiChannels = (xmlData) => {
  if (!xmlData) return [];
  
  const list = xmlData.InputProxyChannelStatusList?.InputProxyChannelStatus;
  if (!list) return [];

  const rawChannels = Array.isArray(list) ? list : [list];
  return rawChannels.map(ch => {
    // Hikvision fields: id, name, online (e.g. "true" / "false")
    const isOnline = ch.online === 'true' || ch.online === true;
    return {
      channel_no: parseInt(ch.id) || 1,
      camera_name: ch.name || `Camera ${ch.id}`,
      last_status: isOnline ? 'ONLINE' : 'OFFLINE',
      // If camera is offline, recording is NO_RECORDING
      last_recording_status: isOnline ? 'RECORDING' : 'NO_RECORDING'
    };
  });
};

// Map Hikvision XML HDD Status to internal schema
const mapIsapiHdds = (xmlData) => {
  if (!xmlData) return [];

  const list = xmlData.HDDList?.HDD;
  if (!list) return [];

  const rawHdds = Array.isArray(list) ? list : [list];
  return rawHdds.map(h => {
    // Hikvision fields: id, capacity (KB), freeSpace (KB), status ("normal", "error", etc.)
    const capacityMb = Math.round((parseInt(h.capacity) || 0) / 1024);
    const freeSpaceMb = Math.round((parseInt(h.freeSpace) || 0) / 1024);
    
    let dbStatus = 'normal';
    if (h.status === 'uninitialized') dbStatus = 'uninitialized';
    else if (h.status !== 'normal' && h.status !== 'ok') dbStatus = 'error';

    return {
      disk_id: h.id || "1",
      capacity_mb: capacityMb,
      freespace_mb: freeSpaceMb,
      status: dbStatus
    };
  });
};

module.exports = {
  pollNvrDevice
};
