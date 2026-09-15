import { ArrowRight, CircleCheck, CircleX, History, PackageCheck, Play, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";
import { getErrorMessage, warehouseApi } from "../lib/api";
import type { WarehouseOrderSummary } from "../types/warehouse";

export function HomePage() {
  const { user } = useAuth();
  const [state, setState] = useState<{ total?: number; activeOrder?: WarehouseOrderSummary; error?: string }>({});
  const canUseAdmin = ["warehouse:receive", "warehouse:print_labels", "warehouse:place_packages", "warehouse:move_stock", "warehouse:manage_locations", "warehouse:count_stock"]
    .some((permission) => hasWarehousePermission(user, permission as Parameters<typeof hasWarehousePermission>[1]));

  useEffect(() => {
    warehouseApi.listOrders(1, 100)
      .then(({ orders, pagination }) => setState({
        total: pagination.total,
        activeOrder: orders.find((order) => order.status === "Toplanıyor" && order.picker?.user_id === user?.id),
      }))
      .catch((error) => setState({ error: getErrorMessage(error) }));
  }, [user?.id]);

  return (
    <div className="space-y-5 pt-4">
      <section className="overflow-hidden rounded-[2rem] bg-forest p-6 text-white shadow-xl shadow-forest/10">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-acid">Hızlı işlem</p>
        <h1 className="mt-3 max-w-sm text-4xl font-black leading-[0.98] tracking-[-0.04em]">Sıradaki siparişi hazırlayın.</h1>
        <p className="mt-4 max-w-md text-sm leading-6 text-white/65">Lokasyona gidin, ürünü okutun ve adedi onaylayın.</p>
        <Link to="/orders" className="mt-7 flex min-h-16 items-center justify-between rounded-2xl bg-acid px-5 text-lg font-black text-forest transition active:scale-[0.98]">
          <span className="flex items-center gap-3"><PackageCheck size={25} /> Sipariş Topla</span>
          <ArrowRight />
        </Link>
      </section>

      {state.activeOrder && (
        <Link to={`/orders/${state.activeOrder.id}/pick`} className="flex min-h-20 items-center justify-between rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 transition active:scale-[0.99]">
          <span className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-amber-400 text-amber-950"><Play size={21} fill="currentColor" /></span>
            <span><span className="block text-xs font-bold text-amber-800">Aktif toplama</span><span className="block font-black">{state.activeOrder.order_code}</span></span>
          </span>
          <span className="font-black text-amber-900">Devam et</span>
        </Link>
      )}

      <Link to="/history" className="flex min-h-20 items-center justify-between rounded-2xl border border-line bg-white p-4 shadow-sm transition active:scale-[0.99]">
        <span className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-emerald-100 text-moss"><History size={22}/></span>
          <span><span className="block font-black">Toplama Geçmişi</span><span className="mt-0.5 block text-xs font-semibold text-muted">Tamamlanan toplama ve BOM kayıtları</span></span>
        </span>
        <ArrowRight className="text-muted"/>
      </Link>

      {canUseAdmin && <Link to="/admin" className="flex min-h-20 items-center justify-between rounded-2xl border border-line bg-white p-4 shadow-sm transition active:scale-[0.99]"><span className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-acid text-forest"><Settings2 size={22}/></span><span><span className="block font-black">Warehouse Admin</span><span className="mt-0.5 block text-xs font-semibold text-muted">Mal kabul, paket, lokasyon ve baskı</span></span></span><ArrowRight className="text-muted"/></Link>}

      <div className="grid grid-cols-2 gap-3">
        <div className="metric-card">
          <span className="text-xs font-bold text-muted">Bekleyen sipariş</span>
          <strong className="mt-2 text-3xl font-black">{state.total ?? "—"}</strong>
        </div>
        <div className="metric-card">
          <span className="text-xs font-bold text-muted">Panel API</span>
          <div className={`mt-3 flex items-center gap-2 font-black ${state.error ? "text-danger" : state.total === undefined ? "text-muted" : "text-success"}`}>
            {state.error ? <CircleX size={21} /> : <CircleCheck size={21} />}
            {state.error ? "Bağlantı yok" : state.total === undefined ? "Kontrol..." : "Bağlı"}
          </div>
        </div>
      </div>
      {state.error && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-danger" role="alert">{state.error}</p>}
    </div>
  );
}
