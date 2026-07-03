const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const routes = require('./routes.cjs');
const { pollNvrDevice } = require('./isapiClient.cjs');

const path = require('path');
const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// API base routing
app.use('/api', routes);

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  });
}

// background scheduler for NVR polling & heartbeat checks
const runNvrScheduler = async () => {
  console.log('[Scheduler] Running NVR periodic status check...');
  
  try {
    const nvrs = await prisma.nVR.findMany({ where: { is_active: true } });
    
    for (const nvr of nvrs) {
      if (nvr.type === 'hardware_nvr') {
        const result = await pollNvrDevice(nvr, decryptPassword(nvr.password_encrypted));
        
        if (result.channels && result.channels.length > 0) {
          await prisma.channel.deleteMany({ where: { nvr_id: nvr.id } });
          await prisma.channel.createMany({
            data: result.channels.map(c => ({
              nvr_id: nvr.id,
              channel_no: c.channel_no,
              camera_name: c.camera_name,
              last_status: c.last_status,
              last_recording_status: c.last_recording_status
            }))
          });
        }

        if (result.hdds && result.hdds.length > 0) {
          await prisma.hDD.deleteMany({ where: { nvr_id: nvr.id } });
          await prisma.hDD.createMany({
            data: result.hdds.map(h => ({
              nvr_id: nvr.id,
              disk_id: h.disk_id,
              capacity_mb: h.capacity_mb,
              freespace_mb: h.freespace_mb,
              status: h.status
            }))
          });
        }

        console.log(`[Scheduler] Polled NVR ${nvr.name} successfully. Status: ${result.status}`);
      } else if (nvr.type === 'pcnvr') {
        if (nvr.last_heartbeat_at) {
          const lastHeartbeat = new Date(nvr.last_heartbeat_at);
          const diffSeconds = (new Date() - lastHeartbeat) / 1000;
          
          if (diffSeconds > 120) {
            await prisma.auditLog.create({
              data: {
                username: 'system',
                action: 'Agent Stale',
                details: `Agent untuk PCNVR ${nvr.name} tidak heartbeat melebihi 120 detik.`,
                severity: 'Warning'
              }
            });
            console.log(`[Scheduler] PCNVR Agent ${nvr.name} marked stale.`);
          }
        }
      }
    }
  } catch (error) {
    console.error('[Scheduler Error]', error.message);
  }
};

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

