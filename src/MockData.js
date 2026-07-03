// Mock Data Store with LocalStorage Persistence & Status Definitions
// Based on section 6 (Data Model) and section 13 (State Definition) of PRD

const INITIAL_NVRS = [
  {
    id: "nvr-1",
    name: "NVR Head Office Main",
    site: "Head Office",
    type: "hardware_nvr",
    ip_address: "10.90.10.50",
    port: 80,
    protocol: "http",
    username: "admin",
    is_active: true,
    created_at: "2026-06-01T08:00:00Z",
    updated_at: "2026-07-03T12:00:00Z",
  },
  {
    id: "nvr-2",
    name: "NVR Site Cikupa Logistics",
    site: "Cikupa Site",
    type: "hardware_nvr",
    ip_address: "10.92.30.22",
    port: 443,
    protocol: "https",
    username: "admin_cikupa",
    is_active: true,
    created_at: "2026-06-05T09:30:00Z",
    updated_at: "2026-07-03T12:30:00Z",
  },
  {
    id: "nvr-3",
    name: "PCNVR Server Finance",
    site: "Head Office",
    type: "pcnvr",
    ip_address: "10.90.10.88",
    port: 8000,
    protocol: "http",
    username: "pcnvr_admin",
    is_active: true,
    agent_token: "d2d14fbf75949d63c5a6be4e3f3b9cde", // 32-char hex
    rotated_at: "2026-06-10T11:00:00Z",
    last_heartbeat_at: "2026-07-03T13:03:50+07:00",
    created_at: "2026-06-10T11:00:00Z",
    updated_at: "2026-07-03T13:03:50+07:00",
  },
  {
    id: "nvr-4",
    name: "NVR Warehouse Cakung",
    site: "Cakung Site",
    type: "hardware_nvr",
    ip_address: "10.95.12.15",
    port: 80,
    protocol: "http",
    username: "admin_cakung",
    is_active: true,
    created_at: "2026-06-15T14:00:00Z",
    updated_at: "2026-07-03T12:45:00Z",
  },
  {
    id: "nvr-5",
    name: "PCNVR Site Surabaya Gate",
    site: "Surabaya Site",
    type: "pcnvr",
    ip_address: "10.98.5.40",
    port: 8000,
    protocol: "http",
    username: "srv_gate",
    is_active: true,
    agent_token: "a1b2c3d4e5f67890123456789abcdef0",
    rotated_at: "2026-06-20T10:00:00Z",
    last_heartbeat_at: "2026-07-03T13:00:00+07:00", // Will trigger AGENT_STALE (>120s)
    created_at: "2026-06-20T10:00:00Z",
    updated_at: "2026-07-03T13:00:00+07:00",
  }
];

