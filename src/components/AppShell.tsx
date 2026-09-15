import { Activity, ArrowLeft, Boxes, ClipboardList, LayoutDashboard, LogOut, Map, MapPin, Menu, Move, PackageCheck, Settings2, WifiOff, X } from "lucide-react";
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
  const isHome = location.pathname === "/";
  const desktopLinks = [
    { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, permission: "warehouse:view_map" as const },
    { section: "OPERASYON" },
    { label: "Order Picking", to: "/picking-management", icon: ClipboardList },
    { label: "Mal Kabul", to: "/admin/inbound", icon: PackageCheck, permission: "warehouse:receive" as const },
    { label: "Ürün Taşıma", to: "/admin/move", icon: Move, permission: "warehouse:move_stock" as const },
    { section: "DEPO" },
    { label: "Depo Haritası", to: "/warehouse-map", icon: Map, permission: "warehouse:view_map" as const },
    { label: "Paketler", to: "/packages", icon: Boxes, permission: "warehouse:view_analytics" as const },
    { label: "Lokasyonlar", to: "/locations", icon: MapPin, permission: "warehouse:view_map" as const },
    { label: "Stok", to: "/stock", icon: Boxes, permission: "warehouse:view_analytics" as const },
    { section: "ANALİZ" },
    { label: "Hareketler", to: "/movements", icon: Activity, permission: "warehouse:view_analytics" as const },
    { label: "Kullanıcı Aktiviteleri", to: "/user-activity", icon: Activity, permission: "warehouse:view_analytics" as const },
    { label: "Kapasite", to: "/capacity", icon: LayoutDashboard, permission: "warehouse:view_analytics" as const },
    { section: "YÖNETİM" },
    { label: "Ayarlar", to: "/admin", icon: Settings2 },
  ];
  const visibleLinks = desktopLinks.filter((item) => !("permission" in item) || !item.permission || hasWarehousePermission(user, item.permission));

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
          <div className="flex items-center gap-2"><span className="hidden rounded-full border border-line bg-white px-3 py-1.5 text-xs font-bold text-muted sm:block">{user?.username}</span><button className="icon-button" aria-label="Çıkış yap" title={`${user?.username} · Çıkış yap`} onClick={() => void logout()}><LogOut size={20}/></button></div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 pb-28 lg:px-8 lg:pb-10">{children}</main>
        <nav className="mobile-bottom-nav">
          <NavLink to="/orders"><ClipboardList/><span>Toplama</span></NavLink>
          {hasWarehousePermission(user, "warehouse:receive") && <NavLink to="/admin/inbound"><PackageCheck/><span>Mal Kabul</span></NavLink>}
          {hasWarehousePermission(user, "warehouse:move_stock") && <NavLink to="/admin/move"><Move/><span>Taşı</span></NavLink>}
          <NavLink to="/history"><Activity/><span>Geçmiş</span></NavLink>
        </nav>
      </div>
    </div>
  );
}
