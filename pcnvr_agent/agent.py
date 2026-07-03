import time
import requests
import psutil

# ==========================================
# KONFIGURASI DOKPLOY & PCNVR
# ==========================================
# Ganti dengan IP/Domain Dokploy server Anda. Jangan tambahkan slash (/) di akhir.
DOKPLOY_URL = "http://10.90.30.237:5000" 

# Ganti dengan ID PCNVR dan Token dari Dashboard
NVR_ID = "masukkan-nvr-id-dari-url-dashboard-disini"
AGENT_TOKEN = "masukkan-agent-token-dari-dashboard-disini"

# DAFTAR KAMERA YANG AKAN DIPING DARI PC INI
# Masukkan nama kamera dan IP address masing-masing kamera
CAMERAS = [
    { "channel_no": 1, "camera_name": "Lobby Camera", "ip": "10.90.10.101" },
    { "channel_no": 2, "camera_name": "Parking Camera", "ip": "10.90.10.102" },
    { "channel_no": 3, "camera_name": "Server Room Camera", "ip": "10.90.10.103" }
]
# ==========================================

import subprocess
import platform

def ping_ip(ip):
    """
    Fungsi ping untuk mengecek apakah IP Kamera aktif.
    """
    # Tentukan parameter ping berdasarkan Sistem Operasi (Windows vs Linux/Mac)
    param = '-n' if platform.system().lower() == 'windows' else '-c'
    command = ['ping', param, '1', '-w', '1000', ip]
    
    try:
        # Jalankan perintah ping di background
        return subprocess.call(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0
    except Exception:
        return False

def is_ivms_running():
    """
    Cek apakah software iVMS-4200 atau NVR berjalan di PC ini.
    Anda bisa menyesuaikan nama proses ('iVMS') dengan nama software CCTV yang dipakai.
    """
    for proc in psutil.process_iter(['name']):
        try:
            if 'iVMS' in proc.info['name'] or 'NVR' in proc.info['name']:
                return True
        except (psutil.NoSuchProcess, dbStatus := None, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return True 

def get_hdds():
    """
    Membaca otomatis partisi harddisk di PC Windows (C:\, D:\, E:\, dst)
    beserta sisa kapasitasnya untuk dilaporkan ke Dokploy.
    """
    hdds = []
    partitions = psutil.disk_partitions(all=False)
    for p in partitions:
        if 'cdrom' in p.opts or p.fstype == '':
            continue
        try:
            usage = psutil.disk_usage(p.mountpoint)
            hdds.append({
                "disk_id": p.device, # e.g. "C:\"
                "capacity_mb": usage.total / (1024 * 1024),
                "freespace_mb": usage.free / (1024 * 1024),
                "status": "normal"
            })
        except Exception:
            continue
    return hdds

def get_channels():
    """
    Mengecek status masing-masing kamera dengan metode PING IP.
    """
    channels_status = []
    ivms_active = is_ivms_running()

    # Jika aplikasi iVMS sendiri mati, otomatis semua kamera dianggap offline
    if not ivms_active:
        return [
            {
                "channel_no": cam["channel_no"],
                "camera_name": cam["camera_name"],
                "last_status": "OFFLINE",
                "last_recording_status": "NO_RECORDING"
            }
            for cam in CAMERAS
        ]

    for cam in CAMERAS:
        is_online = ping_ip(cam["ip"])
        channels_status.append({
            "channel_no": cam["channel_no"],
            "camera_name": cam["camera_name"],
            "last_status": "ONLINE" if is_online else "OFFLINE",
            "last_recording_status": "RECORDING" if is_online else "NO_RECORDING"
        })
        
    return channels_status

def send_heartbeat():
    url = f"{DOKPLOY_URL}/api/agent/{NVR_ID}/status"
    headers = {
        "Content-Type": "application/json",
        "X-Agent-Token": AGENT_TOKEN
    }
    
    payload = {
        "channels": get_channels(),
        "hdds": get_hdds()
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code == 200:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Heartbeat sukses terkirim ke Dokploy!")
        else:
            print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Gagal kirim heartbeat. Error Code: {response.status_code}")
            print("Response:", response.text)
    except Exception as e:
        print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] Server tidak dapat dijangkau: {e}")

if __name__ == "__main__":
    print("=======================================")
    print("      PCNVR Monitoring Agent v1.0      ")
    print("=======================================")
    print(f"Target Server : {DOKPLOY_URL}")
    print(f"NVR ID        : {NVR_ID}")
    print("Status        : BERJALAN")
    print("=======================================")
    print("Tekan Ctrl+C untuk mematikan agent.\n")
    
    while True:
        send_heartbeat()
        # Kirim data setiap 1 menit (60 detik)
        time.sleep(60)