const INITIAL_CHANNELS = [
  // NVR 1 (Head Office Main)
  { id: "ch-1-1", nvr_id: "nvr-1", channel_no: 1, camera_name: "Lobby Front Desk", last_status: "ONLINE", last_recording_status: "RECORDING", last_checked_at: "2026-07-03T13:04:00+07:00" },
  { id: "ch-1-2", nvr_id: "nvr-1", channel_no: 2, camera_name: "Server Room Rack A", last_status: "ONLINE", last_recording_status: "RECORDING", last_checked_at: "2026-07-03T13:04:00+07:00" },
  { id: "ch-1-3", nvr_id: "nvr-1", channel_no: 3, camera_name: "Back Exit Door", last_status: "OFFLINE", last_recording_status: "NO_RECORDING", last_checked_at: "2026-07-03T13:04:00+07:00" },
  { id: "ch-1-4", nvr_id: "nvr-1", channel_no: 4, camera_name: "Parking Area North", last_status: "ONLINE", last_recording_status: "RECORDING", last_checked_at: "2026-07-03T13:04:00+07:00" },

  // NVR 2 (Cikupa Logistics)
  { id: "ch-2-1", nvr_id: "nvr-2", channel_no: 1, camera_name: "Loading Dock 1", last_status: "ONLINE", last_recording_status: "RECORDING", last_checked_at: "2026-07-03T13:04:00+07:00" },
  { id: "ch-2-2", nvr_id: "nvr-2", channel_no: 2, camera_name: "Loading Dock 2", last_status: "VIDEO_LOSS", last_recording_status: "NO_RECORDING", last_checked_at: "2026-07-03T13:04:00+07:00" },
  { id: "ch-2-3", nvr_id: "nvr-2", channel_no: 3, camera_name: "Warehouse Row B", last_status: "ONLINE", last_recording_status: "RECORDING", last_checked_at: "2026-07-03T13:04:00+07:00" },

  // PCNVR 3 (Finance Head Office)
  { id: "ch-3-1", nvr_id: "nvr-3", channel_no: 1, camera_name: "Finance Room Vault", last_status: "ONLINE", last_recording_status: "RECORDING", last_checked_at: "2026-07-03T13:04:00+07:00" },
  { id: "ch-3-2", nvr_id: "nvr-3", channel_no: 2, camera_name: "Finance Desk Row A", last_status: "ONLINE", last_recording_status: "RECORDING", last_checked_at: "2026-07-03T13:04:00+07:00" },

  // NVR 4 (Warehouse Cakung - Simulated offline)
  { id: "ch-4-1", nvr_id: "nvr-4", channel_no: 1, camera_name: "Guard Post", last_status: "NETWORK_TIMEOUT", last_recording_status: "UNKNOWN", last_checked_at: "2026-07-03T13:04:00+07:00" },
  { id: "ch-4-2", nvr_id: "nvr-4", channel_no: 2, camera_name: "Main Perimeter Gate", last_status: "NETWORK_TIMEOUT", last_recording_status: "UNKNOWN", last_checked_at: "2026-07-03T13:04:00+07:00" },

  // PCNVR 5 (Surabaya Gate - Stale Agent)
  { id: "ch-5-1", nvr_id: "nvr-5", channel_no: 1, camera_name: "Entrance Barrier", last_status: "UNKNOWN", last_recording_status: "UNKNOWN", last_checked_at: "2026-07-03T13:00:00+07:00" }
];

const INITIAL_HDDS = [
  // NVR 1
  { id: "hdd-1-1", nvr_id: "nvr-1", disk_id: "1", capacity_mb: 4000000, freespace_mb: 250000, status: "normal", last_checked_at: "2026-07-03T13:04:00+07:00" },
  { id: "hdd-1-2", nvr_id: "nvr-1", disk_id: "2", capacity_mb: 4000000, freespace_mb: 180000, status: "normal", last_checked_at: "2026-07-03T13:04:00+07:00" },

  // NVR 2
  { id: "hdd-2-1", nvr_id: "nvr-2", disk_id: "1", capacity_mb: 8000000, freespace_mb: 32000, status: "normal", last_checked_at: "2026-07-03T13:04:00+07:00" }, // > 90% full: warning

  // PCNVR 3
  { id: "hdd-3-1", nvr_id: "nvr-3", disk_id: "C:/", capacity_mb: 500000, freespace_mb: 120000, status: "normal", last_checked_at: "2026-07-03T13:04:00+07:00" },
  { id: "hdd-3-2", nvr_id: "nvr-3", disk_id: "D:/Recording", capacity_mb: 2000000, freespace_mb: 50000, status: "normal", last_checked_at: "2026-07-03T13:04:00+07:00" },

  // NVR 4
  { id: "hdd-4-1", nvr_id: "nvr-4", disk_id: "1", capacity_mb: 4000000, freespace_mb: 0, status: "error", last_checked_at: "2026-07-03T13:04:00+07:00" }, // Error/Disk Full

  // PCNVR 5
  { id: "hdd-5-1", nvr_id: "nvr-5", disk_id: "C:/", capacity_mb: 1000000, freespace_mb: 450000, status: "uninitialized", last_checked_at: "2026-07-03T13:00:00+07:00" }
];

