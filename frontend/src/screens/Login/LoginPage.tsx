/** Страница входа. FUNCTIONAL_SPEC.md §6. */
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

  // Обратный отсчёт блокировки; по окончании счётчик попыток сбрасывается.
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
        setErr('Слишком много попыток. Вход временно заблокирован.');
      } else {
        // Сообщение никогда не уточняет, что именно неверно (§6.1).
        setErr('Неверный логин или пароль.');
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
        setErr('Код введён неверно три раза. Войдите заново.');
      } else {
        setCodeFails(f);
        setCodeErr(`Неверный код. Осталось попыток: ${MAX_CODE_ATTEMPTS - f}.`);
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
            <span className="brand__sub">Пожарная обстановка · микрогравитация</span>
          </div>
        </div>
      </header>

      <main className="login__main">
        <div className="login__box">
          {step === 'login' ? (
            <Card>
              <form className="login__form" onSubmit={submitLogin}>
                <div>
                  <div className="login__title">Вход в систему</div>
                  <div className="login__sub">
                    Доступ только для сотрудников. Учётную запись выдаёт администратор.
                  </div>
                </div>

                <div className="login__field">
                  <label className="login__label" htmlFor="login">
                    Логин
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
                    Пароль
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
                      {showPwd ? 'Скрыть' : 'Показать'}
                    </button>
                  </div>
                  {caps ? <span className="login__sub">Включён Caps Lock</span> : null}
                </div>

                <div className="login__row">
                  {/* [ПРОТОТИП] ничего не делает. [ВОПРОС] процедура восстановления. */}
                  <button type="button" className="btn--link" onClick={(e) => e.preventDefault()}>
                    Забыли пароль?
                  </button>
                </div>

                {err ? <span className="login__error">{err}</span> : null}

                <button type="submit" className="btn btn--primary btn--run" disabled={cantSubmit}>
                  {locked ? `Повторите через ${lockLeft} с` : 'Войти'}
                </button>

                {fails > 0 && !locked ? (
                  <span className="login__sub">
                    Осталось попыток: {MAX_PASSWORD_ATTEMPTS - fails}
                  </span>
                ) : null}
              </form>
            </Card>
          ) : null}

          {step === 'code' ? (
            <Card>
              <form className="login__form" onSubmit={submitCode}>
                <div>
                  <div className="login__step">шаг 2 из 2</div>
                  <div className="login__title">Код подтверждения</div>
                  <div className="login__sub">
                    Введите 6-значный код из приложения-аутентификатора.
                  </div>
                </div>

                <div className="login__field">
                  <label className="login__label" htmlFor="code">
                    Код
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
                  Подтвердить
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
                  Назад
                </button>
              </form>
            </Card>
          ) : null}

          {step === 'done' ? (
            <Card>
              <div className="login__form">
                <div className="login__title">Вход выполнен</div>
                <div className="login__sub">
                  Сессия активна до {sessionEnd} или до выхода. При бездействии 15 минут вход
                  потребуется снова.
                </div>
                <button
                  type="button"
                  className="btn btn--primary btn--run"
                  onClick={() => navigate('/console')}
                >
                  Открыть панель
                </button>
              </div>
            </Card>
          ) : null}

          <div className="login__tips">
            <span>Ошибка входа не уточняет, что именно неверно: логин или пароль.</span>
            <span>После 5 неверных попыток вход блокируется на 30 секунд.</span>
            <span>Пароль не сохраняется в браузере и не попадает в историю анализов.</span>
            <span>
              Прототип интерфейса. Проверка логина, пароля и кода должна выполняться на сервере
              (Flask) по HTTPS. Для проверки макета: логин <code>demo</code>, пароль{' '}
              <code>xscience-demo</code>, код <code>123456</code>.
            </span>
            <span>
              <Link to="/console">Открыть панель без входа</Link> — [ПРОТОТИП] панель не защищена
              сессией (§22).
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
