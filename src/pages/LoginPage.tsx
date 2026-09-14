import { Boxes, LogIn } from "lucide-react";
import { useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { getErrorMessage } from "../lib/api";

export function LoginPage() {
  const { login } = useAuth();
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
    <main className="grid min-h-dvh place-items-center bg-canvas px-4 py-8 text-ink">
      <section className="w-full max-w-md rounded-[2rem] border border-line bg-white p-6 shadow-xl shadow-forest/10">
        <div className="grid size-14 place-items-center rounded-2xl bg-forest text-acid"><Boxes size={30}/></div>
        <p className="mt-6 eyebrow">DSDST Warehouse</p>
        <h1 className="page-title">Oturum açın</h1>
        <p className="mt-2 text-sm text-muted">Panel kullanıcı adınız veya e-postanızla giriş yapın.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div><label className="text-sm font-black" htmlFor="username">Kullanıcı adı / e-posta</label><input id="username" className="field mt-2" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required autoFocus/></div>
          <div><label className="text-sm font-black" htmlFor="password">Şifre</label><input id="password" className="field mt-2" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required/></div>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-danger" role="alert">{error}</p>}
          <button className="primary-button w-full" type="submit" disabled={busy || !username.trim() || !password}><LogIn size={21}/>{busy ? "Giriş yapılıyor..." : "Giriş Yap"}</button>
        </form>
      </section>
    </main>
  );
}
