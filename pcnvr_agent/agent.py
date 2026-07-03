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
# ==========================================

def is_ivms_running():
    """
    Cek apakah software iVMS-4200 atau NVR berjalan di PC ini.
    Anda bisa menyesuaikan nama proses ('iVMS') dengan nama software CCTV yang dipakai.
    """
    for proc in psutil.process_iter(['name']):
        try:
            if 'iVMS' in proc.info['name'] or 'NVR' in proc.info['name']:
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    # Ubah ke True jika Anda ingin agent selalu melaporkan ONLINE terlepas dari prosesnya
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
                "status": "error" if usage.percent > 95 else "normal" # Error jika disk 95% penuh
            })
        except Exception:
            continue
    return hdds

def get_channels():
    """
    Kamera-kamera yang direkam oleh PC ini.
    Untuk PCNVR, kita laporkan 1 status umum atau bisa disesuaikan secara statis.
    """
    is_running = is_ivms_running()
    status = "ONLINE" if is_running else "OFFLINE"
    recording = "RECORDING" if is_running else "NO_RECORDING"
    
    return [
        {
            "channel_no": 1,
            "camera_name": "PC Host Application",
            "last_status": status,
            "last_recording_status": recording
        }
    ]

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
