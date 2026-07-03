const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { pollNvrDevice } = require('./isapiClient.cjs');

const prisma = new PrismaClient();
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'ati_cctv_monitoring_secret_key';

// Password decryption helper
const decryptPassword = (encText) => {
  if (!encText) return '';
  if (encText.startsWith('enc_')) {
    try {
      return Buffer.from(encText.substring(4), 'base64').toString('utf-8');
    } catch (e) {
      return '';
    }
  }
  return encText;
};

// Middleware: Authenticate Request via JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Unauthorized: Token missing' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Forbidden: Invalid token' });
    req.user = user;
    next();
  });
};

// Middleware: Authenticate PCNVR Agent Token
const authenticateAgentToken = async (req, res, next) => {
  const token = req.headers['x-agent-token'];
  const { nvr_id } = req.params;

  if (!token) return res.status(401).json({ error: 'Unauthorized: Agent Token missing' });

  try {
    const nvr = await prisma.nVR.findUnique({ where: { id: nvr_id } });
    if (!nvr || nvr.type !== 'pcnvr') {
      return res.status(404).json({ error: 'PCNVR device not found' });
    }

    if (nvr.agent_token !== token) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Agent Token' });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const logAudit = async (username, action, details, severity = 'Info') => {
  try {
    await prisma.auditLog.create({
      data: {
        username,
        action,
        details,
        severity
      }
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
};

// --- AUTH ENDPOINTS ---
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (username === 'admin' && password === 'admin123') {
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '8h' });
    await logAudit(username, 'Login', `User admin logged in`, 'Info');
    return res.json({ token, username });
  }

  res.status(401).json({ error: 'Username atau Password salah!' });
});