// Seed initial database items if NVR table is empty
const seedDatabase = async () => {
  const count = await prisma.nVR.count();
  if (count === 0) {
    console.log('[DB Seed] Seeding initial CCTV NVR dashboard records...');

    // NVR 1
    const nvr1 = await prisma.nVR.create({
      data: {
        name: "NVR Head Office Main",
        site: "Head Office",
        type: "hardware_nvr",
        ip_address: "10.90.10.50",
        port: 80,
        protocol: "http",
        username: "admin",
        password_encrypted: "enc_YWRtaW4xMjM="
      }
    });

    await prisma.channel.createMany({
      data: [
        { nvr_id: nvr1.id, channel_no: 1, camera_name: "Lobby Front Desk", last_status: "ONLINE", last_recording_status: "RECORDING" },
        { nvr_id: nvr1.id, channel_no: 2, camera_name: "Server Room Rack A", last_status: "ONLINE", last_recording_status: "RECORDING" },
        { nvr_id: nvr1.id, channel_no: 3, camera_name: "Back Exit Door", last_status: "OFFLINE", last_recording_status: "NO_RECORDING" },
        { nvr_id: nvr1.id, channel_no: 4, camera_name: "Parking Area North", last_status: "ONLINE", last_recording_status: "RECORDING" }
      ]
    });

    await prisma.hDD.createMany({
      data: [
        { nvr_id: nvr1.id, disk_id: "1", capacity_mb: 4000000, freespace_mb: 250000, status: "normal" },
        { nvr_id: nvr1.id, disk_id: "2", capacity_mb: 4000000, freespace_mb: 180000, status: "normal" }
      ]
    });

    // NVR 2
    const nvr2 = await prisma.nVR.create({
      data: {
        name: "NVR Site Cikupa Logistics",
        site: "Cikupa Site",
        type: "hardware_nvr",
        ip_address: "10.92.30.22",
        port: 443,
        protocol: "https",
        username: "admin_cikupa",
        password_encrypted: "enc_Y2lrdXBhMTIz"
      }
    });

    await prisma.channel.createMany({
      data: [
        { nvr_id: nvr2.id, channel_no: 1, camera_name: "Loading Dock 1", last_status: "ONLINE", last_recording_status: "RECORDING" },
        { nvr_id: nvr2.id, channel_no: 2, camera_name: "Loading Dock 2", last_status: "VIDEO_LOSS", last_recording_status: "NO_RECORDING" },
        { nvr_id: nvr2.id, channel_no: 3, camera_name: "Warehouse Row B", last_status: "ONLINE", last_recording_status: "RECORDING" }
      ]
    });

    await prisma.hDD.create({
      data: { nvr_id: nvr2.id, disk_id: "1", capacity_mb: 8000000, freespace_mb: 32000, status: "normal" }
    });

    // PCNVR 3
    const nvr3 = await prisma.nVR.create({
      data: {
        name: "PCNVR Server Finance",
        site: "Head Office",
        type: "pcnvr",
        ip_address: "10.90.10.88",
        port: 8000,
        protocol: "http",
        username: "pcnvr_admin",
        password_encrypted: "enc_ZmluYW5jZTEyMw==",
        agent_token: "d2d14fbf75949d63c5a6be4e3f3b9cde",
        rotated_at: new Date(),
        last_heartbeat_at: new Date()
      }
    });

    await prisma.channel.createMany({
      data: [
        { nvr_id: nvr3.id, channel_no: 1, camera_name: "Finance Room Vault", last_status: "ONLINE", last_recording_status: "RECORDING" },
        { nvr_id: nvr3.id, channel_no: 2, camera_name: "Finance Desk Row A", last_status: "ONLINE", last_recording_status: "RECORDING" }
      ]
    });

    await prisma.hDD.createMany({
      data: [
        { nvr_id: nvr3.id, disk_id: "C:/", capacity_mb: 500000, freespace_mb: 120000, status: "normal" },
        { nvr_id: nvr3.id, disk_id: "D:/Recording", capacity_mb: 2000000, freespace_mb: 50000, status: "normal" }
      ]
    });

    // NVR 4
    const nvr4 = await prisma.nVR.create({
      data: {
        name: "NVR Warehouse Cakung",
        site: "Cakung Site",
        type: "hardware_nvr",
        ip_address: "10.95.12.15",
        port: 80,
        protocol: "http",
        username: "admin_cakung",
        password_encrypted: "enc_Y2FrdW5nMTIz"
      }
    });

    await prisma.channel.createMany({
      data: [
        { nvr_id: nvr4.id, channel_no: 1, camera_name: "Guard Post", last_status: "NETWORK_TIMEOUT", last_recording_status: "UNKNOWN" },
        { nvr_id: nvr4.id, channel_no: 2, camera_name: "Main Perimeter Gate", last_status: "NETWORK_TIMEOUT", last_recording_status: "UNKNOWN" }
      ]
    });

    await prisma.hDD.create({
      data: { nvr_id: nvr4.id, disk_id: "1", capacity_mb: 4000000, freespace_mb: 0, status: "error" }
    });

    // Audit logs seeding
    await prisma.auditLog.createMany({
      data: [
        { timestamp: new Date(Date.now() - 7200000), username: "admin", action: "Login", details: "User admin logged in from 10.90.30.22", severity: "Info" },
        { timestamp: new Date(Date.now() - 3600000), username: "admin", action: "Tambah NVR", details: "Menambahkan PCNVR Server Finance (10.90.10.88)", severity: "Info" },
        { timestamp: new Date(Date.now() - 1800000), username: "system", action: "Worker Polling", details: "NVR Warehouse Cakung (10.95.12.15) offline/unreachable", severity: "Critical" }
      ]
    });

    console.log('[DB Seed] Complete.');
  }
};

app.listen(PORT, async () => {
  console.log(`[Express Backend] Running on http://localhost:${PORT}`);
  
  await seedDatabase();

  setInterval(runNvrScheduler, 60000);
});
