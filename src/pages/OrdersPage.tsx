import { ChevronLeft, ChevronRight, PackageOpen, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { StatusBadge } from "../components/StatusBadge";
import { getErrorMessage, warehouseApi } from "../lib/api";
import { formatDate, platformLabel } from "../lib/format";
import type { Pagination, WarehouseOrderSummary } from "../types/warehouse";

export function OrdersPage() {
  const [orders, setOrders] = useState<WarehouseOrderSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"Tümü" | "Hazırlanıyor" | "Toplanıyor">("Tümü");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    warehouseApi.listOrders(page, 25)
      .then(({ orders: rows, pagination: meta }) => { setOrders(rows); setPagination(meta); })
      .catch((reason) => setError(getErrorMessage(reason)))
      .finally(() => setLoading(false));
  };
  useEffect(load, [page]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr");
    return orders.filter((order) =>
      (status === "Tümü" || order.status === status) &&
      (!needle || order.order_code.toLocaleLowerCase("tr").includes(needle) || order.customer?.toLocaleLowerCase("tr").includes(needle)),
    );
  }, [orders, query, status]);

  return (
    <div className="pt-4">
      <div className="mb-5">
        <p className="eyebrow">Sipariş kuyruğu</p>
        <h1 className="page-title">Toplanacak siparişler</h1>
        <p className="mt-2 text-sm text-muted">En eski siparişler önce gösterilir.</p>
      </div>

      <div className="sticky top-0 z-20 -mx-4 space-y-3 bg-canvas/95 px-4 py-3 backdrop-blur">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={20} />
          <input className="field pl-12" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sipariş kodu veya müşteri ara" aria-label="Sipariş ara" />
        </label>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["Tümü", "Hazırlanıyor", "Toplanıyor"] as const).map((item) => (
            <button key={item} className={`filter-chip ${status === item ? "filter-chip-active" : ""}`} onClick={() => setStatus(item)}>{item}</button>
          ))}
        </div>
      </div>

      {loading ? <LoadingState label="Siparişler getiriliyor" /> : error ? <ErrorState message={error} retry={load} /> : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <Link key={order.id} to={`/orders/${order.id}`} className="block rounded-2xl border border-line bg-white p-4 shadow-sm transition active:scale-[0.99]">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-lg font-black tracking-tight">{order.order_code}</p><p className="mt-1 text-sm font-semibold text-muted">{order.customer || "Müşteri bilgisi yok"}</p></div>
                <StatusBadge status={order.status} />
              </div>
              <div className="mt-4 flex items-end justify-between border-t border-line pt-3">
                <div><p className="text-xs font-bold uppercase tracking-wide text-muted">{platformLabel(order.platform)}</p><p className="mt-1 text-xs text-muted">{formatDate(order.created_at)}</p></div>
                <div className="text-right"><strong className="text-2xl font-black">{order.total_quantity}</strong><span className="ml-1 text-xs font-bold text-muted">adet</span></div>
              </div>
            </Link>
          ))}
          {filtered.length === 0 && <div className="state-card"><PackageOpen size={34} className="text-muted" /><p className="font-black">Eşleşen sipariş yok</p></div>}
        </div>
      )}

      {pagination && pagination.total_pages > 1 && (
        <div className="mt-5 flex items-center justify-between">
          <button className="secondary-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft /> Önceki</button>
          <span className="text-sm font-bold text-muted">{page} / {pagination.total_pages}</span>
          <button className="secondary-button" disabled={page >= pagination.total_pages} onClick={() => setPage((value) => value + 1)}>Sonraki <ChevronRight /></button>
        </div>
      )}
    </div>
  );
}
