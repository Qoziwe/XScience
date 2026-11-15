/** Login page. FUNCTIONAL_SPEC.md §6. */
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, AuthError } from '@/api';
import { Card } from '@/components/ui';

const MAX_PASSWORD_ATTEMPTS = 5;
const LOCK_SECONDS = 30;
const MAX_CODE_ATTEMPTS = 3;

type Step = 'login' | 'code' | 'done';

export function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('login');
  const [login, setLogin] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [caps, setCaps] = useState(false);
  const [fails, setFails] = useState(0);
  const [lockLeft, setLockLeft] = useState(0);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [codeFails, setCodeFails] = useState(0);
  const [sessionEnd, setSessionEnd] = useState('');

  // Lockout countdown; the attempt counter resets once it reaches zero.
  useEffect(() => {
    if (lockLeft <= 0) return;
    const t = setTimeout(() => {
      const next = lockLeft - 1;
      setLockLeft(next);
      if (next <= 0) {
        setFails(0);
        setErr('');
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [lockLeft]);

  const locked = lockLeft > 0;
  const cantSubmit = locked || !login.trim() || !pwd;
  const cantCode = code.length !== 6;

  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (cantSubmit) return;
    try {
      await api.auth.login(login, pwd);
      setStep('code');
      setPwd('');
      setErr('');
      setFails(0);
      setShowPwd(false);
    } catch (e2) {
      if (!(e2 instanceof AuthError)) throw e2;
      const f = fails + 1;
      setFails(f);
      setPwd('');
      if (f >= MAX_PASSWORD_ATTEMPTS) {
        setLockLeft(LOCK_SECONDS);
        setErr('Too many attempts. Login is temporarily locked.');
      } else {
        // The message never clarifies what exactly is wrong (§6.1).
        setErr('Incorrect login or password.');
      }
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    if (cantCode) return;
    try {
      const user = await api.auth.verifyCode(code);
      setSessionEnd(user.expiresAt);
      setStep('done');
      setCode('');
      setCodeErr('');
    } catch (e2) {
      if (!(e2 instanceof AuthError)) throw e2;
      const f = codeFails + 1;
      setCode('');
      if (f >= MAX_CODE_ATTEMPTS) {
        setStep('login');
        setCodeFails(0);
        setCodeErr('');
        setLogin('');
        setErr('The code was entered incorrectly three times. Please log in again.');
      } else {
        setCodeFails(f);
        setCodeErr(`Incorrect code. Attempts remaining: ${MAX_CODE_ATTEMPTS - f}.`);
      }
    }
  };

  return (
    <div className="login">
      <header className="header" style={{ gap: 10 }}>
        <div className="brand">
          <div className="brand__mark">X</div>
          <div className="brand__text">
            <span className="brand__name">XScience</span>
            <span className="brand__sub">Fire situation · microgravity</span>
          </div>
        </div>
      </header>

      <main className="login__main">
        <div className="login__box">
          {step === 'login' ? (
            <Card>
              <form className="login__form" onSubmit={submitLogin}>
                <div>
                  <div className="login__title">Sign In</div>
                  <div className="login__sub">
                    Access for staff only. Accounts are issued by the administrator.
                  </div>
                </div>

                <div className="login__field">
                  <label className="login__label" htmlFor="login">
                    Username
                  </label>
                  <input
                    id="login"
                    className="login__input"
                    value={login}
                    autoComplete="username"
                    autoCapitalize="off"
                    spellCheck={false}
                    disabled={locked}
                    onChange={(e) => setLogin(e.target.value)}
                  />
                </div>

                <div className="login__field">
                  <label className="login__label" htmlFor="pwd">
                    Password
                  </label>
                  <div className="login__pwd">
                    <input
                      id="pwd"
                      className="login__input"
                      type={showPwd ? 'text' : 'password'}
                      value={pwd}
                      autoComplete="current-password"
                      disabled={locked}
                      onChange={(e) => setPwd(e.target.value)}
                      onKeyUp={(e) => setCaps(e.getModifierState?.('CapsLock') ?? false)}
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setShowPwd((v) => !v)}
                      disabled={locked}
                    >
                      {showPwd ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {caps ? <span className="login__sub">Caps Lock is on</span> : null}
                </div>

                <div className="login__row">
                  {/* [PROTOTYPE] does nothing. [QUESTION] recovery procedure. */}
                  <button type="button" className="btn--link" onClick={(e) => e.preventDefault()}>
                    Forgot password?
                  </button>
                </div>

                {err ? <span className="login__error">{err}</span> : null}

                <button type="submit" className="btn btn--primary btn--run" disabled={cantSubmit}>
                  {locked ? `Try again in ${lockLeft} s` : 'Sign in'}
                </button>

                {fails > 0 && !locked ? (
                  <span className="login__sub">
                    Attempts remaining: {MAX_PASSWORD_ATTEMPTS - fails}
                  </span>
                ) : null}
              </form>
            </Card>
          ) : null}

          {step === 'code' ? (
            <Card>
              <form className="login__form" onSubmit={submitCode}>
                <div>
                  <div className="login__step">step 2 of 2</div>
                  <div className="login__title">Verification Code</div>
                  <div className="login__sub">
                    Enter the 6-digit code from the authenticator app.
                  </div>
                </div>

                <div className="login__field">
                  <label className="login__label" htmlFor="code">
                    Code
                  </label>
                  <input
                    id="code"
                    className="login__input login__input--code"
                    value={code}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  />
                </div>

                {codeErr ? <span className="login__error">{codeErr}</span> : null}

                <button type="submit" className="btn btn--primary btn--run" disabled={cantCode}>
                  Confirm
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setStep('login');
                    setCode('');
                    setCodeErr('');
                    setCodeFails(0);
                  }}
                >
                  Back
                </button>
              </form>
            </Card>
          ) : null}

          {step === 'done' ? (
            <Card>
              <div className="login__form">
                <div className="login__title">Signed In</div>
                <div className="login__sub">
                  Session active until {sessionEnd} or until logout. After 15 minutes of inactivity,
                  you will need to sign in again.
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--run"
                  onClick={() => navigate('/console')}
                >
                  Open Console
                </button>
              </div>
            </Card>
          ) : null}

          <div className="login__tips">
            <span>A login error never clarifies what exactly is wrong: username or password.</span>
            <span>After 5 failed attempts, login is locked for 30 seconds.</span>
            <span>The password is not stored in the browser and is not included in analysis history.</span>
            <span>
              UI prototype. Validation of the username, password, and code should be performed on
              the server (Flask) over HTTPS. To test the mock-up: username <code>demo</code>, password{' '}
              <code>xscience-demo</code>, code <code>123456</code>.
            </span>
            <span>
              <Link to="/console">Open the console without signing in</Link> — [PROTOTYPE] the console
              is not protected by a session (§22).
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