const INITIAL_AUDIT_LOGS = [
  { id: "log-1", timestamp: "2026-07-03T11:00:00Z", username: "admin", action: "Login", details: "User admin logged in from 10.90.30.22", severity: "Info" },
  { id: "log-2", timestamp: "2026-07-03T12:00:00Z", username: "admin", action: "Tambah NVR", details: "Menambahkan PCNVR Server Finance (10.90.10.88)", severity: "Info" },
  { id: "log-3", timestamp: "2026-07-03T12:15:00Z", username: "system", action: "Worker Polling", details: "NVR Warehouse Cakung (10.95.12.15) offline/unreachable", severity: "Critical" },
  { id: "log-4", timestamp: "2026-07-03T12:30:00Z", username: "admin", action: "Regenerate Agent Token", details: "Regenerated token for PCNVR Site Surabaya Gate", severity: "Warning" }
];

// Helper to seed localStorage
const getStorageItem = (key, initial) => {
  const data = localStorage.getItem(key);
  if (!data) {
    localStorage.setItem(key, JSON.stringify(initial));
    return initial;
  }
  return JSON.parse(data);
};

const setStorageItem = (key, data) => {
  localStorage.setItem(key, JSON.stringify(data));
};

export const initializeMockData = () => {
  getStorageItem("cctv_nvrs", INITIAL_NVRS);
  getStorageItem("cctv_channels", INITIAL_CHANNELS);
  getStorageItem("cctv_hdds", INITIAL_HDDS);
  getStorageItem("cctv_audit_logs", INITIAL_AUDIT_LOGS);
};

export const getMockData = () => {
  return {
    nvrs: getStorageItem("cctv_nvrs", INITIAL_NVRS),
    channels: getStorageItem("cctv_channels", INITIAL_CHANNELS),
    hdds: getStorageItem("cctv_hdds", INITIAL_HDDS),
    auditLogs: getStorageItem("cctv_audit_logs", INITIAL_AUDIT_LOGS)
  };
};

export const saveMockData = ({ nvrs, channels, hdds, auditLogs }) => {
  if (nvrs) setStorageItem("cctv_nvrs", nvrs);
  if (channels) setStorageItem("cctv_channels", channels);
  if (hdds) setStorageItem("cctv_hdds", hdds);
  if (auditLogs) setStorageItem("cctv_audit_logs", auditLogs);
};

