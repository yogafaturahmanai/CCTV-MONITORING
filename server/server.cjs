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
        
        if (result.status === 'AUTH_FAILED' || result.status === 'NETWORK_TIMEOUT') {
          await prisma.channel.updateMany({
            where: { nvr_id: nvr.id },
            data: {
              last_status: result.status,
              last_recording_status: 'UNKNOWN',
              last_checked_at: new Date()
            }
          });
          await prisma.hDD.updateMany({
            where: { nvr_id: nvr.id },
            data: {
              status: 'error',
              last_checked_at: new Date()
            }
          });
        } else {
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
        }

        console.log(`[Scheduler] Polled NVR ${nvr.name} completed. Status: ${result.status}`);
      } else if (nvr.type === 'pcnvr') {
        if (nvr.last_heartbeat_at) {
          const lastHeartbeat = new Date(nvr.last_heartbeat_at);
          const diffSeconds = (new Date() - lastHeartbeat) / 1000;
          
          if (diffSeconds > 120) {
            // Update database status of channels to show offline/timeout
            await prisma.channel.updateMany({
              where: { nvr_id: nvr.id },
              data: {
                last_status: 'NETWORK_TIMEOUT',
                last_recording_status: 'UNKNOWN',
                last_checked_at: new Date()
              }
            });

            // Update database status of HDDs to show error/offline
            await prisma.hDD.updateMany({
              where: { nvr_id: nvr.id },
              data: {
                status: 'error',
                last_checked_at: new Date()
              }
            });

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

app.listen(PORT, async () => {
  console.log(`[Express Backend] Running on http://localhost:${PORT}`);

  // Run first poll immediately, then schedule every 60 seconds
  setTimeout(runNvrScheduler, 5000);
  setInterval(runNvrScheduler, 60000);
});
