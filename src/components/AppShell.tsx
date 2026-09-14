import { ArrowLeft, Boxes, LogOut, WifiOff } from "lucide-react";
import type { PropsWithChildren } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useAuth } from "../features/auth/AuthContext";

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { user, logout } = useAuth();
  const isHome = location.pathname === "/";

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      {!online && (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-danger px-4 py-3 text-sm font-black text-white">
          <WifiOff size={18} /> Panel bağlantısı yok
        </div>
      )}
      <header className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          {!isHome && (
            <button className="icon-button" aria-label="Geri" onClick={() => navigate(-1)}>
              <ArrowLeft size={22} />
            </button>
          )}
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-10 place-items-center rounded-xl bg-forest text-acid shadow-sm">
              <Boxes size={22} strokeWidth={2.4} />
            </span>
            <span>
              <span className="block text-[10px] font-black uppercase tracking-[0.22em] text-moss">DSDST</span>
              <span className="block text-lg font-black leading-none tracking-tight">Warehouse</span>
            </span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-muted sm:block">{user?.username}</span>
          <button className="icon-button" aria-label="Çıkış yap" title={`${user?.username} · Çıkış yap`} onClick={() => void logout()}><LogOut size={20}/></button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">{children}</main>
    </div>
  );
}
