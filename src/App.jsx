import React, { useState, useEffect } from 'react';

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

  // Unique sites for filtering
  const sitesList = ['All Sites', ...new Set(nvrs.map(n => n.site))];

  // Map NVR overall status based on its channels & heartbeat
  const getNvrStatus = (nvr) => {
    if (nvr.type === 'pcnvr') {
      if (nvr.last_heartbeat_at) {
        const lastHeartbeat = new Date(nvr.last_heartbeat_at);
        const now = new Date();
        const diffSeconds = Math.abs(now - lastHeartbeat) / 1000;
        if (diffSeconds > 120) {
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

  // Render Login page if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="login-wrapper">
        <div className="login-card">
          <div className="logo-section" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
            <span className="logo-icon">📹</span>
            <h1>ATI CCTV MONITORING</h1>
          </div>
          <p className="login-subtitle">IT Infrastructure Single Pane of Glass NVR Status</p>

          <form onSubmit={handleLogin}>
            <div className="form-group" style={{ textAlign: 'left' }}>
              <label className="form-label">Username</label>
              <input
                type="text"
                className="form-input"
                placeholder="Masukkan username (e.g. admin)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={lockoutTime !== null}
              />
            </div>

            <div className="form-group" style={{ textAlign: 'left' }}>
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                placeholder="Masukkan password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={lockoutTime !== null}
              />
            </div>

            {loginError && (
              <div style={{ color: 'var(--accent-rose)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                {loginError}
                {lockoutTime !== null && (
                  <span style={{ fontWeight: 'bold', display: 'block', marginTop: '0.25rem' }}>
                    Tunggu {lockoutTime}s...
                  </span>
                )}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }} disabled={lockoutTime !== null}>
              Masuk Dashboard
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Gunakan username: <strong style={{ color: 'var(--text-secondary)' }}>admin</strong> & password: <strong style={{ color: 'var(--text-secondary)' }}>admin123</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="glass-header">
        <div className="logo-section">
          <span className="logo-icon">📹</span>
          <div>
            <h1>ATI CCTV MONITORING</h1>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>SINGLE PANE OF GLASS</span>
          </div>
        </div>

        <div className="header-actions">
          <button
            className={`btn ${activeTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('audit')}
          >
            Audit Logs
          </button>
          <div style={{ width: '1px', height: '24px', background: 'var(--border-glass)' }}></div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Halo, <strong>Admin</strong></span>
          <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* Simulation Banner */}
      <div className="simulation-banner">
        <div>
          <span style={{ marginRight: '0.5rem' }}>⚡</span>
          <strong>Polled Backend Connected (SQLite DB)</strong> - Status NVR diperbarui secara periodik.
        </div>
        <button className="btn btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} onClick={handleManualTriggerSimulation}>
          Refresh DB Cache 🔄
        </button>
      </div>

      {activeTab === 'dashboard' ? (
        <>
          {/* Counters strip */}
          <div className="metrics-strip">
            <div className="metric-card">
              <div className="metric-icon" style={{ background: 'rgba(79,172,254,0.15)', color: 'var(--accent-blue)' }}>🖥️</div>
              <div className="metric-info">
                <h4>Total NVR</h4>
                <p>{totalNvrs}</p>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon" style={{ background: 'rgba(0,242,254,0.15)', color: 'var(--accent-cyan)' }}>🎥</div>
              <div className="metric-info">
                <h4>Total Channels</h4>
                <p>{totalChannels}</p>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon" style={{ background: 'var(--accent-green-glow)', color: 'var(--accent-green)' }}>🟢</div>
              <div className="metric-info">
                <h4>Kamera Online</h4>
                <p>{onlineCameras}</p>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon" style={{ background: 'var(--accent-rose-glow)', color: 'var(--accent-rose)' }}>🔴</div>
              <div className="metric-info">
                <h4>Kamera Offline</h4>
                <p>{offlineCameras}</p>
              </div>
            </div>
            <div className="metric-card">
              <div className="metric-icon" style={{ background: 'var(--accent-amber-glow)', color: 'var(--accent-amber)' }}>💾</div>
              <div className="metric-info">
                <h4>HDD Alert</h4>
                <p>{errorHdds}</p>
              </div>
            </div>
          </div>

          {/* Filtering Control Bar */}
          <div className="controls-container">
            <div className="filters-wrapper">
              <input
                type="text"
                className="search-input"
                placeholder="Cari NVR Nama / IP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '220px' }}
              />
              <select
                className="select-input"
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
              >
                {sitesList.map(site => (
                  <option key={site} value={site}>{site}</option>
                ))}
              </select>
              <select
                className="select-input"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                <option value="All Types">All Types</option>
                <option value="hardware_nvr">Hardware NVR</option>
                <option value="pcnvr">PCNVR (PC-based)</option>
              </select>
            </div>

            <button className="btn btn-primary" onClick={openAddNvrModal}>
              <span>+</span> Register New NVR
            </button>
          </div>

          {/* Grid View */}
          <div className="nvr-grid">
            {filteredNvrs.map(nvr => {
              const status = getNvrStatus(nvr);
              const nvrHdds = nvr.hdds || [];
              const nvrChannels = nvr.channels || [];
              const offlineCount = nvrChannels.filter(c => c.last_status !== 'ONLINE').length;

              // Calculate overall HDD Usage percentage
              const totalCapacity = nvrHdds.reduce((acc, h) => acc + h.capacity_mb, 0);
              const totalFree = nvrHdds.reduce((acc, h) => acc + h.freespace_mb, 0);
              const totalUsed = totalCapacity - totalFree;
              const usagePercent = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;

              // Progress bar styling
              let diskSeverity = 'normal';
              if (nvrHdds.some(h => h.status === 'error')) {
                diskSeverity = 'error';
              } else if (usagePercent > 90) {
                diskSeverity = 'warning';
              }

              return (
                <div key={nvr.id} className={`nvr-card status-${status}`}>
                  <div className="nvr-card-header">
                    <div className="nvr-title-group">
                      <h3>{nvr.name}</h3>
                      <span className="site-badge">{nvr.site}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '0.5rem', textTransform: 'uppercase' }}>
                        {nvr.type === 'pcnvr' ? 'PCNVR' : 'Hardware'}
                      </span>
                    </div>
                    <span className={`status-badge ${status}`}>
                      {status === 'stale' ? 'AGENT STALE' : status}
                    </span>
                  </div>

                  <div className="nvr-card-body">
                    <div className="nvr-meta-row">
                      <span>IP Address</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{nvr.ip_address}:{nvr.port}</strong>
                    </div>

                    <div className="nvr-meta-row">
                      <span>Protocol</span>
                      <span style={{ textTransform: 'uppercase' }}>{nvr.protocol}</span>
                    </div>

                    {nvr.type === 'pcnvr' && nvr.last_heartbeat_at && (
                      <div className="nvr-meta-row" style={{ fontStyle: 'italic', fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>
                        Heartbeat: {new Date(nvr.last_heartbeat_at).toLocaleTimeString()}
                      </div>
                    )}

                    {totalCapacity > 0 && (
                      <div className="storage-section">
                        <div className="storage-header">
                          <span>Storage Used ({usagePercent}%)</span>
                          <span>{((totalCapacity - totalFree) / 1000000).toFixed(1)} / {(totalCapacity / 1000000).toFixed(1)} TB</span>
                        </div>
                        <div className="progress-track">
                          <div
                            className={`progress-fill ${diskSeverity}`}
                            style={{ width: `${usagePercent}%` }}
                          ></div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="nvr-card-footer">
                    <span className="camera-summary-count">
                      Kamera: <strong>{nvrChannels.length - offlineCount} / {nvrChannels.length}</strong> Online
                    </span>
                    {offlineCount > 0 && (
                      <span className="offline-badge">
                        {offlineCount} Problematic
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '0.4rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => {
                        setSelectedNvrId(nvr.id);
                        setIsDetailModalOpen(true);
                        setDetailTab('cameras');
                      }}
                    >
                      🔍 Detail View
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem' }}
                      onClick={() => openEditNvrModal(nvr)}
                    >
                      ✏️ Edit
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredNvrs.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>
                <h3>NVR Tidak Ditemukan</h3>
                <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Silakan periksa filter atau ketik pencarian yang berbeda.</p>
              </div>
            )}
          </div>
        </>
      ) : (
        /* Audit Logs View */
        <div className="audit-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>Audit Logs Aktivitas</h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Retention: 90 Hari (Auto-Purge Aktif)</span>
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
                      <td style={{ color: 'var(--accent-cyan)' }}>{log.action}</td>
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

      {/* modal detail */}
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
                  <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.25rem 0.5rem', borderRadius: '4px', width: 'fit-content' }}>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>NVR ID: {selectedNvr.id}</span>
                    <button 
                      style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '3px', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.7rem', padding: '2px 6px' }}
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
                            <td>{(hdd.capacity_mb / 1000000).toFixed(1)} TB</td>
                            <td>{(usedMb / 1000000).toFixed(1)} TB ({usagePct}%)</td>
                            <td>{(hdd.freespace_mb / 1000000).toFixed(1)} TB</td>
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
                  <div style={{ background: 'rgba(0, 242, 254, 0.05)', border: '1px solid rgba(0, 242, 254, 0.2)', padding: '0.75rem', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
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
