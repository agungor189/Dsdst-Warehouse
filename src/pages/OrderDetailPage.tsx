import { ChevronLeft, Package, Play, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { ShortageAlert } from "../components/ShortageAlert";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../features/auth/AuthContext";
import { getErrorMessage, warehouseApi } from "../lib/api";
import { formatDate, platformLabel } from "../lib/format";
import type { PickPlan, WarehouseOrder } from "../types/warehouse";

export function OrderDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [order, setOrder] = useState<WarehouseOrder | null>(null);
  const [plan, setPlan] = useState<PickPlan | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const load = () => {
    setError("");
    Promise.all([warehouseApi.getOrder(id), warehouseApi.getPickPlan(id)])
      .then(([orderData, planData]) => { setOrder(orderData); setPlan(planData); })
      .catch((reason) => setError(getErrorMessage(reason)));
  };
  useEffect(load, [id]);

  const start = async () => {
    if (!order || !plan) return;
    setStarting(true);
    setStartError("");
    try {
      await warehouseApi.startOrder(id);
      navigate(`/orders/${id}/pick`);
    } catch (reason) {
      setStartError(getErrorMessage(reason));
    } finally {
      setStarting(false);
    }
  };

  if (error) return <div className="pt-6"><ErrorState message={error} retry={load} /></div>;
  if (!order || !plan) return <div className="pt-6"><LoadingState label="Sipariş hazırlanıyor" /></div>;

  const lockedByOther = order.status === "Toplanıyor" && Boolean(order.picker?.user_id) && order.picker?.user_id !== user?.id;
  const shortageBlocksStart = order.status !== "Toplanıyor" && plan.shortages.length > 0;
  const blocked = plan.items.length === 0 || plan.unresolved_items.length > 0 || shortageBlocksStart || lockedByOther;
  const actionLabel = order.status === "Toplanıyor" ? "Toplamaya Devam Et" : "Toplamayı Başlat";

  return (
    <div className="pick-start-page">
      <header className="pick-start-header"><Link to="/orders"><ChevronLeft size={16}/>İşler</Link><StatusBadge status={order.status}/></header>

      <section className="pick-order-card">
        <p className="pick-platform">{platformLabel(order.platform)}</p>
        <h1>{order.order_code}</h1>
        <time>{formatDate(order.created_at)}</time>
        <div className="pick-order-metrics">
          <div><small>Müşteri</small><strong>{order.customer.name || "—"}</strong></div>
          <div><small>Toplam</small><strong>{order.total_quantity} adet</strong></div>
        </div>
      </section>

      <ShortageAlert shortages={plan.shortages} />
      {lockedByOther && <div className="pick-blocking-alert" role="alert">Bu sipariş {order.picker?.name || "başka bir kullanıcı"} tarafından toplanıyor.</div>}
      {plan.unresolved_items.length > 0 && <div className="pick-blocking-alert danger" role="alert"><TriangleAlert size={18}/><span><strong>Çözümlenemeyen ürün var</strong>{plan.unresolved_items.length} sipariş satırı toplama planına eklenemedi.</span></div>}

      <section className="pick-lines-card">
        <div className="pick-lines-heading"><h2>Sipariş satırları</h2><span>{order.items.length} satır</span></div>
        <div className="pick-lines-list">
          {order.items.map((item) => <article key={item.id}>
            <span className="pick-line-image"><Package size={24}/></span>
            <div><strong>{item.product_name || "İsimsiz ürün"}</strong><small>{item.sku || "SKU yok"}{item.warehouse_location ? ` · ${item.warehouse_location}` : ""}</small></div>
            <b>{item.quantity}×</b>
          </article>)}
        </div>
        <div className="pick-lines-total"><span>Toplam</span><strong>{order.total_quantity} adet</strong></div>
      </section>

      <aside className="pick-start-summary"><strong>{order.items.length} ürün · {order.total_quantity} adet</strong><span>Devam ettiğinizde doğrulama ekranı açılır.</span></aside>
      <p className="pick-start-hint">Toplama işlemi ekranda kaydırma gerektirmeden tamamlanır.</p>

      {startError && <p className="pick-feedback error" role="alert">{startError}</p>}
      <button className="primary-button pick-start-action" disabled={starting || blocked} onClick={start}>
        <Play size={19} fill="currentColor" /> {starting ? "Başlatılıyor..." : actionLabel}
      </button>
    </div>
  );
}