// Simulated actions
export const addNvr = (nvrData) => {
  const { nvrs, channels, hdds, auditLogs } = getMockData();
  const newNvr = {
    ...nvrData,
    id: `nvr-${Date.now()}`,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  if (newNvr.type === "pcnvr") {
    newNvr.agent_token = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
    newNvr.rotated_at = new Date().toISOString();
    newNvr.last_heartbeat_at = new Date().toISOString();
  }

  const updatedNvrs = [...nvrs, newNvr];

  // Seed default 2 channels for the new NVR
  const updatedChannels = [
    ...channels,
    { id: `ch-${Date.now()}-1`, nvr_id: newNvr.id, channel_no: 1, camera_name: "Default Channel 1", last_status: "ONLINE", last_recording_status: "RECORDING", last_checked_at: new Date().toISOString() },
    { id: `ch-${Date.now()}-2`, nvr_id: newNvr.id, channel_no: 2, camera_name: "Default Channel 2", last_status: "ONLINE", last_recording_status: "RECORDING", last_checked_at: new Date().toISOString() }
  ];

  // Seed default 1 HDD for the new NVR
  const updatedHdds = [
    ...hdds,
    { id: `hdd-${Date.now()}-1`, nvr_id: newNvr.id, disk_id: newNvr.type === "pcnvr" ? "D:/" : "1", capacity_mb: 2000000, freespace_mb: 1500000, status: "normal", last_checked_at: new Date().toISOString() }
  ];

  const updatedLogs = [
    {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      username: "admin",
      action: "Tambah NVR",
      details: `Menambahkan ${newNvr.type === 'pcnvr' ? 'PCNVR' : 'NVR'} ${newNvr.name} (${newNvr.ip_address})`,
      severity: "Info"
    },
    ...auditLogs
  ];

  saveMockData({ nvrs: updatedNvrs, channels: updatedChannels, hdds: updatedHdds, auditLogs: updatedLogs });
  return getMockData();
};

export const updateNvr = (id, nvrData) => {
  const { nvrs, auditLogs } = getMockData();
  const updatedNvrs = nvrs.map(n => {
    if (n.id === id) {
      return { ...n, ...nvrData, updated_at: new Date().toISOString() };
    }
    return n;
  });

  const updatedLogs = [
    {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      username: "admin",
      action: "Edit NVR",
      details: `Mengedit data NVR ID: ${id}`,
      severity: "Info"
    },
    ...auditLogs
  ];

  saveMockData({ nvrs: updatedNvrs, auditLogs: updatedLogs });
  return getMockData();
};

export const deleteNvr = (id) => {
  const { nvrs, channels, hdds, auditLogs } = getMockData();
  const targetNvr = nvrs.find(n => n.id === id);
  const updatedNvrs = nvrs.filter(n => n.id !== id);
  const updatedChannels = channels.filter(c => c.nvr_id !== id);
  const updatedHdds = hdds.filter(h => h.nvr_id !== id);

  const updatedLogs = [
    {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      username: "admin",
      action: "Hapus NVR",
      details: `Menghapus NVR: ${targetNvr?.name || id} (Cascade channels & HDD)`,
      severity: "Warning"
    },
    ...auditLogs
  ];

  saveMockData({ nvrs: updatedNvrs, channels: updatedChannels, hdds: updatedHdds, auditLogs: updatedLogs });
  return getMockData();
};

export const regenerateToken = (id) => {
  const { nvrs, auditLogs } = getMockData();
  const updatedNvrs = nvrs.map(n => {
    if (n.id === id) {
      return {
        ...n,
        agent_token: Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
        rotated_at: new Date().toISOString()
      };
    }
    return n;
  });

  const targetNvr = nvrs.find(n => n.id === id);
  const updatedLogs = [
    {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      username: "admin",
      action: "Regenerate Agent Token",
      details: `Rotasi token agent untuk PCNVR: ${targetNvr?.name}`,
      severity: "Warning"
    },
    ...auditLogs
  ];

  saveMockData({ nvrs: updatedNvrs, auditLogs: updatedLogs });
  return getMockData();
};

// Simulation of a polling run or random changes
export const simulateLiveStatusUpdate = () => {
  const { nvrs, channels, hdds, auditLogs } = getMockData();

  // Randomly toggle one channel status or edit free space slightly to show live updates
  let updatedLogs = [...auditLogs];
  const updatedChannels = channels.map(c => {
    // 10% chance to toggle status on active, reachable NVRs
    const parentNvr = nvrs.find(n => n.id === c.nvr_id);
    if (parentNvr && parentNvr.ip_address !== "10.95.12.15" && Math.random() < 0.1) {
      const nextStatus = c.last_status === "ONLINE" ? "OFFLINE" : "ONLINE";
      const nextRec = nextStatus === "ONLINE" ? "RECORDING" : "NO_RECORDING";
      
      updatedLogs = [{
        id: `log-${Date.now()}-${Math.random()}`,
        timestamp: new Date().toISOString(),
        username: "system",
        action: "Status Kamera Berubah",
        details: `Kamera [${c.camera_name}] di [${parentNvr.name}] menjadi ${nextStatus}`,
        severity: nextStatus === "ONLINE" ? "Info" : "Critical"
      }, ...updatedLogs];

      return {
        ...c,
        last_status: nextStatus,
        last_recording_status: nextRec,
        last_checked_at: new Date().toISOString()
      };
    }
    return c;
  });

  // Modify free space slightly (recreate realistic disk filling)
  const updatedHdds = hdds.map(h => {
    if (h.status === "normal" && Math.random() < 0.2) {
      const change = Math.floor(Math.random() * 500) + 100; // Reduce free space
      const newFree = Math.max(0, h.freespace_mb - change);
      return {
        ...h,
        freespace_mb: newFree,
        last_checked_at: new Date().toISOString()
      };
    }
    return h;
  });

  saveMockData({ channels: updatedChannels, hdds: updatedHdds, auditLogs: updatedLogs.slice(0, 100) });
  return getMockData();
};
