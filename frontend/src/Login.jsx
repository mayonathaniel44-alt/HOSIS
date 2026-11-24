import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound, LogOut } from 'lucide-react';
import './login.css';

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lock, setLock] = useState(null);
  const [now, setNow] = useState(Date.now());
  const sameAccount = lock?.username === username.trim().toLowerCase();
  const secondsLeft = sameAccount ? Math.max(0, Math.ceil((lock.until - now) / 1000)) : 0;
  const blocked = sameAccount && lock.blocked;
  useEffect(() => {
    if (!lock || lock.blocked) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lock]);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
          const data = await response.json();
          if (active) setUser(data.user);
        } else if (response.status === 401 && active) {
          setUser(null);
        }
      } catch { /* Show the sign-in form if the service is unavailable. */ }
      finally { if (active) setChecking(false); }
    }
    checkSession();
    const timer = setInterval(checkSession, 60000);
    function onFocus() { checkSession(); }
    window.addEventListener('focus', onFocus);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, []);

  async function signIn(event) {
    event.preventDefault();
    if (busy || secondsLeft > 0 || blocked) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (data.retryAfter || data.code === 'ACCOUNT_BLOCKED') {
        const time = Date.now();
        setNow(time);
        setLock({ username: username.trim().toLowerCase(), until: time + (data.retryAfter || 0) * 1000, blocked: data.code === 'ACCOUNT_BLOCKED' });
      }
      if (!response.ok) throw new Error(data.message || 'Unable to sign in. Please try again.');
      setPassword('');
      setUser(data.user);
      setLock(null);
    } catch (failure) {
      setError(failure instanceof TypeError || failure instanceof SyntaxError
        ? 'Unable to connect. Please check that the hotel server is running.' : failure.message);
    } finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error();
      setUser(null);
      setPassword('');
    } catch { setError('Unable to sign out. Please try again.'); }
    finally { setBusy(false); }
  }

  if (checking) return <main className="auth-loading" role="status">Opening Grand Horizon Hotel…</main>;
  if (user) return children({ user, signOut, busy, authError: error, LogOut });

  return (
    <main className="login-page">
      <section className="login-brand-panel" aria-label="Grand Horizon Hotel">
        <div className="login-brand-top"><span className="brand-dot" /> HOSIS <span>SALES & MARKETING</span></div>
        <div className="login-brand-content">
          <img className="login-logo" src="/HOSISLOGO.png" alt="Grand Horizon Hotel — Stay, Relax, Belong" />
          <div className="login-gold-rule" />
          <p className="login-eyebrow">GRAND HORIZON HOTEL</p>
          <h1>Exceptional stays.<br /><em>Endless possibilities.</em></h1>
          <p className="login-brand-description">Connect with guests, grow your partnerships, and bring every opportunity into view.</p>
        </div>
        <div className="login-brand-footer"><span>STAY · RELAX · BELONG</span><span>EST. GRAND HORIZON</span></div>
      </section>

      <section className="login-form-panel">
        <div className="login-top-label"><ShieldCheck size={16} /> HOTEL MANAGEMENT PORTAL · IMPROVED COPY</div>
        <div className="login-form-wrap">
          <div className="login-lock"><LockKeyhole size={25} strokeWidth={1.7} /></div>
          <p className="login-eyebrow">WELCOME TO GRAND HORIZON</p>
          <h2>Welcome back.</h2>
          <p className="login-description">Sign in to your Sales & Marketing workspace.</p>
          <form onSubmit={signIn} className="login-form">
            <label htmlFor="login-username">Username</label>
            <div className="login-input-wrap"><UserRound size={18} /><input id="login-username" name="username" autoComplete="username" placeholder="Enter your username" value={username} onChange={event => setUsername(event.target.value)} required maxLength={100} disabled={busy} /></div>
            <label htmlFor="login-password">Password</label>
            <div className="login-input-wrap"><LockKeyhole size={18} /><input id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} required maxLength={256} disabled={busy} /><button type="button" className="login-visibility" onClick={() => setVisible(value => !value)} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            {error && <p className="login-error" role="alert">{error}</p>}
            {secondsLeft > 0 && <p role="status">Try again in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}.</p>}
            <button className="login-submit" type="submit" disabled={busy || secondsLeft > 0 || blocked}>{busy ? 'Signing in…' : blocked ? 'Account blocked' : secondsLeft > 0 ? 'Please wait' : 'Sign in'}<ArrowRight size={18} /></button>
          </form>
          <div className="login-access-note"><ShieldCheck size={19} /><p>5 wrong passwords: locked for 15 minutes.<br /><span>Three lockouts in a row: blocked until your admin unlocks the account.</span></p></div>
        </div>
        <footer className="login-footer">© {new Date().getFullYear()} Grand Horizon Hotel <span>Hotel Operations & Services Integrated System</span></footer>
      </section>
    </main>
  );
}
