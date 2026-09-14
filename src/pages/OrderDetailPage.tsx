import { MapPin, Package, Play, TriangleAlert, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

  return (
    <div className="space-y-4 pt-4">
      <section className="rounded-[1.75rem] bg-forest p-5 text-white">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-acid">{platformLabel(order.platform)}</p><h1 className="mt-2 text-3xl font-black tracking-tight">{order.order_code}</h1></div><StatusBadge status={order.status} /></div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/8 p-3"><UserRound size={18} className="mb-2 text-acid"/><p className="text-white/60">Müşteri</p><strong>{order.customer.name || "—"}</strong></div>
          <div className="rounded-xl bg-white/8 p-3"><Package size={18} className="mb-2 text-acid"/><p className="text-white/60">Toplam</p><strong>{order.total_quantity} adet</strong></div>
        </div>
        <p className="mt-4 text-xs text-white/50">Oluşturuldu: {formatDate(order.created_at)}</p>
      </section>

      <ShortageAlert shortages={plan.shortages} />
      {lockedByOther && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 font-black text-amber-900" role="alert">Bu sipariş {order.picker?.name || "başka bir kullanıcı"} tarafından toplanıyor.</div>}
      {plan.unresolved_items.length > 0 && (
        <div className="flex gap-3 rounded-2xl border border-danger/20 bg-red-50 p-4 text-danger" role="alert"><TriangleAlert className="shrink-0"/><div><strong className="block">Çözümlenemeyen ürün var</strong><span className="text-sm">{plan.unresolved_items.length} sipariş satırı toplama planına eklenemedi.</span></div></div>
      )}

      <section className="rounded-2xl border border-line bg-white p-4">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-black">Sipariş satırları</h2><span className="text-sm font-bold text-muted">{order.items.length} satır</span></div>
        <div className="divide-y divide-line">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0"><p className="truncate font-bold">{item.product_name || "İsimsiz ürün"}</p><p className="mt-1 text-xs font-semibold text-muted">{item.sku || "SKU yok"} {item.warehouse_location && <><MapPin className="ml-2 inline" size={12}/> {item.warehouse_location}</>}</p></div>
              <strong className="shrink-0 text-lg">{item.quantity}×</strong>
            </div>
          ))}
        </div>
      </section>

      {startError && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-danger" role="alert">{startError}</p>}
      <button className="primary-button sticky bottom-4 w-full shadow-xl" disabled={starting || blocked} onClick={start}>
        <Play size={22} fill="currentColor" /> {starting ? "Başlatılıyor..." : order.status === "Toplanıyor" ? "Toplamaya Devam Et" : "Toplamayı Başlat"}
      </button>
    </div>
  );
}
