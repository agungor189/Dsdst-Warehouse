import {
  Activity, AlertTriangle, ArrowDownUp, Boxes, Check, ClipboardList, Hash, Home, Layers3, LayoutDashboard,
  LogOut, Map, MapPin, Menu, MoreHorizontal, Move, PackageCheck, Printer, RotateCcw,
  ScanLine, Send, Settings2, Truck, UserRound, X,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentType, type PropsWithChildren } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";
import { useApiStatus } from "../lib/apiStatus";
import type { WarehousePermission } from "../types/warehouse";

type NavItem = {
  label: string;
  description?: string;
  to: string;
  icon: ComponentType<{ size?: number }>;
  tone?: string;
  permission?: WarehousePermission;
};

const desktopLinks: Array<NavItem | { section: string }> = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard, permission: "warehouse:view_map" },
  { section: "OPERASYON" },
  { label: "Order Picking", to: "/picking-management", icon: ClipboardList, permission: "warehouse:pick_orders" },
  { label: "Mal Kabul", to: "/admin/inbound", icon: PackageCheck, permission: "warehouse:receive" },
  { label: "İade Kabul", to: "/returns", icon: RotateCcw, permission: "warehouse:accept_returns" },
  { label: "Sevkiyat", to: "/shipments", icon: Truck, permission: "shipping:manage" },
  { label: "Ürün Taşıma", to: "/admin/move", icon: Move, permission: "warehouse:move_stock" },
  { section: "DEPO" },
  { label: "Depo Yerleşimi", to: "/warehouse-layout", icon: Layers3, permission: "warehouse:view_map" },
  { label: "Depo Haritası", to: "/warehouse-map", icon: Map, permission: "warehouse:view_map" },
  { label: "Paketler", to: "/packages", icon: Boxes, permission: "warehouse:view_analytics" },
  { label: "Lokasyonlar", to: "/locations", icon: MapPin, permission: "warehouse:view_map" },
  { label: "Ürünler", to: "/stock", icon: Boxes, permission: "warehouse:view_analytics" },
  { section: "ANALİZ" },
  { label: "Hareketler", to: "/movements", icon: Activity, permission: "warehouse:view_analytics" },
  { label: "Kullanıcı Aktiviteleri", to: "/user-activity", icon: Activity, permission: "warehouse:view_analytics" },
  { label: "Kapasite", to: "/capacity", icon: LayoutDashboard, permission: "warehouse:view_analytics" },
  { label: "Sistem Kontrolü", to: "/reconciliation", icon: AlertTriangle, permission: "warehouse:view_analytics" },
  { section: "YÖNETİM" },
  { label: "Ayarlar", to: "/admin", icon: Settings2 },
];

const drawerGroups: Array<{ title: string; items: NavItem[] }> = [
  { title: "OPERASYON", items: [
    { label: "Toplama", description: "Picking kuyruğu", to: "/orders", icon: Check, tone: "cobalt", permission: "warehouse:pick_orders" },
    { label: "Paketleme", description: "Paket hazırlama", to: "/shipments", icon: PackageCheck, tone: "teal", permission: "shipping:manage" },
    { label: "Sevkiyat", description: "Kargo ve handoff", to: "/shipments", icon: Send, tone: "purple", permission: "shipping:manage" },
    { label: "İade", description: "İade ve kalite", to: "/returns", icon: RotateCcw, tone: "danger", permission: "warehouse:accept_returns" },
    { label: "Yükleme Alanı", description: "Yükleme / handoff", to: "/shipments", icon: Truck, tone: "warning", permission: "shipping:dispatch" },
  ] },
  { title: "DEPO", items: [
    { label: "Ürün Taşıma", description: "Paket lokasyonu", to: "/admin/move", icon: ArrowDownUp, permission: "warehouse:move_stock" },
    { label: "Stok", description: "Canlı stok görünümü", to: "/stock", icon: Boxes, permission: "warehouse:view_analytics" },
    { label: "Stok Sayımı", description: "Fiziksel sayım", to: "/admin/count", icon: Hash, permission: "warehouse:count_stock" },
    { label: "Lokasyonlar", description: "Kapasite ve doluluk", to: "/admin/locations", icon: MapPin, permission: "warehouse:manage_locations" },
    { label: "Replenishment", description: "Pick-face ikmali", to: "/admin/replenishments", icon: Move, permission: "warehouse:move_stock" },
  ] },
  { title: "DİĞER / YÖNETİM", items: [
    { label: "Mal Kabul", description: "Sevki kabulü", to: "/admin/inbound", icon: PackageCheck, permission: "warehouse:receive" },
    { label: "Baskı İşleri", description: "Etiket kuyruğu", to: "/admin/prints", icon: Printer, permission: "warehouse:print_labels" },
    { label: "Ayarlar", description: "Warehouse yönetimi", to: "/admin", icon: Settings2 },
  ] },
];

function Brand({ dark = false }: { dark?: boolean }) {
  return <span className={`app-brand ${dark ? "app-brand-dark" : ""}`}><span className="brand-mark">DS</span><span><small>DSDST</small><strong>Warehouse</strong></span></span>;
}

