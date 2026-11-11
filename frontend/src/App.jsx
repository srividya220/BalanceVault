import { useEffect, useState, useRef, useCallback } from 'react';
import api from './api';

// ─── Currency Formatter ───────────────────────────────────────────────────────
const money = (value) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

// ─── Notification type → icon map ─────────────────────────────────────────────
const notifIcon = (type) => {
  const map = {
    TRANSACTION_DEPOSIT: '📥',
    TRANSACTION_WITHDRAWAL: '📤',
    TRANSACTION_TRANSFER: '🔄',
    ACCOUNT_APPLICATION_SUBMITTED: '📋',
    ACCOUNT_APPLICATION_APPROVED: '✅',
    ACCOUNT_APPLICATION_REJECTED: '❌',
    ADMIN_NEW_APPLICATION: '🔔',
    SECURITY_EVENT: '🛡️',
    GENERAL: '💬',
  };
  return map[type] || '💬';
};

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('balancevault_token'));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('balancevault_user') || 'null'); }
    catch { return null; }
  });

  // ─── Core State ──────────────────────────────────────────────────────────────
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [statement, setStatement] = useState([]);
  const [page, setPage] = useState('overview');
  const [authMode, setAuthMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // ─── Notifications State ─────────────────────────────────────────────────────
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifDropdownRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // ─── Application State ───────────────────────────────────────────────────────
  const [myApplications, setMyApplications] = useState([]);
  const [allApplications, setAllApplications] = useState([]);
  const [appStatusFilter, setAppStatusFilter] = useState('');
  const [appSearchQuery, setAppSearchQuery] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // ─── Form State ──────────────────────────────────────────────────────────────
  const [authForm, setAuthForm] = useState({ fullName: '', email: '', password: '', role: 'CUSTOMER' });
  const [txForm, setTxForm] = useState({ amount: '', targetAccountNumber: '', description: '' });
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [newAccountType, setNewAccountType] = useState('CHECKING');

  // ─── Admin State ─────────────────────────────────────────────────────────────
  const [invariantData, setInvariantData] = useState(null);
  const [chainAuditData, setChainAuditData] = useState(null);
  const [allAccounts, setAllAccounts] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [healthData, setHealthData] = useState(null);

  const selectedAccount = accounts.find((a) => a.id === selectedId) || accounts[0];
  const totalBalance = accounts.reduce((sum, acc) => sum + Number(acc.balance || 0), 0);

  // ─── Error / Notice Helpers ───────────────────────────────────────────────────
  const showError = (err) => {
    const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'An unexpected error occurred.';
    setError(msg);
    setNotice('');
  };

  const clearMessages = () => { setError(''); setNotice(''); };

  // ─── Data Loaders ─────────────────────────────────────────────────────────────
  const loadAccounts = async () => {
    try {
      const res = await api.get('/accounts');
      const data = Array.isArray(res.data.data) ? res.data.data : [];
      setAccounts(data);
      if (data.length > 0 && (!selectedId || !data.some((a) => a.id === selectedId))) {
        setSelectedId(data[0].id);
      }
    } catch (err) { showError(err); }
  };

  const loadStatement = async (accId) => {
    if (!accId) return;
    try {
      const res = await api.get(`/accounts/${accId}/statement`);
      setStatement(res.data.data?.statement || []);
    } catch (err) { showError(err); }
  };

  const loadInvariants = async () => {
    try {
      const res = await api.get('/admin/ledger/verify-invariants');
      setInvariantData(res.data.data);
    } catch (err) { showError(err); }
  };

  const loadChainAudit = async () => {
    try {
      const res = await api.get('/admin/audit/verify-chain');
      setChainAuditData(res.data.data);
    } catch (err) { showError(err); }
  };

  const loadAdminData = async () => {
    try {
      const [accRes, userRes, logRes, healthRes] = await Promise.all([
        api.get('/admin/accounts'),
        api.get('/admin/users'),
        api.get('/admin/audit-logs'),
        api.get('/health/ready'),
      ]);
      setAllAccounts(accRes.data.data || []);
      setAllUsers(userRes.data.data || []);
      setAuditLogs(logRes.data.data || []);
      setHealthData(healthRes.data);
    } catch (err) { showError(err); }
  };

  const loadAllApplications = async () => {
    try {
      const res = await api.get('/applications');
      setAllApplications(res.data.data || []);
    } catch (err) { /* silent — user may not be admin */ }
  };

  const loadMyApplications = async () => {
    try {
      const res = await api.get('/applications/my');
      setMyApplications(res.data.data || []);
    } catch (err) { /* silent */ }
  };

  // ─── Notification Loaders ──────────────────────────────────────────────────────
  const loadNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get('/notifications?limit=20');
      setNotifications(res.data.data || []);
    } catch (_) {}
  }, [token]);

  const loadUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.get('/notifications/unread-count');
      setUnreadCount(res.data.data?.count || 0);
    } catch (_) {}
  }, [token]);

  // ─── Polling Setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    loadNotifications();
    loadUnreadCount();
    pollIntervalRef.current = setInterval(() => {
      loadUnreadCount();
      if (showNotifDropdown || page === 'notifications') loadNotifications();
    }, 20000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [token, showNotifDropdown, page]);

  // ─── Page Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (token) {
      loadAccounts();
      loadMyApplications();
      if (user?.role === 'ADMIN' || user?.role === 'AUDITOR') loadInvariants();
      if (user?.role === 'ADMIN') loadAllApplications();
    }
  }, [token]);

  useEffect(() => {
    if (selectedId && (page === 'transactions' || page === 'overview')) loadStatement(selectedId);
    if (page === 'invariants') { loadInvariants(); loadChainAudit(); }
    if (page === 'admin') { loadAdminData(); loadAllApplications(); }
    if (page === 'notifications') loadNotifications();
  }, [selectedId, page]);

  // ─── Close notification dropdown on outside click ─────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target)) {
        setShowNotifDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ─── Auth Handlers ─────────────────────────────────────────────────────────────
  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();
    try {
      const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
      const payload = authMode === 'login' ? { email: authForm.email, password: authForm.password } : authForm;
      const res = await api.post(endpoint, payload);
      const authResult = res.data.data;
      localStorage.setItem('balancevault_token', authResult.token);
      localStorage.setItem('balancevault_user', JSON.stringify(authResult.user));
      setToken(authResult.token);
      setUser(authResult.user);
      setNotice(`Welcome, ${authResult.user.fullName}!`);
      setPage('overview');
    } catch (err) { showError(err); }
    finally { setLoading(false); }
  };

  const logout = () => {
    localStorage.removeItem('balancevault_token');
    localStorage.removeItem('balancevault_user');
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setToken(null); setUser(null); setAccounts([]); setStatement([]);
    setNotifications([]); setUnreadCount(0); setMyApplications([]);
    setAllApplications([]); setPage('overview'); clearMessages();
  };

  const fillDemoCreds = (email, password) => {
    setAuthForm((prev) => ({ ...prev, email, password }));
    setAuthMode('login');
  };

  // ─── Account Application (replaces direct account creation) ───────────────────
  const handleSubmitApplication = async () => {
    setLoading(true);
    clearMessages();
    try {
      await api.post('/applications', { accountType: newAccountType });
      setNotice(`Your ${newAccountType.toLowerCase()} account application has been submitted! An administrator will review it shortly.`);
      setShowNewAccountModal(false);
      await loadMyApplications();
      await loadNotifications();
      await loadUnreadCount();
    } catch (err) { showError(err); }
    finally { setLoading(false); }
  };

  // ─── Transaction Handlers ──────────────────────────────────────────────────────
  const performTransaction = async (e) => {
    e.preventDefault();
    if (!selectedAccount) return;
    const amount = Number(txForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Please specify a positive amount greater than zero.');
      return;
    }
    setLoading(true); clearMessages();
    try {
      const idempotencyKey = `bv-txn-${crypto.randomUUID()}`;
      const headers = { 'Idempotency-Key': idempotencyKey };
      if (page === 'deposit') {
        const res = await api.post('/transactions/deposit', { accountId: selectedAccount.id, amount, description: txForm.description || 'Customer balance deposit' }, { headers });
        setNotice(`Deposit of ${money(amount)} succeeded! (Ref: ${res.data.data.journalEntry.reference})`);
      } else if (page === 'withdraw') {
        const res = await api.post('/transactions/withdraw', { accountId: selectedAccount.id, amount, description: txForm.description || 'Customer ATM withdrawal' }, { headers });
        setNotice(`Withdrawal of ${money(amount)} completed! (Ref: ${res.data.data.journalEntry.reference})`);
      } else if (page === 'transfer') {
        if (!txForm.targetAccountNumber.trim()) throw new Error('Please enter the recipient account number.');
        const res = await api.post('/transactions/transfer', { sourceAccountId: selectedAccount.id, destinationAccountNumber: txForm.targetAccountNumber.trim(), amount, description: txForm.description || 'Account-to-account transfer' }, { headers });
        setNotice(`Transfer of ${money(amount)} to ${txForm.targetAccountNumber} completed! (Ref: ${res.data.data.journalEntry.reference})`);
      }
      setTxForm({ amount: '', targetAccountNumber: '', description: '' });
      await loadAccounts();
      if (selectedAccount) loadStatement(selectedAccount.id);
      await loadNotifications();
      await loadUnreadCount();
      setPage('overview');
    } catch (err) { showError(err); }
    finally { setLoading(false); }
  };

  // ─── Admin Account Status ──────────────────────────────────────────────────────
  const handleUpdateAccountStatus = async (accountId, status) => {
    try {
      await api.patch(`/admin/accounts/${accountId}/status`, { status });
      setNotice(`Account status updated to ${status}`);
      await loadAdminData();
    } catch (err) { showError(err); }
  };

  // ─── Notification Actions ──────────────────────────────────────────────────────
  const handleMarkAsRead = async (notifId) => {
    try {
      await api.patch(`/notifications/${notifId}/read`);
      setNotifications((prev) => prev.map((n) => n.id === notifId ? { ...n, isRead: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (_) {}
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (_) {}
  };

  const handleDismissNotification = async (notifId) => {
    try {
      await api.delete(`/notifications/${notifId}`);
      setNotifications((prev) => prev.filter((n) => n.id !== notifId));
      const wasUnread = notifications.find((n) => n.id === notifId && !n.isRead);
      if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
    } catch (_) {}
  };

  // ─── Admin Application Actions ─────────────────────────────────────────────────
  const handleApproveApplication = async (appId) => {
    if (!window.confirm('Approve this account application? This will create an active bank account for the customer.')) return;
    try {
      await api.patch(`/applications/${appId}/approve`);
      setNotice('Account application approved. Customer account is now active.');
      await loadAllApplications();
      await loadAdminData();
      await loadNotifications();
      await loadUnreadCount();
    } catch (err) { showError(err); }
  };

  const openRejectModal = (appId) => {
    setRejectTargetId(appId);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const handleRejectApplication = async () => {
    if (!rejectReason.trim() || rejectReason.trim().length < 5) {
      setError('Please provide a rejection reason of at least 5 characters.');
      return;
    }
    try {
      await api.patch(`/applications/${rejectTargetId}/reject`, { reason: rejectReason.trim() });
      setNotice('Account application rejected. Customer has been notified.');
      setShowRejectModal(false);
      setRejectTargetId(null);
      setRejectReason('');
      await loadAllApplications();
    } catch (err) { showError(err); }
  };

  // ─── Filtered Applications for Admin ──────────────────────────────────────────
  const filteredApplications = allApplications.filter((app) => {
    const matchStatus = !appStatusFilter || app.status === appStatusFilter;
    const q = appSearchQuery.toLowerCase();
    const matchSearch = !q || app.user?.fullName?.toLowerCase().includes(q) || app.user?.email?.toLowerCase().includes(q) || app.id.toLowerCase().includes(q) || app.accountType.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  // ─── Application status badge ──────────────────────────────────────────────────
  const appStatusBadge = (status) => {
    const map = {
      PENDING_APPROVAL: { label: 'PENDING', cls: 'badge-pending' },
      APPROVED: { label: 'APPROVED', cls: 'badge-active' },
      REJECTED: { label: 'REJECTED', cls: 'badge-frozen' },
    };
    const s = map[status] || { label: status, cls: '' };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTH SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="auth-screen">
        <aside className="auth-art">
          <div className="brand brand-light">
            <span className="brand-mark">BV</span>
            BalanceVault
          </div>
          <div className="auth-message">
            <span className="eyebrow">ENTERPRISE LEDGER PLATFORM</span>
            <h1>High-Assurance Banking Architecture</h1>
            <p>Engineered with strict double-entry money conservation, cryptographic audit hash chains, concurrency-safe row locking, and database-level immutability triggers.</p>
            <div className="art-card">
              <span>ZERO-SUM CONSERVATION EQUATION</span>
              <div className="art-balance">Σ Postings = ₹0.00</div>
              <div className="art-bottom">
                <span>DATABASE TRIGGERS: ACTIVE</span>
                <span>IDEMPOTENCY: ENFORCED</span>
              </div>
            </div>
          </div>
          <div className="auth-foot">© 2026 BalanceVault Financial Technologies Inc. • Mission-Critical Financial Ledger</div>
        </aside>

        <main className="auth-panel">
          <div className="auth-form-wrap">
            <div className="brand brand-dark">
              <span className="brand-mark">BV</span>
              BalanceVault
            </div>
            <span className="eyebrow auth-eyebrow">{authMode === 'login' ? 'SECURE PORTAL ACCESS' : 'CLIENT ONBOARDING'}</span>
            <h2>{authMode === 'login' ? 'Sign in to BalanceVault' : 'Open a Vault Account'}</h2>
            <p className="muted">{authMode === 'login' ? 'Enter your credentials to access your protected financial accounts.' : 'Create your digital banking identity with instant checking account issuance.'}</p>

            {notice && <div className="alert success">{notice}</div>}
            {error && <div className="alert error">{error}</div>}

            <form onSubmit={handleAuth} className="form-stack">
              {authMode === 'register' && (
                <>
                  <label>Full Name<input type="text" required placeholder="e.g. Jane Doe" value={authForm.fullName} onChange={(e) => setAuthForm({ ...authForm, fullName: e.target.value })} /></label>
                  <label>Account Role
                    <select value={authForm.role} onChange={(e) => setAuthForm({ ...authForm, role: e.target.value })}>
                      <option value="CUSTOMER">Customer (Standard Banking)</option>
                      <option value="AUDITOR">Auditor (Compliance &amp; Ledger Inspector)</option>
                      <option value="ADMIN">Administrator (Full Bank Control)</option>
                    </select>
                  </label>
                </>
              )}
              <label>Email Address<input type="email" required placeholder="name@example.com" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} /></label>
              <label>Password<input type="password" required placeholder="••••••••••••" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} /></label>
              <button type="submit" disabled={loading} className="primary-btn full-btn">
                {loading ? 'Authenticating...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>

            <div className="quick-creds">
              <span style={{ width: '100%', fontSize: '11px', color: '#667' }}>Quick Demo Credentials:</span>
              <button type="button" className="quick-cred-btn" onClick={() => fillDemoCreds('admin@balancevault.com', 'AdminVaultPassword2026!')}>🔑 Admin Demo</button>
              <button type="button" className="quick-cred-btn" onClick={() => fillDemoCreds('alice@test.com', 'Password123!')}>👤 Customer Demo</button>
            </div>

            <div className="switch-auth">
              {authMode === 'login' ? "Don't have an account yet?" : 'Already registered?'}
              <button type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'register' : 'login'); clearMessages(); }}>
                {authMode === 'login' ? 'Create one now' : 'Sign in'}
              </button>
            </div>
            <div className="secure-note">🔒 256-bit TLS Encrypted • Redis Rate Limited • Append-Only DB Protection</div>
          </div>
        </main>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // AUTHENTICATED APP SHELL
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="brand brand-light">
          <span className="brand-mark">BV</span>
          BalanceVault
        </div>

        <span className="nav-caption">BANKING OPERATIONS</span>
        <nav>
          <button className={`nav-item ${page === 'overview' ? 'active' : ''}`} onClick={() => setPage('overview')}><span className="nav-icon">📊</span> Overview</button>
          <button className={`nav-item ${page === 'deposit' ? 'active' : ''}`} onClick={() => setPage('deposit')}><span className="nav-icon">📥</span> Deposit Funds</button>
          <button className={`nav-item ${page === 'withdraw' ? 'active' : ''}`} onClick={() => setPage('withdraw')}><span className="nav-icon">📤</span> Withdraw Funds</button>
          <button className={`nav-item ${page === 'transfer' ? 'active' : ''}`} onClick={() => setPage('transfer')}><span className="nav-icon">🔄</span> Transfer Money</button>
          <button className={`nav-item ${page === 'transactions' ? 'active' : ''}`} onClick={() => setPage('transactions')}><span className="nav-icon">📜</span> Ledger Statement</button>
          <button className={`nav-item ${page === 'notifications' ? 'active' : ''}`} onClick={() => { setPage('notifications'); loadNotifications(); }}><span className="nav-icon">🔔</span> Notifications {unreadCount > 0 && <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>
        </nav>

        {(user?.role === 'ADMIN' || user?.role === 'AUDITOR') && (
          <>
            <span className="nav-caption" style={{ marginTop: '20px' }}>GOVERNANCE &amp; AUDIT</span>
            <nav>
              <button className={`nav-item ${page === 'invariants' ? 'active' : ''}`} onClick={() => setPage('invariants')}><span className="nav-icon">⚖️</span> Invariant Inspector</button>
              <button className={`nav-item ${page === 'admin' ? 'active' : ''}`} onClick={() => setPage('admin')}><span className="nav-icon">🛡️</span> Bank Administration</button>
            </nav>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">🛡️</div>
            <strong>Double-Entry Guaranteed</strong>
            <p>Every transaction strictly conserves money with atomic multi-account postings.</p>
          </div>
          <button onClick={logout} className="btn-secondary logout-btn">Sign Out</button>
          <div className="sidebar-version">BALANCEVAULT V1.0 • PROD READY</div>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="main-area">
        {/* ── Topbar ── */}
        <header className="topbar">
          <div>
            <div className="topbar-label">AUTHENTICATED FINANCIAL SESSION</div>
            <div className="topbar-title">BalanceVault Central Banking Platform</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Notification Bell */}
            <div className="notif-bell-wrap" ref={notifDropdownRef} style={{ position: 'relative' }}>
              <button
                className="notif-bell-btn"
                onClick={() => { setShowNotifDropdown((v) => !v); if (!showNotifDropdown) loadNotifications(); }}
                aria-label="Notifications"
              >
                🔔
                {unreadCount > 0 && (
                  <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
                )}
              </button>

              {showNotifDropdown && (
                <div className="notif-dropdown">
                  <div className="notif-dropdown-header">
                    <strong>Notifications</strong>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {unreadCount > 0 && (
                        <button className="notif-action-btn" onClick={handleMarkAllAsRead}>Mark all read</button>
                      )}
                      <button className="notif-action-btn" onClick={() => { setShowNotifDropdown(false); setPage('notifications'); }}>View all</button>
                    </div>
                  </div>
                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <div className="notif-empty">No notifications yet</div>
                    ) : (
                      notifications.slice(0, 8).map((n) => (
                        <div key={n.id} className={`notif-item ${!n.isRead ? 'notif-unread' : ''}`}>
                          <span className="notif-icon-sm">{notifIcon(n.type)}</span>
                          <div className="notif-body">
                            <div className="notif-title">{n.title}</div>
                            <div className="notif-msg">{n.message}</div>
                            <div className="notif-time">{new Date(n.createdAt).toLocaleString()}</div>
                          </div>
                          <div className="notif-actions">
                            {!n.isRead && <button className="notif-dot-btn" onClick={() => handleMarkAsRead(n.id)} title="Mark as read">●</button>}
                            <button className="notif-dismiss-btn" onClick={() => handleDismissNotification(n.id)} title="Dismiss">✕</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile */}
            <div className="profile">
              <div className="avatar">{user?.fullName ? user.fullName[0].toUpperCase() : 'U'}</div>
              <div className="profile-info">
                <strong>{user?.fullName}</strong>
                <span>{user?.email} • <span className={`badge badge-${user?.role?.toLowerCase()}`}>{user?.role}</span></span>
              </div>
            </div>
          </div>
        </header>

        {/* ── Page Content ── */}
        <div className="content">
          {notice && <div className="alert success">{notice}</div>}
          {error && <div className="alert error">{error}</div>}

          {/* ══ OVERVIEW ══════════════════════════════════════════════════════════ */}
          {page === 'overview' && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">PORTFOLIO SUMMARY</span>
                  <h1>Accounts &amp; Balances</h1>
                  <p className="muted">Welcome to your BalanceVault dashboard. Manage your funds with strict conservation guarantees.</p>
                </div>
                <div className="card-header-actions">
                  <span className="status-pill"><span className="status-dot"></span> System Live &amp; Invariants Balanced</span>
                  <button className="primary-btn btn-sm" onClick={() => setShowNewAccountModal(true)}>+ Open New Account</button>
                </div>
              </div>

              {/* Balance Cards */}
              <div className="balance-grid">
                <div className="balance-card">
                  <div className="balance-card-top">
                    <span>TOTAL LIQUID VAULT ASSETS</span>
                    <span className="balance-symbol">💎</span>
                  </div>
                  <div className="total-amount">{money(totalBalance)}</div>
                  <div className="balance-card-bottom">
                    <span>ACROSS {accounts.length} ACTIVE ACCOUNTS</span>
                    <span>CURRENCY: INR</span>
                  </div>
                </div>
                <div className="small-stat">
                  <div className="stat-icon green">🏦</div>
                  <span className="stat-label">PRIMARY ACCOUNT</span>
                  <strong>{selectedAccount ? money(selectedAccount.balance) : '₹0.00'}</strong>
                  <span className="stat-foot">{selectedAccount?.accountNumber || 'None'}</span>
                </div>
                <div className="small-stat">
                  <div className="stat-icon purple">🔒</div>
                  <span className="stat-label">DOUBLE-ENTRY STATUS</span>
                  <strong style={{ fontSize: '18px', color: '#16a34a' }}>VERIFIED (0-SUM)</strong>
                  <span className="stat-foot">Strict Conservation Invariant</span>
                </div>
              </div>

              {/* Accounts List */}
              <div className="section-block">
                <div className="section-heading">
                  <div>
                    <h2>Your Vault Accounts</h2>
                    <p className="muted">Click any account to select it for statement views and transfers.</p>
                  </div>
                  <button className="btn-secondary btn-sm" onClick={() => setShowNewAccountModal(true)}>+ Add Account</button>
                </div>
                <div className="account-grid">
                  {accounts.length === 0 && (
                    <div className="empty-state" style={{ gridColumn: '1/-1' }}>
                      <div className="empty-icon">🏦</div>
                      <strong>No active accounts</strong>
                      <p>Your first account is created when you register. Open additional accounts via the button above.</p>
                    </div>
                  )}
                  {accounts.map((acc) => (
                    <div key={acc.id} className={`account-card ${selectedId === acc.id ? 'selected' : ''}`} onClick={() => setSelectedId(acc.id)} style={{ cursor: 'pointer' }}>
                      <div className="account-card-top">
                        <div className="account-symbol">BV</div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <span className={`badge badge-${acc.status.toLowerCase()}`}>{acc.status}</span>
                          <span className="account-chip">{acc.accountType}</span>
                        </div>
                      </div>
                      <div className="account-holder">{acc.accountType} Account</div>
                      <div className="account-number" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{acc.accountNumber}</span>
                        <button className="copy-pill" onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(acc.accountNumber); setNotice(`Copied ${acc.accountNumber} to clipboard!`); }}>Copy</button>
                      </div>
                      <div className="account-balance">{money(acc.balance)}</div>
                      <div className="account-card-foot">{selectedId === acc.id ? '● Currently Active for Actions' : 'Click to select this account'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pending Applications */}
              {myApplications.filter((a) => a.status === 'PENDING_APPROVAL').length > 0 && (
                <div className="section-block">
                  <div className="section-heading">
                    <div>
                      <h2>⏳ Pending Account Applications</h2>
                      <p className="muted">These applications are awaiting administrator review.</p>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>APPLICATION ID</th><th>ACCOUNT TYPE</th><th>STATUS</th><th>SUBMITTED</th></tr></thead>
                      <tbody>
                        {myApplications.filter((a) => a.status === 'PENDING_APPROVAL').map((app) => (
                          <tr key={app.id}>
                            <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{app.id.slice(0, 8)}...</td>
                            <td>{app.accountType}</td>
                            <td>{appStatusBadge(app.status)}</td>
                            <td>{new Date(app.createdAt).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="section-block">
                <div className="section-heading">
                  <h2>Direct Actions</h2>
                  <p className="muted">Instantly move funds with idempotency protection.</p>
                </div>
                <div className="quick-grid">
                  <button className="quick-card" onClick={() => setPage('deposit')}><div className="quick-icon">📥</div><strong>Deposit Funds</strong><span>Deposit into selected account</span></button>
                  <button className="quick-card" onClick={() => setPage('withdraw')}><div className="quick-icon">📤</div><strong>Withdraw Funds</strong><span>Direct debit with overdraft protection</span></button>
                  <button className="quick-card" onClick={() => setPage('transfer')}><div className="quick-icon">🔄</div><strong>Transfer Money</strong><span>Atomic account-to-account transfer</span></button>
                  <button className="quick-card" onClick={() => setPage('transactions')}><div className="quick-icon">📜</div><strong>View Statement</strong><span>Inspect postings and balance snapshots</span></button>
                </div>
              </div>
            </>
          )}

          {/* ══ DEPOSIT / WITHDRAW / TRANSFER ════════════════════════════════════ */}
          {(page === 'deposit' || page === 'withdraw' || page === 'transfer') && (
            <div className="action-layout">
              <div className="action-card">
                <span className="eyebrow">{page === 'deposit' ? 'INBOUND LIQUIDITY' : page === 'withdraw' ? 'OUTBOUND DEBIT' : 'INTER-ACCOUNT MOVEMENT'}</span>
                <h2>{page === 'deposit' ? 'Deposit Funds' : page === 'withdraw' ? 'Withdraw Funds' : 'Account Transfer'}</h2>
                <p className="muted">{page === 'deposit' ? 'Funds will be transferred from the central system reserve to your account.' : page === 'withdraw' ? 'Funds will be debited with strict row-locking overdraft prevention.' : 'Execute an atomic transfer directly to any other BalanceVault account.'}</p>

                <form onSubmit={performTransaction} className="form-stack action-form">
                  <label>
                    Target Account
                    <select value={selectedId || ''} onChange={(e) => setSelectedId(e.target.value)}>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>{acc.accountNumber} ({acc.accountType}) — Available: {money(acc.balance)}</option>
                      ))}
                    </select>
                  </label>
                  <div className="available-box">
                    <span>Available Balance:</span>
                    <strong>{selectedAccount ? money(selectedAccount.balance) : '₹0.00'}</strong>
                  </div>
                  {page === 'transfer' && (
                    <label>Recipient Account Number<input type="text" required placeholder="BV-XXXXXXXX" value={txForm.targetAccountNumber} onChange={(e) => setTxForm({ ...txForm, targetAccountNumber: e.target.value })} /></label>
                  )}
                  <label>
                    Amount (INR)
                    <div className="amount-input">
                      <span>₹</span>
                      <input type="number" step="0.01" min="0.01" required placeholder="0.00" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })} />
                    </div>
                  </label>
                  <label>Description / Memo<input type="text" placeholder="e.g. Payroll, Vendor Payment, Personal Savings" value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} /></label>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button type="submit" disabled={loading} className="primary-btn">{loading ? 'Executing Transaction...' : `Confirm ${page.toUpperCase()}`}</button>
                    <button type="button" className="btn-secondary" onClick={() => setPage('overview')}>Cancel</button>
                  </div>
                </form>
              </div>

              <div className="action-aside">
                <div className="aside-icon">🛡️</div>
                <h3>Protected Financial Operation</h3>
                <p>Every operation in BalanceVault is backed by double-entry ledger postings. Row locks prevent concurrent race condition overdrafts, and idempotency headers prevent duplicate charges.</p>
                <div className="aside-divider"></div>
                <span className="aside-label">TRANSACTION GUARANTEES</span>
                <strong>Zero Overdraft Guarantee</strong>
                <p className="muted">Double-layered defense: Application validation + PostgreSQL CHECK constraints.</p>
                <strong>Idempotent Execution</strong>
                <p className="muted">Automatic unique key prevents accidental double charges if network glitches occur.</p>
              </div>
            </div>
          )}

          {/* ══ LEDGER STATEMENT ═════════════════════════════════════════════════ */}
          {page === 'transactions' && (
            <div className="transaction-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">AUDITABLE ACCOUNT LEDGER</span>
                  <h2>Account Statement</h2>
                  <p className="muted">Point-in-time double-entry postings for account <strong>{selectedAccount?.accountNumber}</strong>.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <select className="account-select" value={selectedId || ''} onChange={(e) => setSelectedId(e.target.value)}>
                    {accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.accountNumber} ({acc.accountType})</option>)}
                  </select>
                </div>
              </div>

              {statement.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📜</div>
                  <strong>No transactions recorded yet</strong>
                  <p>Deposit or transfer funds into this account to see double-entry postings.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>REFERENCE</th><th>TYPE</th><th>DIRECTION</th><th>AMOUNT</th><th>POST-TX BALANCE</th><th>MEMO</th><th>TIMESTAMP</th></tr></thead>
                    <tbody>
                      {statement.map((item) => (
                        <tr key={item.postingId}>
                          <td><strong>{item.reference}</strong></td>
                          <td><span className="type-pill">{item.entryType}</span></td>
                          <td><span className={`badge ${item.direction === 'CREDIT' ? 'badge-credit' : 'badge-debit'}`}>{item.direction === 'CREDIT' ? '+ CREDIT' : '- DEBIT'}</span></td>
                          <td className="amount-cell">{item.direction === 'CREDIT' ? '+' : '-'}{money(item.amount)}</td>
                          <td>{money(item.balanceAfter)}</td>
                          <td>{item.description}</td>
                          <td>{new Date(item.timestamp).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══ NOTIFICATIONS PAGE ════════════════════════════════════════════════ */}
          {page === 'notifications' && (
            <div>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">NOTIFICATION CENTER</span>
                  <h1>Your Notifications</h1>
                  <p className="muted">Stay updated with your account activity, application status, and security events.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {unreadCount > 0 && (
                    <button className="primary-btn btn-sm" onClick={handleMarkAllAsRead}>✓ Mark All as Read</button>
                  )}
                  <button className="btn-secondary btn-sm" onClick={loadNotifications}>🔄 Refresh</button>
                </div>
              </div>

              {notifications.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🔔</div>
                  <strong>No notifications</strong>
                  <p>You're all caught up! Notifications will appear here when you receive deposits, complete transfers, or when account applications are reviewed.</p>
                </div>
              ) : (
                <div className="section-block" style={{ background: 'white', borderRadius: '14px', border: '1px solid #e8efea', overflow: 'hidden' }}>
                  {notifications.map((n) => (
                    <div key={n.id} className={`notif-row ${!n.isRead ? 'notif-row-unread' : ''}`}>
                      <div className="notif-row-icon">{notifIcon(n.type)}</div>
                      <div className="notif-row-body">
                        <div className="notif-row-title">
                          {n.title}
                          {!n.isRead && <span className="notif-unread-pill">NEW</span>}
                        </div>
                        <div className="notif-row-msg">{n.message}</div>
                        <div className="notif-row-time">{new Date(n.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="notif-row-actions">
                        {!n.isRead && <button className="btn-secondary btn-sm" onClick={() => handleMarkAsRead(n.id)}>Mark Read</button>}
                        <button className="btn-secondary btn-sm btn-warning" onClick={() => handleDismissNotification(n.id)}>Dismiss</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ INVARIANT INSPECTOR ════════════════════════════════════════════════ */}
          {page === 'invariants' && (
            <div>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">MATHEMATICAL VERIFICATION</span>
                  <h1>Double-Entry Invariant Inspector</h1>
                  <p className="muted">Verifies that every journal entry maintains zero-sum equilibrium and money conservation across the system.</p>
                </div>
                <button className="primary-btn btn-sm" onClick={() => { loadInvariants(); loadChainAudit(); }}>🔄 Run Live Audit</button>
              </div>

              {invariantData && (
                <div className="invariant-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span className="eyebrow" style={{ color: '#86efac' }}>MATHEMATICAL PROOF STATUS</span>
                      <h2 style={{ margin: '6px 0', fontSize: '24px' }}>{invariantData.isBalanced ? '✓ LEDGER IS FULLY BALANCED' : '✗ DISCREPANCY DETECTED'}</h2>
                      <span style={{ fontSize: '11px', color: '#9bb0a5' }}>Last Verified: {new Date(invariantData.verifiedAt).toLocaleString()}</span>
                    </div>
                    <div style={{ padding: '10px 18px', background: invariantData.isBalanced ? '#052e16' : '#450a0a', border: `1px solid ${invariantData.isBalanced ? '#22c55e' : '#ef4444'}`, borderRadius: '10px', fontWeight: 800, color: invariantData.isBalanced ? '#4ade80' : '#f87171' }}>
                      Σ POSTINGS Δ = {invariantData.netDiscrepancy}
                    </div>
                  </div>
                  <div className="invariant-grid">
                    <div className="invariant-metric"><span>TOTAL DEBITS PROCESSED</span><strong>₹{invariantData.totalDebits}</strong></div>
                    <div className="invariant-metric"><span>TOTAL CREDITS PROCESSED</span><strong>₹{invariantData.totalCredits}</strong></div>
                    <div className="invariant-metric"><span>CUSTOMER BALANCES SUM</span><strong>₹{invariantData.accountBalancesSum}</strong></div>
                    <div className="invariant-metric"><span>CENTRAL RESERVE VAULT</span><strong>₹{invariantData.systemReserveBalance}</strong></div>
                    <div className="invariant-metric"><span>TOTAL JOURNAL ENTRIES</span><strong>{invariantData.journalEntriesCount}</strong></div>
                    <div className="invariant-metric"><span>TOTAL POSTINGS RECORDED</span><strong>{invariantData.postingsCount}</strong></div>
                    <div className="invariant-metric"><span>SYSTEM NET EQUITY</span><strong>₹{invariantData.totalSystemEquity}</strong></div>
                    <div className="invariant-metric"><span>DATABASE CHECK CONSTRAINT</span><strong style={{ color: '#86efac' }}>ACTIVE</strong></div>
                  </div>
                </div>
              )}

              {chainAuditData && (
                <div className="section-block" style={{ background: 'white', padding: '24px', borderRadius: '14px', border: '1px solid #e8efea' }}>
                  <div className="section-heading">
                    <div>
                      <h2>Tamper-Evident Audit Hash Chain</h2>
                      <p className="muted">Every event in AuditLedger is linked with SHA-256 hashes. Triggers reject UPDATE and DELETE at the PostgreSQL level.</p>
                    </div>
                    <span className="badge badge-active">{chainAuditData.isValid ? '✓ CRYPTOGRAPHIC CHAIN VALID' : '✗ HASH MISMATCH'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '20px', marginTop: '15px' }}>
                    <div style={{ background: '#f8faf9', padding: '16px', borderRadius: '10px', flex: 1 }}>
                      <span className="muted">Total Verified Blocks</span>
                      <div style={{ font: '800 22px Manrope', marginTop: '4px' }}>{chainAuditData.totalVerified} Events</div>
                    </div>
                    <div style={{ background: '#f8faf9', padding: '16px', borderRadius: '10px', flex: 1 }}>
                      <span className="muted">Trigger Protection Status</span>
                      <div style={{ font: '800 22px Manrope', marginTop: '4px', color: '#16a34a' }}>Enforced (Append-Only)</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ BANK ADMINISTRATION ═══════════════════════════════════════════════ */}
          {page === 'admin' && (
            <div>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">INSTITUTIONAL CONTROLS</span>
                  <h1>Bank Administration</h1>
                  <p className="muted">Manage all bank accounts, users, approve account applications, and inspect real-time system health.</p>
                </div>
              </div>

              {/* Health Bar */}
              {healthData && (
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '16px 20px', borderRadius: '12px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ color: '#166534', fontSize: '14px' }}>System Health: {healthData.status}</strong>
                    <div style={{ fontSize: '11px', color: '#15803d', marginTop: '4px' }}>
                      DB Latency: {healthData.checks?.database?.latencyMs}ms • Rate Limiter: {healthData.checks?.redis?.mode} • Invariants: {healthData.checks?.ledgerInvariants?.status}
                    </div>
                  </div>
                  <span className="badge badge-active">Postgres 17 Connected</span>
                </div>
              )}

              {/* ── ACCOUNT APPROVAL MANAGEMENT ── */}
              <div className="section-block" style={{ background: 'white', padding: '24px', borderRadius: '14px', border: '2px solid #d4edda', marginBottom: '24px' }}>
                <div className="section-heading" style={{ marginBottom: '16px' }}>
                  <div>
                    <span className="eyebrow" style={{ color: '#16a34a' }}>ACCOUNT APPROVAL MANAGEMENT</span>
                    <h2>Account Applications ({filteredApplications.length})</h2>
                    <p className="muted">Review, approve, or reject customer account applications.</p>
                  </div>
                  <button className="btn-secondary btn-sm" onClick={loadAllApplications}>🔄 Refresh</button>
                </div>

                {/* Filters */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="account-select"
                    placeholder="Search by name, email, ID..."
                    value={appSearchQuery}
                    onChange={(e) => setAppSearchQuery(e.target.value)}
                    style={{ flex: 1, minWidth: '200px' }}
                  />
                  <select className="account-select" value={appStatusFilter} onChange={(e) => setAppStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="PENDING_APPROVAL">Pending Approval</option>
                    <option value="APPROVED">Approved</option>
                    <option value="REJECTED">Rejected</option>
                  </select>
                </div>

                {/* Stats Row */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                  {['PENDING_APPROVAL', 'APPROVED', 'REJECTED'].map((s) => {
                    const count = allApplications.filter((a) => a.status === s).length;
                    const labels = { PENDING_APPROVAL: '⏳ Pending', APPROVED: '✅ Approved', REJECTED: '❌ Rejected' };
                    const colors = { PENDING_APPROVAL: '#fef9c3', APPROVED: '#dcfce7', REJECTED: '#fee2e2' };
                    return (
                      <div key={s} style={{ background: colors[s], padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', border: appStatusFilter === s ? '2px solid #15803d' : '2px solid transparent' }} onClick={() => setAppStatusFilter(appStatusFilter === s ? '' : s)}>
                        <strong>{count}</strong> {labels[s]}
                      </div>
                    );
                  })}
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>APP ID</th>
                        <th>CUSTOMER</th>
                        <th>EMAIL</th>
                        <th>ACCOUNT TYPE</th>
                        <th>STATUS</th>
                        <th>SUBMITTED</th>
                        <th>REVIEWED BY</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredApplications.length === 0 && (
                        <tr><td colSpan={8} style={{ textAlign: 'center', color: '#888', padding: '24px' }}>No applications found.</td></tr>
                      )}
                      {filteredApplications.map((app) => (
                        <tr key={app.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{app.id.slice(0, 8)}...</td>
                          <td><strong>{app.user?.fullName}</strong></td>
                          <td>{app.user?.email}</td>
                          <td><span className="account-chip">{app.accountType}</span></td>
                          <td>{appStatusBadge(app.status)}</td>
                          <td>{new Date(app.createdAt).toLocaleString()}</td>
                          <td>{app.reviewedBy?.fullName || '—'}</td>
                          <td>
                            {app.status === 'PENDING_APPROVAL' && (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button className="btn-secondary btn-sm" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }} onClick={() => handleApproveApplication(app.id)}>✓ Approve</button>
                                <button className="btn-secondary btn-sm btn-warning" onClick={() => openRejectModal(app.id)}>✕ Reject</button>
                              </div>
                            )}
                            {app.status === 'APPROVED' && (
                              <span style={{ fontSize: '12px', color: '#15803d' }}>Account: {app.account?.accountNumber || '—'}</span>
                            )}
                            {app.status === 'REJECTED' && (
                              <span style={{ fontSize: '11px', color: '#dc2626' }} title={app.rejectionReason}>Reason: {app.rejectionReason?.slice(0, 30)}...</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* All Bank Accounts */}
              <div className="section-block" style={{ background: 'white', padding: '24px', borderRadius: '14px', border: '1px solid #e8efea' }}>
                <h2>All Bank Accounts ({allAccounts.length})</h2>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>ACCOUNT NUMBER</th><th>HOLDER</th><th>TYPE</th><th>BALANCE</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
                    <tbody>
                      {allAccounts.map((acc) => (
                        <tr key={acc.id}>
                          <td><strong>{acc.accountNumber}</strong></td>
                          <td>{acc.user?.fullName} ({acc.user?.email})</td>
                          <td>{acc.accountType}</td>
                          <td className="amount-cell">{money(acc.balance)}</td>
                          <td><span className={`badge badge-${acc.status.toLowerCase()}`}>{acc.status}</span></td>
                          <td>
                            {acc.accountType !== 'SYSTEM_RESERVE' && (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                {acc.status === 'ACTIVE' ? (
                                  <button className="btn-secondary btn-sm btn-warning" onClick={() => handleUpdateAccountStatus(acc.id, 'FROZEN')}>Freeze</button>
                                ) : (
                                  <button className="btn-secondary btn-sm" style={{ background: '#dcfce7', color: '#15803d' }} onClick={() => handleUpdateAccountStatus(acc.id, 'ACTIVE')}>Unfreeze</button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* User Directory */}
              <div className="section-block" style={{ background: 'white', padding: '24px', borderRadius: '14px', border: '1px solid #e8efea', marginTop: '24px' }}>
                <h2>Bank User Directory ({allUsers.length})</h2>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>NAME</th><th>EMAIL</th><th>ROLE</th><th>ACCOUNTS</th><th>JOINED</th></tr></thead>
                    <tbody>
                      {allUsers.map((u) => (
                        <tr key={u.id}>
                          <td><strong>{u.fullName}</strong></td>
                          <td>{u.email}</td>
                          <td><span className={`badge badge-${u.role.toLowerCase()}`}>{u.role}</span></td>
                          <td>{u.accounts?.length || 0} Accounts</td>
                          <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Audit Ledger */}
              <div className="section-block" style={{ background: 'white', padding: '24px', borderRadius: '14px', border: '1px solid #e8efea', marginTop: '24px' }}>
                <h2>Immutable Audit Ledger (Latest {auditLogs.length} Events)</h2>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>ACTION</th><th>ENTITY</th><th>ACTOR</th><th>HASH LINK (SHA-256)</th><th>TIMESTAMP</th></tr></thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td><strong>{log.action}</strong></td>
                          <td>{log.entityType} ({log.entityId.slice(0, 8)}...)</td>
                          <td>{log.actor?.fullName || 'System / Unauth'}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: '9px', color: '#64748b' }}>{log.currentHash?.slice(0, 16)}...</td>
                          <td>{new Date(log.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <footer className="page-footer">
            BalanceVault Secure Banking Ledger • Indian Rupee (₹ INR) • PostgreSQL 17 + Prisma ORM
          </footer>
        </div>
      </main>

      {/* ══ MODAL: New Account Application ══════════════════════════════════════ */}
      {showNewAccountModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Apply for a New Account</h3>
              <button className="close-btn" onClick={() => setShowNewAccountModal(false)}>✕</button>
            </div>
            <div className="alert" style={{ background: '#fef9c3', border: '1px solid #fde047', color: '#854d0e', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', marginBottom: '16px' }}>
              ℹ️ New account requests require <strong>administrator approval</strong> before activation. You will be notified when reviewed.
            </div>
            <p className="muted" style={{ marginBottom: '20px' }}>Submit an application for an additional vault account. Each account receives a unique account number and individual balance tracking.</p>
            <form onSubmit={(e) => { e.preventDefault(); handleSubmitApplication(); }} className="form-stack">
              <label>
                Account Type
                <select value={newAccountType} onChange={(e) => setNewAccountType(e.target.value)}>
                  <option value="CHECKING">Checking Account (Everyday Transactions)</option>
                  <option value="SAVINGS">Savings Account (Yield &amp; Storage)</option>
                </select>
              </label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                <button type="submit" disabled={loading} className="primary-btn">{loading ? 'Submitting...' : 'Submit Application'}</button>
                <button type="button" className="btn-secondary" onClick={() => setShowNewAccountModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ MODAL: Reject Application ════════════════════════════════════════════ */}
      {showRejectModal && (
        <div className="modal-backdrop">
          <div className="modal-box">
            <div className="modal-header">
              <h3>Reject Account Application</h3>
              <button className="close-btn" onClick={() => setShowRejectModal(false)}>✕</button>
            </div>
            <p className="muted" style={{ marginBottom: '16px' }}>
              Please provide a clear reason for rejection. This reason will be shared with the customer via notification.
            </p>
            {error && <div className="alert error">{error}</div>}
            <div className="form-stack">
              <label>
                Rejection Reason (required)
                <textarea
                  rows={4}
                  style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #dde3e0', borderRadius: '8px', fontFamily: 'inherit', fontSize: '14px', resize: 'vertical' }}
                  placeholder="e.g. Insufficient documentation, duplicate account request, etc."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                <button className="primary-btn" style={{ background: '#dc2626' }} onClick={handleRejectApplication}>Confirm Rejection</button>
                <button className="btn-secondary" onClick={() => { setShowRejectModal(false); setError(''); }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
