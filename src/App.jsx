import React, { useState, useEffect } from 'react';
import atiLogo from './assets/atilogo.png';
import cctvIcon from './assets/cctvicon.png';

export default function App() {
  // Auth state
  const [token, setToken] = useState(() => localStorage.getItem('cctv_token') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!localStorage.getItem('cctv_token'));
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(null);

  // App data states
  const [nvrs, setNvrs] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' or 'audit'

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSite, setSelectedSite] = useState('All Sites');
  const [selectedType, setSelectedType] = useState('All Types');

  // Modals state
  const [isNvrModalOpen, setIsNvrModalOpen] = useState(false);
  const [editingNvr, setEditingNvr] = useState(null); // null for new, nvr object for edit
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedNvrId, setSelectedNvrId] = useState(null);
  const [selectedNvrChannels, setSelectedNvrChannels] = useState([]);
  const [selectedNvrHdds, setSelectedNvrHdds] = useState([]);
  const [detailTab, setDetailTab] = useState('cameras'); // 'cameras' or 'hdd'
  const [isPollingActive, setIsPollingActive] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [tokenModalNvr, setTokenModalNvr] = useState(null);

  // Telegram report & service state
  const [isTelegramSending, setIsTelegramSending] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [isTelegramActive, setIsTelegramActive] = useState(true);

  // Email report & service state
  const [isEmailSending, setIsEmailSending] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null);
  const [isEmailActive, setIsEmailActive] = useState(true);

  // Fetch service statuses
  const fetchServiceStatuses = async () => {
    if (!token) return;
    try {
      const response = await fetch('/api/settings/services', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setIsTelegramActive(data.telegramActive);
        setIsEmailActive(data.emailActive);
      }
    } catch (e) {
      console.error('Error fetching service statuses:', e);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchServiceStatuses();
    }
  }, [isAuthenticated, activeTab]);

  // Toggle Telegram Service
  const toggleTelegramService = async () => {
    try {
      const response = await fetch('/api/telegram/toggle', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setIsTelegramActive(data.telegramActive);
      }
    } catch (e) {
      console.error('Error toggling Telegram service:', e);
    }
  };

  // Toggle Email Service
  const toggleEmailService = async () => {
    try {
      const response = await fetch('/api/email/toggle', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setIsEmailActive(data.emailActive);
      }
    } catch (e) {
      console.error('Error toggling Email service:', e);
    }
  };

  // Form states
  const [nvrFormName, setNvrFormName] = useState('');
  const [nvrFormSite, setNvrFormSite] = useState('');
  const [nvrFormType, setNvrFormType] = useState('hardware_nvr');
  const [nvrFormIp, setNvrFormIp] = useState('');
  const [nvrFormPort, setNvrFormPort] = useState('80');
  const [nvrFormProtocol, setNvrFormProtocol] = useState('http');
  const [nvrFormUsername, setNvrFormUsername] = useState('admin');
  const [nvrFormPassword, setNvrFormPassword] = useState('');
  const [formError, setFormError] = useState('');

  // Fetch dashboard data helper
  const fetchDashboardData = async (jwtToken) => {
    const activeToken = jwtToken || token;
    if (!activeToken) return;

    try {
      const response = await fetch('/api/dashboard', {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });
      if (response.ok) {
        const result = await response.json();
        setNvrs(result.nvrs || []);
        setAuditLogs(result.auditLogs || []);
      } else if (response.status === 401 || response.status === 403) {
        handleLogout();
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    }
  };

  // Fetch channels & HDD details for NVR modal
  const fetchNvrDetails = async (nvrId) => {
    if (!token || !nvrId) return;

    try {
      const chRes = await fetch(`/api/nvr/${nvrId}/channels`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const hddRes = await fetch(`/api/nvr/${nvrId}/hdd`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (chRes.ok && hddRes.ok) {
        const channels = await chRes.json();
        const hdds = await hddRes.json();
        setSelectedNvrChannels(channels);
        setSelectedNvrHdds(hdds);
      }
    } catch (err) {
      console.error('Failed to fetch NVR details:', err);
    }
  };

  // Initial load
  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboardData();
    }
  }, [isAuthenticated]);

  // Trigger load on modal select
  useEffect(() => {
    if (selectedNvrId) {
      fetchNvrDetails(selectedNvrId);
    }
  }, [selectedNvrId]);

  // Periodic polling check every 30s
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, token]);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutTime === null) return;
    if (lockoutTime <= 0) {
      setLockoutTime(null);
      setLoginAttempts(0);
      setLoginError('');
      return;
    }
    const timer = setTimeout(() => {
      setLockoutTime(lockoutTime - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [lockoutTime]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (lockoutTime !== null) return;

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const result = await response.json();
        setToken(result.token);
        setIsAuthenticated(true);
        localStorage.setItem('cctv_token', result.token);
        setLoginError('');
        setLoginAttempts(0);
        fetchDashboardData(result.token);
      } else {
        const errResult = await response.json();
        const nextAttempts = loginAttempts + 1;
        setLoginAttempts(nextAttempts);
        if (nextAttempts >= 5) {
          setLockoutTime(10);
          setLoginError('Terlalu banyak percobaan salah. Akun terkunci selama 10 detik.');
        } else {
          setLoginError(errResult.error || `Username atau Password salah! Percobaan tersisa: ${5 - nextAttempts}`);
        }
      }
    } catch (err) {
      setLoginError('Koneksi ke backend gagal. Pastikan backend server aktif!');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setToken('');
    localStorage.removeItem('cctv_token');
    setUsername('');
    setPassword('');
  };

  const handleManualTriggerSimulation = async () => {
    // Just trigger a general reload from DB
    await fetchDashboardData();
  };

  // Open Form for Adding NVR
  const openAddNvrModal = () => {
    setEditingNvr(null);
    setNvrFormName('');
    setNvrFormSite('Head Office');
    setNvrFormType('hardware_nvr');
    setNvrFormIp('');
    setNvrFormPort('80');
    setNvrFormProtocol('http');
    setNvrFormUsername('admin');
    setNvrFormPassword('');
    setFormError('');
    setIsNvrModalOpen(true);
  };

  // Open Form for Editing NVR
  const openEditNvrModal = (nvr) => {
    setEditingNvr(nvr);
    setNvrFormName(nvr.name);
    setNvrFormSite(nvr.site);
    setNvrFormType(nvr.type);
    setNvrFormIp(nvr.ip_address);
    setNvrFormPort(nvr.port.toString());
    setNvrFormProtocol(nvr.protocol);
    setNvrFormUsername(nvr.username);
    setNvrFormPassword(''); // Old password stays hidden
    setFormError('');
    setIsNvrModalOpen(true);
  };

  // Handle NVR Save (Create or Update)
  const handleSaveNvr = async (e) => {
    e.preventDefault();

    if (!nvrFormName || !nvrFormIp || !nvrFormPort) {
      setFormError('Semua field wajib diisi!');
      return;
    }

    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(nvrFormIp)) {
      setFormError('Format IP Address tidak valid (e.g. 10.90.30.22)');
      return;
    }

    const portNum = parseInt(nvrFormPort, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setFormError('Port harus angka antara 1 - 65535');
      return;
    }

    // Duplicate local check (backend will also validate)
    const isDuplicate = nvrs.some(n =>
      n.ip_address === nvrFormIp &&
      n.port === portNum &&
      (!editingNvr || editingNvr.id !== n.id)
    );

    if (isDuplicate) {
      setFormError('IP Address dan Port ini sudah digunakan oleh NVR lain.');
      return;
    }

    const nvrPayload = {
      name: nvrFormName,
      site: nvrFormSite,
      type: nvrFormType,
      ip_address: nvrFormIp,
      port: portNum,
      protocol: nvrFormProtocol,
      username: nvrFormUsername,
    };

    if (nvrFormPassword) {
      nvrPayload.password_encrypted = `enc_${btoa(nvrFormPassword)}`;
    }

    try {
      const url = editingNvr ? `/api/nvr/${editingNvr.id}` : '/api/nvr';
      const method = editingNvr ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(nvrPayload)
      });

      if (response.ok) {
        setIsNvrModalOpen(false);
        fetchDashboardData();
      } else {
        const err = await response.json();
        setFormError(err.error || 'Gagal menyimpan konfigurasi NVR.');
      }
    } catch (err) {
      setFormError('Koneksi ke backend gagal saat menyimpan.');
    }
  };

  const handleDeleteNvr = async (id) => {
    if (window.confirm('Apakah Anda yakin ingin menghapus NVR ini beserta seluruh data channel dan storage terkait?')) {
      try {
        const response = await fetch(`/api/nvr/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          setIsDetailModalOpen(false);
          fetchDashboardData();
        }
      } catch (err) {
        console.error('Delete request failed:', err);
      }
    }
  };

  const handleRegenerateToken = async (id) => {
    if (window.confirm('PERINGATAN: Mengganti token agent akan memutuskan koneksi Agent PCNVR yang aktif sampai token baru dimasukkan ke konfigurasi Agent. Lanjutkan?')) {
      try {
        const response = await fetch(`/api/nvr/${id}/regenerate-token`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const result = await response.json();
          const target = nvrs.find(n => n.id === id);
          setTokenModalNvr({ ...target, agent_token: result.agent_token });
          setIsTokenModalOpen(true);
          fetchDashboardData();
        }
      } catch (err) {
        console.error('Token regeneration failed:', err);
      }
    }
  };

  // Manual trigger polling in details view
  const handleManualRefreshNvr = async (id) => {
    setIsPollingActive(true);
    try {
      const response = await fetch(`/api/nvr/${id}/poll`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        await fetchNvrDetails(id);
        fetchDashboardData();
      }
    } catch (err) {
      console.error('Manual polling failed:', err);
    } finally {
      setIsPollingActive(false);
    }
  };

  // Telegram: Kirim laporan manual
  const sendTelegramReport = async () => {
    setIsTelegramSending(true);
    setTelegramStatus(null);
    try {
      const response = await fetch('/api/telegram/report', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setTelegramStatus('ok');
      } else {
        setTelegramStatus('error');
      }
    } catch (err) {
      setTelegramStatus('error');
    } finally {
      setIsTelegramSending(false);
      setTimeout(() => setTelegramStatus(null), 4000);
    }
  };

  // Telegram: Test koneksi bot
  const testTelegramBot = async () => {
    setIsTelegramSending(true);
    setTelegramStatus(null);
    try {
      const response = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setTelegramStatus('ok');
      } else {
        setTelegramStatus('error');
      }
    } catch (err) {
      setTelegramStatus('error');
    } finally {
      setIsTelegramSending(false);
      setTimeout(() => setTelegramStatus(null), 4000);
    }
  };

  // Email: Kirim laporan manual
  const sendEmailReport = async () => {
    setIsEmailSending(true);
    setEmailStatus(null);
    try {
      const response = await fetch('/api/email/report', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setEmailStatus('ok');
      } else {
        setEmailStatus('error');
      }
    } catch (err) {
      setEmailStatus('error');
    } finally {
      setIsEmailSending(false);
      setTimeout(() => setEmailStatus(null), 4000);
    }
  };

  // Email: Test koneksi SMTP
  const testEmailSMTP = async () => {
    setIsEmailSending(true);
    setEmailStatus(null);
    try {
      const response = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        setEmailStatus('ok');
      } else {
        setEmailStatus('error');
      }
    } catch (err) {
      setEmailStatus('error');
    } finally {
      setIsEmailSending(false);
      setTimeout(() => setEmailStatus(null), 4000);
    }
  };

  // Derived states / Analytics calculations
  const totalNvrs = nvrs.length;

  // Channels metrics (computed from NVR relationships)
  let totalChannels = 0;
  let onlineCameras = 0;
  let offlineCameras = 0;
  let errorHdds = 0;

  nvrs.forEach(nvr => {
    if (nvr.channels) {
      totalChannels += nvr.channels.length;
      nvr.channels.forEach(ch => {
        if (ch.last_status === 'ONLINE') onlineCameras++;
        else offlineCameras++;
      });
    }
    if (nvr.hdds) {
      nvr.hdds.forEach(hdd => {
        if (hdd.status === 'error') errorHdds++;
      });
    }
  });

  // Group NVRs and HDDs by Site for the top Site Storage Overview section
  const siteStorageOverview = React.useMemo(() => {
    const siteMap = {};
    nvrs.forEach(nvr => {
      const siteName = nvr.site || 'Unassigned Site';
      if (!siteMap[siteName]) {
        siteMap[siteName] = {
          siteName,
          nvrsCount: 0,
          totalCapacityMb: 0,
          totalFreeMb: 0,
          hdds: []
        };
      }
      siteMap[siteName].nvrsCount += 1;

      (nvr.hdds || []).forEach(hdd => {
        const capacity = hdd.capacity_mb || 0;
        const free = hdd.freespace_mb || 0;
        siteMap[siteName].totalCapacityMb += capacity;
        siteMap[siteName].totalFreeMb += free;
        siteMap[siteName].hdds.push({
          ...hdd,
          nvrName: nvr.name,
          nvrIp: nvr.ip_address,
          nvrType: nvr.type,
          nvrId: nvr.id
        });
      });
    });
    return Object.values(siteMap);
  }, [nvrs]);

  // Unique sites for filtering
  const sitesList = ['All Sites', ...new Set(nvrs.map(n => n.site))];

  // Map NVR overall status based on its channels & heartbeat
  const getNvrStatus = (nvr) => {
    if (nvr.type === 'pcnvr') {
      if (nvr.last_heartbeat_at) {
        const lastHeartbeat = new Date(nvr.last_heartbeat_at);
        const now = new Date();
        const diffSeconds = Math.abs(now - lastHeartbeat) / 1000;
        if (diffSeconds > 40) {
          return 'stale'; // AGENT_STALE
        }
      } else {
        return 'offline'; // AGENT_OFFLINE
      }
    }

    if (!nvr.channels || nvr.channels.length === 0) return 'online';

    const isAllOffline = nvr.channels.every(c => c.last_status !== 'ONLINE');
    if (isAllOffline) return 'offline';

    const hasSomeOffline = nvr.channels.some(c => c.last_status !== 'ONLINE');
    if (hasSomeOffline) return 'partial';

    return 'online';
  };

  // Filtered NVR list
  const filteredNvrs = nvrs.filter(nvr => {
    const matchesSearch = nvr.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      nvr.ip_address.includes(searchQuery);
    const matchesSite = selectedSite === 'All Sites' || nvr.site === selectedSite;
    const matchesType = selectedType === 'All Types' || nvr.type === selectedType;
    return matchesSearch && matchesSite && matchesType;
  });

  // Target NVR Details
  const selectedNvr = nvrs.find(n => n.id === selectedNvrId);

  // Toggle password visibility in Login
  const [showPassword, setShowPassword] = useState(false);

  // Render Login page if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="login-wrapper">
        <div className="login-container">
          
          {/* Left Panel: Blue Gradient Banner */}
          <div className="login-banner-panel">
            <div className="banner-top-icon">
              <img src={cctvIcon} alt="CCTV Monitoring Icon" className="banner-cctv-img" />
            </div>

            <div className="banner-text-content">
              <h2 className="banner-title">
                IT Operations CCTV Monitoring Center
              </h2>
              <p className="banner-description">
                Centralized NVR Monitoring, Storage Retention &amp; Video Loss Alert Platform.
              </p>
              
              <div className="banner-compliance-tag">
                <span className="dot-indicator"></span>
                <span>IT Operations • CCTV Security &amp; Compliance</span>
              </div>
            </div>
          </div>

          {/* Right Panel: Clean White Login Form */}
          <div className="login-form-panel">
            <div className="login-header-logo">
              <img src={atiLogo} alt="ATI Business Group Logo" className="ati-company-logo-img" />
            </div>

            <div className="login-heading-group">
              <h1 className="login-welcome-title">Welcome Back.</h1>
              <p className="login-welcome-subtitle">Silahkan login</p>
            </div>

            <form onSubmit={handleLogin} className="login-form">
              <div className="login-input-group">
                <label className="login-label">Username</label>
                <div className="input-icon-wrapper">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <input
                    type="text"
                    className="login-input"
                    placeholder="nama.pengguna"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={lockoutTime !== null}
                  />
                </div>
              </div>

              <div className="login-input-group">
                <label className="login-label">Password</label>
                <div className="input-icon-wrapper">
                  <svg className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                  <input
                    type={showPassword ? "text" : "password"}
                    className="login-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={lockoutTime !== null}
                  />
                  <button
                    type="button"
                    className="eye-toggle-btn"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {loginError && (
                <div className="login-error-message">
                  ⚠️ {loginError}
                  {lockoutTime !== null && (
                    <span style={{ fontWeight: 'bold', display: 'block', marginTop: '0.25rem' }}>
                      Tunggu {lockoutTime}s...
                    </span>
                  )}
                </div>
              )}

              <button
                type="submit"
                className="login-submit-btn"
                disabled={lockoutTime !== null}
              >
                <span>Masuk Sistem</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="btn-arrow-icon">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </button>
            </form>

            <div className="login-footer" style={{ justifyContent: 'flex-end' }}>
              <span className="login-portal-tag">IT Operations Portal</span>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-app-shell">
      {/* LEFT SIDEBAR NAVIGATION */}
      <aside className="app-sidebar">
        <div className="sidebar-brand">
          <img src={atiLogo} alt="ATI Logo" className="sidebar-logo-img" />
          <div className="brand-text">
            <span className="brand-title">ATI MONITORING</span>
            <span className="brand-sub">IT Operations Platform</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <span className="nav-icon">📊</span>
            <span className="nav-label">Dashboard</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <span className="nav-icon">📋</span>
            <span className="nav-label">Audit Logs</span>
          </button>

          <button
            className="nav-item"
            onClick={openAddNvrModal}
          >
            <span className="nav-icon">➕</span>
            <span className="nav-label">Register new NVR</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span className="nav-label">Settings</span>
          </button>
        </nav>

        {/* Sidebar User Profile Footer */}
        <div className="sidebar-user-footer">
          <div className="user-avatar-badge">AD</div>
          <div className="user-info-text">
            <span className="user-name">Admin User</span>
            <span className="user-role">IT Operations Admin</span>
          </div>
          <button className="sidebar-logout-btn" onClick={handleLogout} title="Logout">
            🚪
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="app-main-content">
        {/* TOP HEADER BAR */}
        <header className="main-top-header">
          <div className="top-search-box">
            <span className="search-lens-icon">🔍</span>
            <input
              type="text"
              className="top-search-input"
              placeholder="Cari NVR Nama, IP Address, atau Site..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="top-header-filters">
            <select
              className="top-select-dropdown"
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
            >
              {sitesList.map(site => (
                <option key={site} value={site}>{site}</option>
              ))}
            </select>

            <select
              className="top-select-dropdown"
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
            >
              <option value="All Types">All Types</option>
              <option value="hardware_nvr">Hardware NVR</option>
              <option value="pcnvr">PCNVR (PC-based)</option>
            </select>

            <button
              className="top-refresh-btn"
              onClick={handleManualTriggerSimulation}
              title="Refresh database status NVR &amp; HDD"
            >
              🔄 Refresh DB
            </button>
          </div>
        </header>

        {/* DASHBOARD TAB CONTENT */}
        {activeTab === 'dashboard' && (
          <div className="dashboard-content-wrapper">
            
            {/* HERO PANEL: SITE TOPOLOGY STATUS MAP HUB & ALERTS (Reference Top Area) */}
            <div className="hero-hub-container">
              {/* Left Hero Card: Site Topology Map Hub */}
              <div className="hero-hub-card map-topology-card">
                <div className="card-top-header">
                  <div>
                    <h3>🗺️ Site Network Topology &amp; Status Hub</h3>
                    <p>Status NVR &amp; konektivitas server real-time di seluruh site ATI</p>
                  </div>
                  <span className="live-status-pill">● LIVE MONITORING</span>
                </div>

                <div className="site-topology-nodes-grid">
                  {siteStorageOverview.map(siteItem => {
                    const siteNvrs = nvrs.filter(n => (n.site || 'Unassigned Site') === siteItem.siteName);
                    const hasOffline = siteNvrs.some(n => getNvrStatus(n) === 'offline');
                    const hasStale = siteNvrs.some(n => getNvrStatus(n) === 'stale');
                    let healthStatus = 'online';
                    if (hasOffline) healthStatus = 'offline';
                    else if (hasStale) healthStatus = 'stale';

                    return (
                      <div
                        key={siteItem.siteName}
                        className={`topology-site-node health-${healthStatus}`}
                        onClick={() => setSelectedSite(siteItem.siteName)}
                        title={`Filter site: ${siteItem.siteName}`}
                      >
                        <div className="node-indicator">
                          {healthStatus === 'online' ? '🟢' : healthStatus === 'stale' ? '🟡' : '🔴'}
                        </div>
                        <div className="node-details">
                          <strong>{siteItem.siteName}</strong>
                          <span>{siteItem.nvrsCount} Device NVR</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Hero Card: Alerts & Notifications */}
              <div className="hero-hub-card alerts-summary-card">
                <div className="card-top-header">
                  <h3>🔔 Alerts &amp; System Health</h3>
                </div>

                <div className="alerts-stack">
                  <div className="alert-row warning">
                    <div className="alert-icon-box">💾</div>
                    <div className="alert-text">
                      <strong>{errorHdds} Disk Need Attention</strong>
                      <p>Kapasitas &gt;90% atau terdeteksi error</p>
                    </div>
                  </div>

                  <div className="alert-row critical">
                    <div className="alert-icon-box">🔴</div>
                    <div className="alert-text">
                      <strong>{offlineCameras} Kamera Offline</strong>
                      <p>Dari total {totalChannels} channel terdaftar</p>
                    </div>
                  </div>

                  <div className="alert-row success">
                    <div className="alert-icon-box">🟢</div>
                    <div className="alert-text">
                      <strong>{onlineCameras} Kamera Streaming Online</strong>
                      <p>Terhubung di {totalNvrs} NVR device</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* MIDDLE ROW: HDD DETAILS (LEFT) & CAMERA CAPACITY RATIO (RIGHT) */}
            <div className="middle-row-container">
              {/* Left Middle Card: HDD Details (Shipment details in reference) */}
              <div className="middle-card hdd-details-card">
                <div className="card-top-header">
                  <div>
                    <h3>💾 HDD Details (Free Space Per Disk)</h3>
                    <p>Daftar rincian harddisk, terpakai, dan sisa kapasitas free space per site</p>
                  </div>
                </div>

                <div className="hdd-table-responsive-wrapper">
                  <table className="modern-hdd-table">
                    <thead>
                      <tr>
                        <th>NVR / Disk ID</th>
                        <th>Kapasitas</th>
                        <th>Terpakai</th>
                        <th>Sisa Free Space</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {siteStorageOverview.map(site => {
                        // Group hdds by NVR within this site
                        const nvrMap = {};
                        site.hdds.forEach(hdd => {
                          if (!nvrMap[hdd.nvrId]) {
                            nvrMap[hdd.nvrId] = { nvrName: hdd.nvrName, nvrIp: hdd.nvrIp, disks: [] };
                          }
                          nvrMap[hdd.nvrId].disks.push(hdd);
                        });
                        const nvrGroups = Object.entries(nvrMap);

                        const siteTotalFreeGb = (site.totalFreeMb / 1024).toFixed(1);
                        const siteTotalCapGb = (site.totalCapacityMb / 1024).toFixed(1);
                        const isSiteLow = site.totalCapacityMb > 0 && (site.totalFreeMb / site.totalCapacityMb) < 0.1;

                        return (
                          <>
                            {/* ── SITE HEADER ROW ── */}
                            <tr key={`site-hdr-${site.siteName}`} className="hdd-site-group-header">
                              <td colSpan="5">
                                <div className="hdd-site-group-title">
                                  <span className="hdd-site-pin">📍</span>
                                  <strong>{site.siteName}</strong>
                                  <span className="hdd-site-meta">{site.nvrsCount} NVR Device</span>
                                  <span className="hdd-site-summary">
                                    Total Sisa:&nbsp;
                                    <strong className={isSiteLow ? 'free-text-warning' : 'free-text-good'}>
                                      {siteTotalFreeGb} GB
                                    </strong>
                                    <span className="hdd-site-cap"> / {siteTotalCapGb} GB</span>
                                  </span>
                                </div>
                              </td>
                            </tr>

                            {nvrGroups.length === 0 && (
                              <tr key={`${site.siteName}-empty`}>
                                <td colSpan="5" className="hdd-empty-site-row">
                                  Belum ada data HDD terdeteksi di site ini.
                                </td>
                              </tr>
                            )}

                            {/* ── Per-NVR group ── */}
                            {nvrGroups.map(([nvrId, nvrData]) => (
                              <>
                                {/* NVR Sub-header */}
                                <tr key={`nvr-hdr-${nvrId}`} className="hdd-nvr-subheader">
                                  <td colSpan="5">
                                    <div className="hdd-nvr-title">
                                      <span className="hdd-nvr-icon">🖥️</span>
                                      <strong>{nvrData.nvrName}</strong>
                                      <span className="nvr-ip-sub">({nvrData.nvrIp})</span>
                                    </div>
                                  </td>
                                </tr>

                                {/* Disk Rows */}
                                {nvrData.disks.map((hdd, idx) => {
                                  const usedMb = (hdd.capacity_mb || 0) - (hdd.freespace_mb || 0);
                                  const usagePct = hdd.capacity_mb > 0 ? Math.round((usedMb / hdd.capacity_mb) * 100) : 0;
                                  const freeGb = ((hdd.freespace_mb || 0) / 1024).toFixed(1);
                                  const capGb = ((hdd.capacity_mb || 0) / 1024).toFixed(1);
                                  const usedGb = (usedMb / 1024).toFixed(1);

                                  let hddSeverity = 'online';
                                  if (hdd.status === 'error') hddSeverity = 'offline';
                                  else if (usagePct > 90) hddSeverity = 'warning';

                                  return (
                                    <tr key={`${nvrId}-${hdd.disk_id}-${idx}`} className="hdd-disk-row">
                                      <td>
                                        <code className="disk-code">{hdd.disk_id}</code>
                                      </td>
                                      <td>{capGb} GB</td>
                                      <td>
                                        <div className="usage-bar-cell">
                                          <span>{usedGb} GB ({usagePct}%)</span>
                                          <div className="mini-progress-track">
                                            <div
                                              className={`mini-progress-fill ${hddSeverity}`}
                                              style={{ width: `${usagePct}%` }}
                                            ></div>
                                          </div>
                                        </div>
                                      </td>
                                      <td>
                                        <strong className={usagePct > 90 ? 'free-text-warning' : 'free-text-good'}>
                                          {freeGb} GB
                                        </strong>
                                      </td>
                                      <td>
                                        <span className={`indicator-dot ${hddSeverity}`}></span>
                                        <span className="hdd-status-text">{hdd.status || 'Normal'}</span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </>
                            ))}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>



              {/* Right Middle Card: Camera Operational Capacity (Current Truck Capacity in reference) */}
              <div className="middle-card camera-capacity-card">
                <div className="card-top-header">
                  <h3>🎥 Camera Online Ratio</h3>
                </div>

                <div className="capacity-visual-content">
                  <div className="capacity-big-percentage">
                    {totalChannels > 0 ? Math.round((onlineCameras / totalChannels) * 100) : 0}%
                  </div>
                  <p className="capacity-sublabel">Streaming Cameras Efficiency</p>

                  <div className="capacity-progress-track">
                    <div
                      className="capacity-progress-fill"
                      style={{ width: `${totalChannels > 0 ? (onlineCameras / totalChannels) * 100 : 0}%` }}
                    ></div>
                  </div>

                  <div className="capacity-breakdown-row">
                    <div className="breakdown-item online">
                      <span className="dot">●</span>
                      <span>Online ({onlineCameras})</span>
                    </div>
                    <div className="breakdown-item offline">
                      <span className="dot">●</span>
                      <span>Offline ({offlineCameras})</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* BOTTOM SECTION: ALL SITE & NVR CARDS GRID */}
            <div className="bottom-nvr-section">
              <div className="section-title-bar">
                <h2>📹 Devices &amp; NVR Server List</h2>
                <p>Klik button Detail View pada card device untuk melihat seluruh data NVR/PC IVMS di site tersebut</p>
              </div>

              <div className="nvr-cards-grid">
                {filteredNvrs.map(nvr => {
                  const status = getNvrStatus(nvr);
                  const nvrHdds = nvr.hdds || [];
                  const nvrChannels = nvr.channels || [];
                  const offlineCount = nvrChannels.filter(c => c.last_status !== 'ONLINE').length;

                  return (
                    <div key={nvr.id} className={`nvr-device-card status-${status}`}>
                      <div className="device-card-header">
                        <div>
                          <h3 className="device-name">{nvr.name}</h3>
                          <span className="device-site-tag">{nvr.site}</span>
                        </div>
                        <span className={`status-badge ${status}`}>
                          {status === 'stale' ? 'AGENT STALE' : status}
                        </span>
                      </div>

                      <div className="device-card-body">
                        <div className="meta-info-row">
                          <span className="meta-label">IP Address</span>
                          <strong className="meta-val">{nvr.ip_address}:{nvr.port}</strong>
                        </div>

                        <div className="meta-info-row">
                          <span className="meta-label">Kamera</span>
                          <strong className="meta-val">{nvrChannels.length - offlineCount} / {nvrChannels.length} Online</strong>
                        </div>

                        <div className="meta-info-row">
                          <span className="meta-label">Tipe Server</span>
                          <span className="meta-type">{nvr.type === 'pcnvr' ? 'PCNVR (PC-based)' : 'Hardware NVR'}</span>
                        </div>
                      </div>

                      <div className="device-card-actions">
                        <button
                          className="btn btn-primary detail-btn"
                          onClick={() => {
                            setSelectedNvrId(nvr.id);
                            setIsDetailModalOpen(true);
                            setDetailTab('cameras');
                          }}
                        >
                          🔍 Detail View
                        </button>
                        <button
                          className="btn btn-secondary edit-btn"
                          onClick={() => openEditNvrModal(nvr)}
                        >
                          ✏️ Edit
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredNvrs.length === 0 && (
                  <div className="empty-grid-msg">
                    <h3>NVR Tidak Ditemukan</h3>
                    <p>Silakan sesuaikan filter pencarian atau buat registrasi NVR baru.</p>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* SETTINGS TAB CONTENT */}
        {activeTab === 'settings' && (
          <div className="settings-content-wrapper">
            <div className="section-title-bar">
              <h2>⚙️ System Integration &amp; Service Controls</h2>
              <p>Kelola status service background, notifikasi alarm otomatis, test Bot Telegram, dan SMTP Email</p>
            </div>

            {/* SERVICE START / STOP CONTROLS SECTION */}
            <div className="service-control-banner">
              <div className="service-control-card">
                <div className="service-header-row">
                  <div className="service-info">
                    <span className="service-icon">🤖</span>
                    <div>
                      <h4>Telegram Bot Service</h4>
                      <span className={`service-status-badge ${isTelegramActive ? 'active' : 'stopped'}`}>
                        {isTelegramActive ? '🟢 Service Active (Berjalan)' : '🔴 Service Stopped (Non-Aktif)'}
                      </span>
                    </div>
                  </div>
                  <button
                    className={`btn ${isTelegramActive ? 'btn-danger' : 'btn-primary'} service-toggle-btn`}
                    onClick={toggleTelegramService}
                  >
                    {isTelegramActive ? '🛑 Stop Service Telegram' : '▶️ Start Service Telegram'}
                  </button>
                </div>
                <p className="service-desc">
                  {isTelegramActive
                    ? 'Service Telegram bot sedang aktif mendengarkan perintah & pengiriman notifikasi alarm harian.'
                    : 'Service Telegram bot di-stop. Pengiriman laporan otomatis & command handler Telegram dinonaktifkan.'}
                </p>
              </div>

              <div className="service-control-card">
                <div className="service-header-row">
                  <div className="service-info">
                    <span className="service-icon">📧</span>
                    <div>
                      <h4>Email Alert Service (SMTP)</h4>
                      <span className={`service-status-badge ${isEmailActive ? 'active' : 'stopped'}`}>
                        {isEmailActive ? '🟢 Service Active (Berjalan)' : '🔴 Service Stopped (Non-Aktif)'}
                      </span>
                    </div>
                  </div>
                  <button
                    className={`btn ${isEmailActive ? 'btn-danger' : 'btn-primary'} service-toggle-btn`}
                    onClick={toggleEmailService}
                  >
                    {isEmailActive ? '🛑 Stop Service Email' : '▶️ Start Service Email'}
                  </button>
                </div>
                <p className="service-desc">
                  {isEmailActive
                    ? 'Service email alert SMTP aktif mengirimkan email otomatis ketika ada kamera offline / HDD penuh.'
                    : 'Service email alert di-stop. Seluruh pengiriman laporan harian HTML & email darurat ditangguhkan.'}
                </p>
              </div>
            </div>

            {/* ACTION TOOLS GRID */}
            <div className="section-title-bar" style={{ marginTop: '1rem' }}>
              <h3>🛠️ Manual Test &amp; Trigger Tools</h3>
            </div>

            <div className="settings-grid-container">
              <div className="settings-tool-card">
                <div className="tool-icon">🤖</div>
                <h3>Test Bot Telegram</h3>
                <p>Kirim notifikasi ping verifikasi ke Bot Telegram CCTV Monitoring</p>
                <button
                  className="btn btn-secondary tool-btn"
                  onClick={testTelegramBot}
                  disabled={isTelegramSending || !isTelegramActive}
                >
                  {isTelegramSending ? '⏳ Mengirim...' : 'Jalankan Test Bot'}
                </button>
                {!isTelegramActive && <span className="tool-status error">⚠️ Service Telegram Di-stop</span>}
                {telegramStatus === 'ok' && <span className="tool-status success">✅ Terhubung ke Telegram!</span>}
                {telegramStatus === 'error' && <span className="tool-status error">❌ Gagal Terhubung!</span>}
              </div>

              <div className="settings-tool-card">
                <div className="tool-icon">📨</div>
                <h3>Kirim Laporan Telegram</h3>
                <p>Trigger pengiriman ringkasan status NVR &amp; HDD ke Telegram sekarang</p>
                <button
                  className="btn btn-primary tool-btn"
                  onClick={sendTelegramReport}
                  disabled={isTelegramSending || !isTelegramActive}
                >
                  {isTelegramSending ? '⏳ Memproses...' : 'Kirim Laporan Telegram'}
                </button>
                {!isTelegramActive && <span className="tool-status error">⚠️ Service Telegram Di-stop</span>}
              </div>

              <div className="settings-tool-card">
                <div className="tool-icon">📧</div>
                <h3>Test SMTP Email</h3>
                <p>Uji koneksi autentikasi server email notifikasi alarm</p>
                <button
                  className="btn btn-secondary tool-btn"
                  onClick={testEmailSMTP}
                  disabled={isEmailSending || !isEmailActive}
                >
                  {isEmailSending ? '⏳ Mengirim...' : 'Jalankan Test SMTP'}
                </button>
                {!isEmailActive && <span className="tool-status error">⚠️ Service Email Di-stop</span>}
                {emailStatus === 'ok' && <span className="tool-status success">✅ SMTP Email Normal!</span>}
                {emailStatus === 'error' && <span className="tool-status error">❌ Error Koneksi SMTP!</span>}
              </div>

              <div className="settings-tool-card">
                <div className="tool-icon">📩</div>
                <h3>Kirim Email Laporan</h3>
                <p>Kirim laporan HTML lengkap ke daftar penerima email yang dikonfigurasi</p>
                <button
                  className="btn btn-primary tool-btn"
                  onClick={sendEmailReport}
                  disabled={isEmailSending || !isEmailActive}
                >
                  {isEmailSending ? '⏳ Memproses...' : 'Kirim Email Laporan'}
                </button>
                {!isEmailActive && <span className="tool-status error">⚠️ Service Email Di-stop</span>}
              </div>
            </div>
          </div>
        )}

        {/* AUDIT LOGS TAB CONTENT */}
        {activeTab === 'audit' && (
          <div className="audit-content-wrapper">
            <div className="section-title-bar">
              <h2>📋 Audit Logs Aktivitas System</h2>
              <p>Riwayat aktivitas sistem &amp; perubahan konfigurasi (Retention: 90 Hari)</p>
            </div>

            <div className="audit-table-card">
              <div className="details-table-wrapper">
                <table className="details-table">
                  <thead>
                    <tr>
                      <th>Waktu (WIB)</th>
                      <th>User</th>
                      <th>Aksi</th>
                      <th>Detail Aktivitas</th>
                      <th>Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map(log => (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {new Date(log.timestamp).toLocaleString('id-ID')}
                        </td>
                        <td><strong>{log.username}</strong></td>
                        <td style={{ color: '#2563eb' }}>{log.action}</td>
                        <td>{log.details}</td>
                        <td>
                          <span className={`log-severity ${log.severity}`}>
                            {log.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL DETAIL DEVICE */}
      {isDetailModalOpen && selectedNvr && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <div>
                <h2>{selectedNvr.name}</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  {selectedNvr.ip_address}:{selectedNvr.port} &bull; {selectedNvr.site} &bull; {selectedNvr.type === 'pcnvr' ? 'PCNVR Agent Model' : 'ISAPI Polling Model'}
                </p>
                {selectedNvr.type === 'pcnvr' && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-tertiary)', padding: '0.25rem 0.5rem', borderRadius: '4px', width: 'fit-content' }}>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>NVR ID: {selectedNvr.id}</span>
                    <button
                      style={{ background: 'rgba(20,24,31,0.08)', border: 'none', borderRadius: '3px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.7rem', padding: '2px 6px' }}
                      onClick={() => {
                        navigator.clipboard.writeText(selectedNvr.id);
                        alert('NVR ID disalin ke clipboard!');
                      }}
                    >
                      📋 Copy ID
                    </button>
                  </div>
                )}
              </div>
              <button className="modal-close" onClick={() => setIsDetailModalOpen(false)}>&times;</button>
            </div>

            <div className="modal-body">
              <div className="modal-tabs">
                <button
                  className={`tab-btn ${detailTab === 'cameras' ? 'active' : ''}`}
                  onClick={() => setDetailTab('cameras')}
                >
                  🎥 Status Kamera & Recording ({selectedNvrChannels.length})
                </button>
                <button
                  className={`tab-btn ${detailTab === 'hdd' ? 'active' : ''}`}
                  onClick={() => setDetailTab('hdd')}
                >
                  💾 HDD Storage ({selectedNvrHdds.length})
                </button>
              </div>

              {detailTab === 'cameras' ? (
                <div className="details-table-wrapper">
                  <table className="details-table">
                    <thead>
                      <tr>
                        <th>Channel</th>
                        <th>Nama Kamera</th>
                        <th>Status Kamera</th>
                        <th>Recording Status</th>
                        <th>Terakhir Dicek</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedNvrChannels.map(ch => {
                        const isOnline = ch.last_status === 'ONLINE';
                        const isRec = ch.last_recording_status === 'RECORDING';
                        return (
                          <tr key={ch.id}>
                            <td>CH-{ch.channel_no}</td>
                            <td><strong>{ch.camera_name}</strong></td>
                            <td>
                              <span className={`indicator-dot ${isOnline ? 'online' : 'offline'}`}></span>
                              {ch.last_status}
                            </td>
                            <td>
                              <span className={`indicator-dot ${isRec ? 'online' : ch.last_recording_status === 'UNKNOWN' ? 'muted' : 'warning'}`}></span>
                              {ch.last_recording_status}
                            </td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              {new Date(ch.last_checked_at).toLocaleTimeString()}
                            </td>
                          </tr>
                        );
                      })}
                      {selectedNvrChannels.length === 0 && (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            Tidak ada channel terdaftar.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="details-table-wrapper">
                  <table className="details-table">
                    <thead>
                      <tr>
                        <th>Disk ID</th>
                        <th>Kapasitas</th>
                        <th>Terpakai</th>
                        <th>Sisa Space</th>
                        <th>Status HDD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedNvrHdds.map(hdd => {
                        const usedMb = hdd.capacity_mb - hdd.freespace_mb;
                        const usagePct = Math.round((usedMb / hdd.capacity_mb) * 100);
                        let hddStatusClass = 'online';
                        if (hdd.status === 'error') hddStatusClass = 'offline';
                        else if (hdd.status === 'uninitialized') hddStatusClass = 'warning';

                        return (
                          <tr key={hdd.id}>
                            <td><strong>Disk {hdd.disk_id}</strong></td>
                            <td>{(hdd.capacity_mb / 1024).toFixed(1)} GB</td>
                            <td>{(usedMb / 1024).toFixed(1)} GB ({usagePct}%)</td>
                            <td>{(hdd.freespace_mb / 1024).toFixed(1)} GB</td>
                            <td>
                              <span className={`indicator-dot ${hddStatusClass}`}></span>
                              <span style={{ textTransform: 'capitalize' }}>{hdd.status}</span>
                            </td>
                          </tr>
                        );
                      })}
                      {selectedNvrHdds.length === 0 && (
                        <tr>
                          <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                            Data harddisk tidak ditemukan.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <div>
                <button
                  className="btn btn-danger"
                  onClick={() => handleDeleteNvr(selectedNvr.id)}
                >
                  🗑️ Hapus NVR
                </button>
                {selectedNvr.type === 'pcnvr' && (
                  <button
                    className="btn btn-secondary"
                    style={{ marginLeft: '0.5rem', color: 'var(--accent-cyan)' }}
                    onClick={() => handleRegenerateToken(selectedNvr.id)}
                  >
                    🔑 Rotate Token Agent
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleManualRefreshNvr(selectedNvr.id)}
                  disabled={isPollingActive}
                >
                  {isPollingActive ? 'Polling ISAPI...' : '🔄 Poll/Refresh Now'}
                </button>
                <button className="btn btn-primary" onClick={() => setIsDetailModalOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* modal CRUD NVR */}
      {isNvrModalOpen && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '550px' }}>
            <div className="modal-header">
              <h2>{editingNvr ? 'Edit NVR Configuration' : 'Register New Hikvision NVR'}</h2>
              <button className="modal-close" onClick={() => setIsNvrModalOpen(false)}>&times;</button>
            </div>

            <form onSubmit={handleSaveNvr}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: 'var(--accent-rose-glow)', color: 'var(--accent-rose)', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                    ⚠️ {formError}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">NVR / PCNVR Label Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. NVR Site"
                    value={nvrFormName}
                    onChange={(e) => setNvrFormName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label className="form-label">Site / Branch Location</label>
                    <select
                      className="form-input"
                      value={nvrFormSite}
                      onChange={(e) => setNvrFormSite(e.target.value)}
                    >
                      <option value="Jakarta CBD">Jakarta CBD</option>
                      <option value="BSD North Point 36">BSD North Point 36</option>
                      <option value="BSD North Point 67">BSD North Point 67</option>
                      <option value="Padel E-Building">Padel E-Building</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Device Type</label>
                    <select
                      className="form-input"
                      value={nvrFormType}
                      onChange={(e) => setNvrFormType(e.target.value)}
                    >
                      <option value="hardware_nvr">Hardware NVR (Hikvision Appliance)</option>
                      <option value="pcnvr">PCNVR (iVMS-4200 PC-based)</option>
                    </select>
                  </div>
                </div>

                <div className="form-row-3" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">IP Address</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 10.90.10.50"
                      value={nvrFormIp}
                      onChange={(e) => setNvrFormIp(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Port</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="80"
                      value={nvrFormPort}
                      onChange={(e) => setNvrFormPort(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Protocol</label>
                    <select
                      className="form-input"
                      value={nvrFormProtocol}
                      onChange={(e) => setNvrFormProtocol(e.target.value)}
                    >
                      <option value="http">HTTP</option>
                      <option value="https">HTTPS</option>
                    </select>
                  </div>
                </div>

                {nvrFormType === 'hardware_nvr' && (
                  <div className="form-row-2">
                    <div className="form-group">
                      <label className="form-label">Username</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="admin"
                        value={nvrFormUsername}
                        onChange={(e) => setNvrFormUsername(e.target.value)}
                        required={nvrFormType === 'hardware_nvr'}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">
                        {editingNvr ? 'Ganti Password Baru (Opsional)' : 'Password Device'}
                      </label>
                      <input
                        type="password"
                        className="form-input"
                        placeholder={editingNvr ? 'Biarkan kosong jika tidak diubah' : '••••••••'}
                        value={nvrFormPassword}
                        onChange={(e) => setNvrFormPassword(e.target.value)}
                        required={!editingNvr && nvrFormType === 'hardware_nvr'}
                      />
                    </div>
                  </div>
                )}

                {nvrFormType === 'pcnvr' && (
                  <div style={{ background: 'rgba(37, 99, 235, 0.06)', border: '1px solid rgba(37, 99, 235, 0.2)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    ℹ️ Tipe <strong>PCNVR</strong> menggunakan mode push heartbeat & status. Setelah disimpan, token autentikasi agent akan dibuat otomatis.
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsNvrModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {editingNvr ? 'Save Changes' : 'Register NVR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* modal token output (Regenerate token) */}
      {isTokenModalOpen && tokenModalNvr && (
        <div className="modal-overlay">
          <div className="modal-container" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2>Agent Token Generated 🔑</h2>
              <button className="modal-close" onClick={() => setIsTokenModalOpen(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
                Berikut adalah detail autentikasi agent untuk <strong>{tokenModalNvr.name}</strong>. Salin informasi ini ke file `agent.py` di PC Anda.
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>NVR ID</label>
                <div className="agent-token-box">
                  <span style={{ fontFamily: 'monospace' }}>{tokenModalNvr.id}</span>
                  <button
                    className="copy-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(tokenModalNvr.id);
                      alert('NVR ID disalin ke clipboard!');
                    }}
                  >
                    📋 Copy ID
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', display: 'block' }}>Agent Token</label>
                <div className="agent-token-box">
                  <span style={{ wordBreak: 'break-all' }}>{tokenModalNvr.agent_token}</span>
                  <button
                    className="copy-btn"
                    onClick={() => {
                      navigator.clipboard.writeText(tokenModalNvr.agent_token);
                      alert('Agent Token disalin ke clipboard!');
                    }}
                  >
                    📋 Copy Token
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '1.25rem', background: 'var(--accent-amber-glow)', color: 'var(--accent-amber)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem' }}>
                <strong>⚠️ PENTING:</strong> Simpan token ini dengan aman. Demi keamanan, token ini dienkripsi di database dan tidak akan ditampilkan ulang.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setIsTokenModalOpen(false)}>Selesai</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
