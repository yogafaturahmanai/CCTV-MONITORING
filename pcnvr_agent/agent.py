import time
import os
import glob
import requests
import psutil
import subprocess
import platform
from datetime import datetime, timedelta

# ==========================================
# KONFIGURASI DOKPLOY & PCNVR
# ==========================================
# Ganti dengan IP/Domain Dokploy server Anda. Jangan tambahkan slash (/) di akhir.
DOKPLOY_URL = "http://10.90.30.237:5000" 

# Ganti dengan ID PCNVR dan Token dari Dashboard
NVR_ID = "masukkan-nvr-id-dari-url-dashboard-disini"
AGENT_TOKEN = "masukkan-agent-token-dari-dashboard-disini"

# FALLBACK DAFTAR KAMERA JIKA listcam.csv TIDAK DITEMUKAN
CAMERAS_STATIC = [
    { "channel_no": 1, "camera_name": "Lobby Camera", "ip": "10.90.10.101" }
]

import csv

def get_cameras_list():
    """
    Membaca daftar kamera dari file listcam.csv secara otomatis.
    Jika file CSV tidak ditemukan, akan fallback menggunakan CAMERAS_STATIC.
    """
    csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "listcam.csv")
    if not os.path.exists(csv_path):
        return CAMERAS_STATIC

    cameras = []
    try:
        with open(csv_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for idx, row in enumerate(reader, start=1):
                # Bersihkan spasi atau karakter aneh dari nama kolom
                cleaned_row = {k.strip(): v.strip() for k, v in row.items() if k}
                ip = cleaned_row.get("IP Address")
                alias = cleaned_row.get("Alias")
                
                if ip:
                    cameras.append({
                        "channel_no": idx,
                        "camera_name": alias or f"Camera {ip}",
                        "ip": ip
                    })
    except Exception as e:
        print(f"[CSV Error] Gagal membaca listcam.csv: {e}")
        return CAMERAS_STATIC
        
    return cameras

# PATH FOLDER RECORDING IVMS
# Daftar semua folder RecordFile dari drive penyimpanan PC ini.
# Agent akan memeriksa apakah ada file yang aktif ditulis di folder hari ini.
RECORDING_PATHS = [
    r"D:\RecordFile",
    r"E:\RecordFile"
]

# Batas waktu (detik) untuk menentukan apakah file sedang aktif direkam.
# Jika file terakhir dimodifikasi kurang dari RECORDING_THRESHOLD detik yang lalu, 
# maka dianggap sedang RECORDING.
RECORDING_THRESHOLD = 120  # 2 menit
# ==========================================


def ping_ip(ip):
    """
    Fungsi ping untuk mengecek apakah IP Kamera aktif.
    """
    param = '-n' if platform.system().lower() == 'windows' else '-c'
    command = ['ping', param, '1', '-w', '1000', ip]
    
    try:
        return subprocess.call(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0
    except Exception:
        return False


def is_ivms_running():
    """
    Cek apakah software iVMS-4200 atau NVR berjalan di PC ini.
    """
    for proc in psutil.process_iter(['name']):
        try:
            name = proc.info.get('name', '')
            if name and ('iVMS' in name or 'NVR' in name):
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    return True


def check_recording_active():
    """
    Memeriksa apakah iVMS sedang aktif merekam dengan cara:
    1. Cek folder recording hari ini (format: YYYYMMDD)
    2. Scan file terbaru di dalamnya
    3. Jika ada file yang dimodifikasi dalam RECORDING_THRESHOLD detik terakhir -> RECORDING
    
    Returns: True jika sedang recording, False jika tidak
    """
    today_folder = datetime.now().strftime("%Y%m%d")
    now = time.time()
    
    for rec_path in RECORDING_PATHS:
        today_path = os.path.join(rec_path, today_folder)
        
        if not os.path.exists(today_path):
            continue
        
        # Cari semua file di folder hari ini (termasuk subfolder)
        try:
            for root, dirs, files in os.walk(today_path):
                for f in files:
                    filepath = os.path.join(root, f)
                    try:
                        mtime = os.path.getmtime(filepath)
                        # Jika file dimodifikasi kurang dari threshold detik yang lalu
                        if (now - mtime) < RECORDING_THRESHOLD:
                            return True
                    except OSError:
                        continue
        except Exception:
            continue
    
    return False


def check_camera_recording(cam_ip):
    """
    Memeriksa apakah kamera tertentu sedang direkam oleh iVMS.
    Mencari folder/file yang mengandung IP kamera di dalam folder recording hari ini.
    Jika tidak ditemukan folder spesifik per-kamera, fallback ke status recording umum.
    
    Returns: True jika kamera ini sedang direkam, False jika tidak
    """
    today_folder = datetime.now().strftime("%Y%m%d")
    now = time.time()
    
    # Format IP untuk pencarian (ganti . dengan _ karena beberapa software pakai format itu)
    ip_variants = [cam_ip, cam_ip.replace(".", "_")]
    
    for rec_path in RECORDING_PATHS:
        today_path = os.path.join(rec_path, today_folder)
        
        if not os.path.exists(today_path):
            continue
        
        # Cari folder/file yang mengandung IP kamera
        try:
            for root, dirs, files in os.walk(today_path):
                # Cek apakah nama folder atau file mengandung IP kamera
                current_folder = os.path.basename(root)
                folder_matches = any(ip_var in current_folder for ip_var in ip_variants)
                
                if folder_matches:
                    # Folder spesifik kamera ditemukan, cek file terbaru di dalamnya
                    for f in files:
                        filepath = os.path.join(root, f)
                        try:
                            mtime = os.path.getmtime(filepath)
                            if (now - mtime) < RECORDING_THRESHOLD:
                                return True
                        except OSError:
                            continue
                    # Folder ditemukan tapi tidak ada file baru = tidak recording
                    return False
                
                # Juga cek nama file yang mengandung IP kamera
                for f in files:
                    if any(ip_var in f for ip_var in ip_variants):
                        filepath = os.path.join(root, f)
                        try:
                            mtime = os.path.getmtime(filepath)
                            if (now - mtime) < RECORDING_THRESHOLD:
                                return True
                        except OSError:
                            continue
        except Exception:
            continue
    
    # Jika tidak ditemukan folder/file spesifik per IP kamera,
    # fallback: gunakan status recording umum (apakah ada file APAPUN yang ditulis)
    return None  # None = tidak diketahui per-kamera


def get_hdds():
    """
    Membaca otomatis partisi harddisk di PC Windows beserta sisa kapasitasnya.
    Hanya melaporkan drive yang digunakan untuk penyimpanan rekaman CCTV (ada di RECORDING_PATHS).
    """
    hdds = []
    
    # Ambil drive letter unik dari RECORDING_PATHS (misal: "D:", "E:")
    valid_drives = set()
    for path in RECORDING_PATHS:
        drive = os.path.splitdrive(path)[0].upper()
        if drive:
            valid_drives.add(drive)

    partitions = psutil.disk_partitions(all=False)
    for p in partitions:
        if 'cdrom' in p.opts or p.fstype == '':
            continue
            
        # Dapatkan drive letter dari mountpoint (misal: "C:", "D:")
        mount_drive = os.path.splitdrive(p.mountpoint)[0].upper()
        if mount_drive not in valid_drives:
            continue  # Lewati jika drive ini bukan tempat penyimpanan iVMS (seperti C:\)

        try:
            usage = psutil.disk_usage(p.mountpoint)
            hdds.append({
                "disk_id": p.device,
                "capacity_mb": usage.total / (1024 * 1024),
                "freespace_mb": usage.free / (1024 * 1024),
                "status": "normal"
            })
        except Exception:
            continue
    return hdds


def get_channels():
    """
    Mengecek status masing-masing kamera:
    1. Ping IP -> Online / Offline
    2. Cek file recording di disk -> Recording / No Recording
    """
    channels_status = []
    ivms_active = is_ivms_running()

    cameras = get_cameras_list()

    # Jika aplikasi iVMS sendiri mati, otomatis semua kamera dianggap offline
    if not ivms_active:
        return [
            {
                "channel_no": cam["channel_no"],
                "camera_name": cam["camera_name"],
                "last_status": "OFFLINE",
                "last_recording_status": "NO_RECORDING"
            }
            for cam in cameras
        ]

    # Cek status recording umum (fallback jika per-kamera tidak terdeteksi)
    global_recording = check_recording_active()

    for cam in cameras:
        is_online = ping_ip(cam["ip"])
        
        # Tentukan status recording
        if not is_online:
            rec_status = "NO_RECORDING"
        else:
            # Coba deteksi per-kamera dulu
            cam_recording = check_camera_recording(cam["ip"])
            
            if cam_recording is True:
                rec_status = "RECORDING"
            elif cam_recording is False:
                rec_status = "NO_RECORDING"
            else:
                # Fallback: gunakan status recording umum
                rec_status = "RECORDING" if global_recording else "NO_RECORDING"

        channels_status.append({
            "channel_no": cam["channel_no"],
            "camera_name": cam["camera_name"],
            "last_status": "ONLINE" if is_online else "OFFLINE",
            "last_recording_status": rec_status
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
    print("      PCNVR Monitoring Agent v2.0      ")
    print("=======================================")
    print(f"Target Server    : {DOKPLOY_URL}")
    print(f"NVR ID           : {NVR_ID}")
    print(f"Recording Paths  : {RECORDING_PATHS}")
    print(f"Cameras          : {len(get_cameras_list())} unit")
    print("Status           : BERJALAN")
    print("=======================================")
    print("Tekan Ctrl+C untuk mematikan agent.\n")
    
    while True:
        send_heartbeat()
        # Kirim data setiap 15 detik untuk realtime update
        time.sleep(15)
