import { Activity, ArrowLeft, Boxes, ClipboardList, Layers3, LayoutDashboard, LogOut, Map, MapPin, Menu, Move, PackageCheck, RotateCcw, Settings2, Truck, UserRound, WifiOff, X } from "lucide-react";
import { useState, type PropsWithChildren } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const isHome = location.pathname === "/";
  const desktopLinks = [
    { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, permission: "warehouse:view_map" as const },
    { section: "OPERASYON" },
    { label: "Order Picking", to: "/picking-management", icon: ClipboardList },
    { label: "Mal Kabul", to: "/admin/inbound", icon: PackageCheck, permission: "warehouse:receive" as const },
    { label: "İade Kabul", to: "/returns", icon: RotateCcw, permission: "warehouse:accept_returns" as const },
    { label: "Sevkiyat", to: "/shipments", icon: Truck, permission: "shipping:manage" as const },
    { label: "Ürün Taşıma", to: "/admin/move", icon: Move, permission: "warehouse:move_stock" as const },
    { section: "DEPO" },
    { label: "Depo Yerleşimi", to: "/warehouse-layout", icon: Layers3, permission: "warehouse:view_map" as const },
    { label: "Depo Haritası", to: "/warehouse-map", icon: Map, permission: "warehouse:view_map" as const },
    { label: "Paketler", to: "/packages", icon: Boxes, permission: "warehouse:view_analytics" as const },
    { label: "Lokasyonlar", to: "/locations", icon: MapPin, permission: "warehouse:view_map" as const },
    { label: "Ürünler", to: "/stock", icon: Boxes, permission: "warehouse:view_analytics" as const },
    { section: "ANALİZ" },
    { label: "Hareketler", to: "/movements", icon: Activity, permission: "warehouse:view_analytics" as const },
    { label: "Kullanıcı Aktiviteleri", to: "/user-activity", icon: Activity, permission: "warehouse:view_analytics" as const },
    { label: "Kapasite", to: "/capacity", icon: LayoutDashboard, permission: "warehouse:view_analytics" as const },
    { section: "YÖNETİM" },
    { label: "Ayarlar", to: "/admin", icon: Settings2 },
  ];
  const visibleLinks = desktopLinks.filter((item) => !("permission" in item) || !item.permission || hasWarehousePermission(user, item.permission));

  async function confirmLogout() {
    setLogoutBusy(true);
    try {
      await logout();
    } finally {
      setLogoutBusy(false);
      setLogoutConfirmOpen(false);
    }
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      {!online && <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-danger px-4 py-3 text-sm font-black text-white"><WifiOff size={18}/> Panel bağlantısı yok</div>}
      <aside className={`wms-sidebar ${menuOpen ? "wms-sidebar-open" : ""}`}>
        <div className="flex items-center justify-between px-5 py-6">
          <Link to="/dashboard" className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-acid text-forest"><Boxes size={22}/></span><span><b className="block">DSDST WMS</b><small className="text-white/50">Management System</small></span></Link>
          <button className="lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat"><X/></button>
        </div>
        <nav className="space-y-1 px-3">{visibleLinks.map((item, index) => "section" in item
          ? <p key={`${item.section}-${index}`} className="px-3 pb-1 pt-5 text-[10px] font-black tracking-[.18em] text-white/35">{item.section}</p>
          : <NavLink key={item.to} to={item.to!} onClick={() => setMenuOpen(false)} className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-active" : ""}`}><item.icon size={18}/>{item.label}</NavLink>)}</nav>
      </aside>
      {menuOpen && <button className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-label="Menüyü kapat" onClick={() => setMenuOpen(false)}/>}
      <div className="wms-content">
        <header className="mx-auto flex w-full max-w-[1600px] items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] lg:px-8">
          <div className="flex items-center gap-3">
            {!isHome && <button className="icon-button" aria-label="Geri" onClick={() => navigate(-1)}><ArrowLeft size={22}/></button>}
            <button className="icon-button lg:hidden" aria-label="Menü" onClick={() => setMenuOpen(true)}><Menu size={22}/></button>
            <Link to="/" className="flex items-center gap-2.5"><span className="grid size-10 place-items-center rounded-xl bg-forest text-acid shadow-sm"><Boxes size={22} strokeWidth={2.4}/></span><span><span className="block text-[10px] font-black uppercase tracking-[0.22em] text-moss">DSDST</span><span className="block text-lg font-black leading-none tracking-tight">Warehouse</span></span></Link>
          </div>
          <div className="relative flex items-center gap-2">
            <span className="hidden rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-muted sm:block">{user?.username}</span>
            <button
              className="icon-button"
              aria-label="Hesap menüsü"
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              title={`${user?.username} · Hesap menüsü`}
              onClick={() => setAccountMenuOpen((open) => !open)}
            ><UserRound size={20}/></button>
            {accountMenuOpen && <>
              <button className="fixed inset-0 z-40 cursor-default" aria-label="Hesap menüsünü kapat" onClick={() => setAccountMenuOpen(false)}/>
              <div className="absolute right-0 top-14 z-50 w-64 overflow-hidden rounded-2xl border border-line bg-white p-2 shadow-[0_18px_50px_rgba(7,26,22,.18)]" role="menu">
                <div className="border-b border-line px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[.16em] text-moss">Oturum</p>
                  <p className="mt-1 truncate text-sm font-black text-ink">{user?.username}</p>
                </div>
                <Link to="/admin" role="menuitem" className="mt-1 flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-black hover:bg-canvas" onClick={() => setAccountMenuOpen(false)}><Settings2 size={19}/>Ayarlar</Link>
                <button
                  role="menuitem"
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-black text-danger hover:bg-red-50"
                  onClick={() => { setAccountMenuOpen(false); setLogoutConfirmOpen(true); }}
                ><LogOut size={19}/>Çıkış Yap</button>
              </div>
            </>}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 pb-28 lg:px-8 lg:pb-10">{children}</main>
        <nav className="mobile-bottom-nav">
          <NavLink to="/orders"><ClipboardList/><span>Toplama</span></NavLink>
          {hasWarehousePermission(user, "warehouse:receive") && <NavLink to="/admin/inbound"><PackageCheck/><span>Mal Kabul</span></NavLink>}
          {hasWarehousePermission(user, "warehouse:accept_returns") && <NavLink to="/returns"><RotateCcw/><span>İade</span></NavLink>}
          {hasWarehousePermission(user, "warehouse:move_stock") && <NavLink to="/admin/move"><Move/><span>Taşı</span></NavLink>}
          <NavLink to="/history"><Activity/><span>Geçmiş</span></NavLink>
        </nav>
      </div>
      {logoutConfirmOpen && <div className="fixed inset-0 z-[70] grid place-items-center bg-forest/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !logoutBusy) setLogoutConfirmOpen(false); }}>
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title" aria-describedby="logout-dialog-description">
          <span className="grid size-12 place-items-center rounded-2xl bg-red-50 text-danger"><LogOut size={23}/></span>
          <h2 id="logout-dialog-title" className="mt-5 text-2xl font-black">Çıkış yapmak istiyor musun?</h2>
          <p id="logout-dialog-description" className="mt-2 text-sm leading-6 text-muted">Aktif oturumun kapatılacak ve giriş ekranına yönlendirileceksin.</p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button className="secondary-button" disabled={logoutBusy} onClick={() => setLogoutConfirmOpen(false)}>Vazgeç</button>
            <button className="primary-button !bg-danger" disabled={logoutBusy} onClick={() => void confirmLogout()}>{logoutBusy ? "Çıkılıyor…" : "Evet, çıkış yap"}</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
