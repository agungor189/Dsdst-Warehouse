import {
  Check, ChevronRight, PackageCheck, RotateCcw, Send, Truck, X,
} from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link } from "react-router-dom";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";
import { getErrorMessage, warehouseApi } from "../lib/api";
import type { WarehouseOrderSummary, WarehousePermission } from "../types/warehouse";

type QueueState = {
  orders: WarehouseOrderSummary[];
  total?: number;
  error?: string;
};

type QuickAction = {
  label: string;
  description: string;
  to: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  tone: string;
  permission: WarehousePermission;
};

const quickActions: QuickAction[] = [
  { label: "Toplama", description: "Sipariş topla", to: "/orders", icon: Check, tone: "cobalt", permission: "warehouse:pick_orders" },
  { label: "Paketleme", description: "Paket hazırla", to: "/shipments", icon: PackageCheck, tone: "teal", permission: "shipping:manage" },
  { label: "Sevkiyat", description: "Sevke hazırla", to: "/shipments", icon: Send, tone: "purple", permission: "shipping:manage" },
  { label: "İade", description: "Ürün kabul", to: "/returns", icon: RotateCcw, tone: "danger", permission: "warehouse:accept_returns" },
  { label: "Yükleme Alanı", description: "Handoff / yükleme", to: "/shipments", icon: Truck, tone: "warning", permission: "shipping:dispatch" },
];

const operationMetrics = ["Paketlenecek", "Sevke hazır", "İade", "Yükleme"];

function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Günaydın";
  if (hour < 18) return "İyi günler";
  return "İyi akşamlar";
}

function PickingSheet({ orders, total, onClose }: { orders: WarehouseOrderSummary[]; total: number; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="sheet-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="picking-sheet" role="dialog" aria-modal="true" aria-labelledby="picking-sheet-title">
        <span className="sheet-handle" aria-hidden="true" />
        <div className="sheet-heading">
          <div>
            <h2 id="picking-sheet-title">Toplanacak Siparişler</h2>
            <p>{total} sipariş</p>
          </div>
          <button ref={closeRef} className="sheet-close" type="button" aria-label="Kapat" onClick={onClose}><X size={18}/></button>
        </div>
        <div className="sheet-order-list">
          {orders.slice(0, 5).map((order) => (
            <Link key={order.id} to={`/orders/${order.id}`} className="sheet-order" onClick={onClose}>
              <span className="sheet-order-copy">
                <small>{order.order_code}</small>
                <strong>{order.customer || "Müşteri bilgisi yok"}</strong>
                <span>{order.item_count == null ? "Ürün bilgisi bekleniyor" : `${order.item_count} ürün toplanacak`}</span>
              </span>
              <span className="sheet-order-meta">
                {order.has_kit && <span className="order-badge order-badge-kit">KIT</span>}
                {order.has_assembly && <span className="order-badge order-badge-assembly">ASSEMBLY</span>}
                <ChevronRight size={18}/>
              </span>
            </Link>
          ))}
          {!orders.length && <p className="sheet-empty">Toplanacak sipariş bulunmuyor.</p>}
        </div>
        <Link to="/orders" className="sheet-all-link" onClick={onClose}>Tüm toplama kuyruğunu aç</Link>
      </section>
    </div>
  );
}

export function HomePage() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<QueueState>({ orders: [] });
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    let active = true;
    warehouseApi.listOrders(1, 100)
      .then(({ orders, pagination }) => {
        if (active) setQueue({ orders, total: pagination.total });
      })
      .catch((error) => {
        if (active) setQueue({ orders: [], error: getErrorMessage(error) });
      });
    return () => { active = false; };
  }, []);

  const displayName = user?.username?.trim() || "Operatör";
  const visibleActions = quickActions.filter((action) => hasWarehousePermission(user, action.permission));

  return (
    <div className="mobile-home">
      <section className="home-welcome">
        <h1>{greetingFor()}, {displayName}</h1>
        <p>{queue.total == null ? "Depo işleri yükleniyor." : `Depoda ${queue.total} işlem bekliyor.`}</p>
      </section>

      <button className="picking-summary" type="button" aria-label="Toplama kuyruğunu aç" onClick={() => setSheetOpen(true)} disabled={queue.total == null}>
        <span className="picking-summary-copy">
          <span className="home-kicker">Toplanacak Siparişler</span>
          <span className="picking-total-row">
            <strong data-testid="picking-order-count">{queue.total ?? "—"}</strong>
          </span>
          <span className="picking-summary-link">Toplama kuyruğunu aç</span>
        </span>
        <span className="picking-summary-arrow"><ChevronRight size={20}/></span>
      </button>

      {queue.error && <p className="home-error" role="alert">{queue.error}</p>}

      <section className="home-section" aria-labelledby="operation-status-title">
        <h2 id="operation-status-title">Operasyon durumu</h2>
        <div className="operation-grid">
          {operationMetrics.map((label) => (
            <article className="operation-card operation-card-unavailable" key={label} aria-label={`${label}: veri henüz mevcut değil`}>
              <span>{label}</span><strong>—</strong><small>Veri bekleniyor</small>
            </article>
          ))}
        </div>
      </section>

      <section className="home-section" aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title">Hızlı işlemler</h2>
        <div className="quick-action-grid">
          {visibleActions.map((action) => (
            <Link key={action.label} className="quick-action" to={action.to}>
              <span className={`quick-action-icon quick-action-${action.tone}`}><action.icon size={18} strokeWidth={2}/></span>
              <ChevronRight className="quick-action-chevron" size={17}/>
              <strong>{action.label}</strong>
              <small>{action.description}</small>
            </Link>
          ))}
        </div>
      </section>

      {sheetOpen && <PickingSheet orders={queue.orders} total={queue.total || 0} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}