export function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const apiStatus = useApiStatus();
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const pickingFlow = /^\/orders\/[^/]+(?:\/pick)?$/.test(location.pathname);
  const activePicking = /^\/orders\/[^/]+\/pick$/.test(location.pathname);

  const canSee = (item: NavItem) => !item.permission || hasWarehousePermission(user, item.permission);
  const visibleDesktopLinks = desktopLinks.filter((item) => "section" in item || canSee(item));

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    drawerCloseRef.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  async function confirmLogout() {
    setLogoutBusy(true);
    try {
      await logout();
    } finally {
      setLogoutBusy(false);
      setLogoutConfirmOpen(false);
    }
  }

  const requestLogout = () => {
    setMenuOpen(false);
    setAccountMenuOpen(false);
    setLogoutConfirmOpen(true);
  };

  const requestScan = () => {
    if (activePicking) {
      window.dispatchEvent(new Event("warehouse:request-scan"));
      return;
    }
    navigate("/orders");
  };

  return (
    <div className="app-shell">
      <aside className="wms-sidebar" aria-label="Masaüstü navigasyon">
        <Link to="/dashboard" className="desktop-brand"><Brand dark /></Link>
        <nav className="desktop-nav">{visibleDesktopLinks.map((item, index) => "section" in item
          ? <p key={`${item.section}-${index}`}>{item.section}</p>
          : <NavLink key={`${item.label}-${item.to}`} to={item.to} className={({ isActive }) => `sidebar-link ${isActive ? "sidebar-link-active" : ""}`}><item.icon size={18}/>{item.label}</NavLink>)}</nav>
      </aside>

      <div className={`wms-content ${pickingFlow ? "picking-flow" : ""}`}>
        <header className="app-header">
          <Link to="/" aria-label="Ana Sayfa"><Brand dark /></Link>
          <div className="app-header-actions">
            <span className={`api-pill api-${apiStatus}`} aria-label={`Panel API: ${apiStatus === "connected" ? "bağlı" : apiStatus === "disconnected" ? "bağlantı sorunu" : "kontrol ediliyor"}`}>
              <i aria-hidden="true"/>API
            </span>
            <button className="header-menu-button mobile-only" type="button" aria-label="Menüyü aç" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={19}/></button>
            <div className="desktop-account">
              <button className="header-menu-button" type="button" aria-label="Hesap menüsü" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen((open) => !open)}><UserRound size={19}/></button>
              {accountMenuOpen && <div className="account-popover" role="menu">
                <strong>{user?.username}</strong>
                <Link to="/admin" role="menuitem" onClick={() => setAccountMenuOpen(false)}><Settings2 size={17}/>Ayarlar</Link>
                <button role="menuitem" onClick={requestLogout}><LogOut size={17}/>Çıkış Yap</button>
              </div>}
            </div>
          </div>
        </header>

        <main className="app-main">{children}</main>

        <nav className="mobile-bottom-nav" aria-label="Mobil ana navigasyon">
          <NavLink to="/" end><Home/><span>Ana Sayfa</span></NavLink>
          <NavLink to="/orders"><ClipboardList/><span>İşler</span></NavLink>
          <button type="button" className={activePicking ? "scan-active" : ""} aria-label="Tara" onClick={requestScan}><ScanLine/><span>Tara</span></button>
          <button type="button" aria-label="Daha Fazla" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><MoreHorizontal/><span>Daha Fazla</span></button>
        </nav>
      </div>

      {menuOpen && <div className="drawer-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
        <aside className="mobile-drawer" role="dialog" aria-modal="true" aria-labelledby="mobile-drawer-title">
          <h2 id="mobile-drawer-title" className="sr-only">Daha Fazla</h2>
          <div className="drawer-heading">
            <div><Brand/></div>
            <button ref={drawerCloseRef} className="drawer-close" type="button" aria-label="Menüyü kapat" onClick={() => setMenuOpen(false)}><X size={18}/></button>
          </div>
          <div className="drawer-user">
            <div><strong>{user?.username}</strong><small>{user?.role} · Mobil terminal</small></div>
            <span>AKTİF</span>
          </div>
          <nav className="drawer-nav" aria-label="Daha Fazla">
            {drawerGroups.map((group) => {
              const items = group.items.filter(canSee);
              if (!items.length) return null;
              return <section key={group.title}><h2>{group.title}</h2>{items.map((item) => <Link key={`${group.title}-${item.label}`} to={item.to}>
                <span className={`drawer-item-icon ${item.tone ? `drawer-${item.tone}` : ""}`}><item.icon size={18}/></span>
                <span><strong>{item.label}</strong><small>{item.description}</small></span>
                <span className="drawer-chevron">›</span>
              </Link>)}</section>;
            })}
          </nav>
          <button className="drawer-logout" type="button" onClick={requestLogout}><LogOut size={18}/>Çıkış Yap</button>
        </aside>
      </div>}

      {logoutConfirmOpen && <div className="dialog-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !logoutBusy) setLogoutConfirmOpen(false); }}>
        <div className="logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-dialog-title" aria-describedby="logout-dialog-description">
          <span className="logout-dialog-icon"><LogOut size={22}/></span>
          <h2 id="logout-dialog-title">Çıkış yapmak istiyor musun?</h2>
          <p id="logout-dialog-description">Aktif oturumun kapatılacak ve giriş ekranına yönlendirileceksin.</p>
          <div><button className="secondary-button" disabled={logoutBusy} onClick={() => setLogoutConfirmOpen(false)}>Vazgeç</button><button className="primary-button danger-button" disabled={logoutBusy} onClick={() => void confirmLogout()}>{logoutBusy ? "Çıkılıyor…" : "Evet, çıkış yap"}</button></div>
        </div>
      </div>}
    </div>
  );
}
