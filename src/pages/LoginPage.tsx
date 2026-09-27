import { Check } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { getErrorMessage } from "../lib/api";
import { useApiStatus } from "../lib/apiStatus";

export function LoginPage() {
  const { login } = useAuth();
  const apiStatus = useApiStatus();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(username, password);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-terminal">
        <div className="login-brand">
          <span className="brand-mark">DS</span>
          <span><small>DSDST</small><strong>Warehouse</strong></span>
        </div>
        <div className="login-copy">
          <p>Warehouse Terminal</p>
          <h1>Operasyona hazır.</h1>
          <span>Sipariş toplama, paketleme ve sevkiyat için güvenli mobil terminal.</span>
        </div>
        <div className={`login-connection login-connection-${apiStatus}`}><i aria-hidden="true"/>{apiStatus === "connected" ? "Panel bağlantısı hazır" : apiStatus === "disconnected" ? "Panel bağlantısı yok" : "Panel bağlantısı kontrol ediliyor"}</div>
      </section>

      <section className="login-sheet" aria-labelledby="login-title">
        <div className="login-form-heading">
          <h2 id="login-title">Oturum aç</h2>
          <p>Panel kullanıcı bilgilerinizle devam edin.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <div>
            <label htmlFor="username">Kullanıcı adı veya e-posta</label>
            <input id="username" className="field" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required/>
          </div>
          <div>
            <label htmlFor="password">Şifre</label>
            <input id="password" className="field" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/>
          </div>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button className="primary-button login-submit" type="submit" disabled={busy || !username.trim() || !password}>
            {busy ? "Giriş yapılıyor…" : "Warehouse'a Gir"}
          </button>
        </form>
        <div className="login-trust">
          <span><Check size={17}/></span>
          <div><strong>Kurumsal kimlik doğrulama</strong><small>Yetkiler Panel hesabından otomatik uygulanır.</small></div>
        </div>
      </section>
    </main>
  );
}