// --- DASHBOARD ENDPOINTS ---
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const nvrs = await prisma.nVR.findMany({
      include: {
        channels: true,
        hdds: true
      }
    });

    const auditLogs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 50
    });

    res.json({ nvrs, auditLogs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- CRUD NVR ENDPOINTS ---
router.get('/nvr', authenticateToken, async (req, res) => {
  try {
    const nvrs = await prisma.nVR.findMany();
    res.json(nvrs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/nvr', authenticateToken, async (req, res) => {
  const { name, site, type, ip_address, port, protocol, username, password_encrypted } = req.body;

  const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipPattern.test(ip_address)) {
    return res.status(400).json({ error: 'Format IP Address tidak valid.' });
  }

  if (!port || port < 1 || port > 65535) {
    return res.status(400).json({ error: 'Port tidak valid.' });
  }

  try {
    const existing = await prisma.nVR.findFirst({
      where: { ip_address, port: parseInt(port) }
    });
    if (existing) {
      return res.status(400).json({ error: 'IP Address dan Port sudah didaftarkan.' });
    }

    let agentToken = null;
    let rotatedAt = null;

    if (type === 'pcnvr') {
      agentToken = crypto.randomBytes(16).toString('hex');
      rotatedAt = new Date();
    }

    const newNvr = await prisma.nVR.create({
      data: {
        name,
        site,
        type,
        ip_address,
        port: parseInt(port),
        protocol,
        username,
        password_encrypted: password_encrypted || '',
        agent_token: agentToken,
        rotated_at: rotatedAt,
        last_heartbeat_at: type === 'pcnvr' ? new Date() : null
      }
    });

    // Seed default mock channels and HDD to have data initially
    await prisma.channel.create({
      data: {
        nvr_id: newNvr.id,
        channel_no: 1,
        camera_name: 'Default Channel 1',
        last_status: 'ONLINE',
        last_recording_status: 'RECORDING'
      }
    });

    await prisma.hDD.create({
      data: {
        nvr_id: newNvr.id,
        disk_id: type === 'pcnvr' ? 'D:/' : '1',
        capacity_mb: 2000000,
        freespace_mb: 1800000,
        status: 'normal'
      }
    });

    await logAudit(req.user.username, 'Tambah NVR', `Menambahkan NVR: ${name} (${ip_address})`, 'Info');

    res.status(201).json(newNvr);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/nvr/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, site, type, ip_address, port, protocol, username, password_encrypted } = req.body;

  try {
    const existingNvr = await prisma.nVR.findUnique({ where: { id } });
    if (!existingNvr) return res.status(404).json({ error: 'NVR tidak ditemukan' });

    const duplicate = await prisma.nVR.findFirst({
      where: {
        ip_address,
        port: parseInt(port),
        NOT: { id }
      }
    });
    if (duplicate) {
      return res.status(400).json({ error: 'IP Address dan Port ini sudah digunakan oleh NVR lain.' });
    }

    const updateData = {
      name,
      site,
      type,
      ip_address,
      port: parseInt(port),
      protocol,
      username,
    };

    if (password_encrypted) {
      updateData.password_encrypted = password_encrypted;
    }

    const updated = await prisma.nVR.update({
      where: { id },
      data: updateData
    });

    await logAudit(req.user.username, 'Edit NVR', `Mengedit data NVR: ${name}`, 'Info');
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/nvr/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const nvr = await prisma.nVR.findUnique({ where: { id } });
    if (!nvr) return res.status(404).json({ error: 'NVR tidak ditemukan' });

    await prisma.nVR.delete({ where: { id } });

    await logAudit(req.user.username, 'Hapus NVR', `Menghapus NVR: ${nvr.name}`, 'Warning');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/nvr/:id/channels', authenticateToken, async (req, res) => {
  try {
    const channels = await prisma.channel.findMany({ where: { nvr_id: req.params.id } });
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/nvr/:id/hdd', authenticateToken, async (req, res) => {
  try {
    const hdds = await prisma.hDD.findMany({ where: { nvr_id: req.params.id } });
    res.json(hdds);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- POLLING / REFRESH TRIGGER ---
router.post('/nvr/:id/poll', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const nvr = await prisma.nVR.findUnique({ where: { id } });
    if (!nvr) return res.status(404).json({ error: 'NVR tidak ditemukan' });

    await logAudit(req.user.username, 'Manual Refresh', `Triggering manual polling for ${nvr.name}`, 'Info');

    if (nvr.type === 'pcnvr') {
      const updatedNvr = await prisma.nVR.update({
        where: { id },
        data: { last_heartbeat_at: new Date() }
      });
      return res.json({ success: true, nvr: updatedNvr });
    }

    const result = await pollNvrDevice(nvr, decryptPassword(nvr.password_encrypted));

    if (result.status === 'AUTH_FAILED' || result.status === 'NETWORK_TIMEOUT') {
      await prisma.channel.updateMany({
        where: { nvr_id: id },
        data: {
          last_status: result.status,
          last_recording_status: 'UNKNOWN',
          last_checked_at: new Date()
        }
      });
      await prisma.hDD.updateMany({
        where: { nvr_id: id },
        data: {
          status: 'error',
          last_checked_at: new Date()
        }
      });
    } else {
      if (result.channels && result.channels.length > 0) {
        await prisma.channel.deleteMany({ where: { nvr_id: id } });
        await prisma.channel.createMany({
          data: result.channels.map(c => ({
            nvr_id: id,
            channel_no: c.channel_no,
            camera_name: c.camera_name,
            last_status: c.last_status,
            last_recording_status: c.last_recording_status
          }))
        });
      }

      if (result.hdds && result.hdds.length > 0) {
        await prisma.hDD.deleteMany({ where: { nvr_id: id } });
        await prisma.hDD.createMany({
          data: result.hdds.map(h => ({
            nvr_id: id,
            disk_id: h.disk_id,
            capacity_mb: h.capacity_mb,
            freespace_mb: h.freespace_mb,
            status: h.status
          }))
        });
      }
    }

    res.json({ success: true, status: result.status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- TOKEN REGENERATION ---
router.post('/nvr/:id/regenerate-token', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const nvr = await prisma.nVR.findUnique({ where: { id } });
    if (!nvr || nvr.type !== 'pcnvr') {
      return res.status(400).json({ error: 'Device bukan PCNVR atau tidak ditemukan.' });
    }

    const newToken = crypto.randomBytes(16).toString('hex');
    const updated = await prisma.nVR.update({
      where: { id },
      data: {
        agent_token: newToken,
        rotated_at: new Date()
      }
    });

    await logAudit(req.user.username, 'Regenerate Agent Token', `Rotasi token agent untuk PCNVR: ${nvr.name}`, 'Warning');
    res.json({ agent_token: newToken, rotated_at: updated.rotated_at });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- PCNVR AGENT HOOKS (PUSH SYSTEM) ---
router.post('/agent/:nvr_id/heartbeat', authenticateAgentToken, async (req, res) => {
  const { nvr_id } = req.params;
  
  try {
    await prisma.nVR.update({
      where: { id: nvr_id },
      data: { last_heartbeat_at: new Date() }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/agent/:nvr_id/status', authenticateAgentToken, async (req, res) => {
  const { nvr_id } = req.params;
  const { channels, hdds } = req.body;

  try {
    if (channels && channels.length > 0) {
      await prisma.channel.deleteMany({ where: { nvr_id } });
      await prisma.channel.createMany({
        data: channels.map(c => ({
          nvr_id,
          channel_no: c.channel_no,
          camera_name: c.camera_name,
          last_status: c.last_status,
          last_recording_status: c.last_recording_status
        }))
      });
    }

    if (hdds && hdds.length > 0) {
      await prisma.hDD.deleteMany({ where: { nvr_id } });
      await prisma.hDD.createMany({
        data: hdds.map(h => ({
          nvr_id,
          disk_id: h.disk_id,
          capacity_mb: parseFloat(h.capacity_mb),
          freespace_mb: parseFloat(h.freespace_mb),
          status: h.status
        }))
      });
    }

    await prisma.nVR.update({
      where: { id: nvr_id },
      data: { last_heartbeat_at: new Date() }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
