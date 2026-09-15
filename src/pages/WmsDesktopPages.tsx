import { Activity, Box, Boxes, MapPin, RefreshCw, Search, Warehouse } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { PermissionPage } from "./WarehouseAdminPages";
import { getErrorMessage, warehouseAdminApi, warehouseApi } from "../lib/api";
import type { Pagination, PickHistorySummary, PickSessionSummary, WarehouseMapSnapshot, WarehouseOrderSummary, WarehousePackageListItem } from "../types/warehouse";

const formatDate = (value: unknown) => value ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(value))) : "—";

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="pt-4"><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{description}</p></header>;
}

export function DashboardPage() {
  const [snapshot, setSnapshot] = useState<WarehouseMapSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void warehouseAdminApi.getWarehouseMap().then(setSnapshot).catch((reason) => setError(getErrorMessage(reason))); }, []);
  const stats = snapshot?.stats || {};
  const cards = [
    ["Depodaki paket", stats.total_packages, Boxes], ["Toplam ürün adedi", stats.total_products, Box],
    ["Kullanılan lokasyon", stats.occupied_locations, MapPin], ["Boş lokasyon", stats.empty_locations, MapPin],
    ["Doluluk", stats.capacity_percent === undefined ? "—" : `%${stats.capacity_percent}`, Warehouse],
    ["Aktif rezervasyon", stats.reserved_packages, Activity], ["Aktif Mal Kabul", stats.active_receiving, Activity],
    ["Bekleyen Picking", stats.pending_picking, Activity], ["Bugün toplanan", stats.picked_today, Boxes],
    ["Bugün yerleştirilen", stats.placed_today, Box],
  ] as const;
  return <PermissionPage permission="warehouse:view_map"><div className="space-y-6">
    <PageHeader eyebrow="WMS Genel Bakış" title="Depoda şu anda ne oluyor?" description="Panel veritabanındaki canlı paket, lokasyon ve operasyon durumunun sade özeti."/>
    {error && <p className="rounded-2xl bg-red-50 p-4 font-bold text-danger" role="alert">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, value, Icon]) => <article className="metric-card" key={label}><Icon size={20} className="text-moss"/><span className="mt-3 text-xs font-bold text-muted">{label}</span><strong className="mt-1 text-3xl font-black">{value ?? "—"}</strong></article>)}</div>
    <Link to="/warehouse-map" className="flex items-center justify-between rounded-3xl bg-forest p-6 text-white"><span><span className="text-xs font-black uppercase tracking-[.2em] text-acid">Canlı görünüm</span><strong className="mt-2 block text-2xl">3D Depo Haritasını Aç</strong></span><Warehouse size={34}/></Link>
  </div></PermissionPage>;
}

export function PackagesPage() {
  const [items, setItems] = useState<WarehousePackageListItem[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [filters, setFilters] = useState({ query: "", lot: "", location: "", status: "", date_from: "", date_to: "" });
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const load = (targetPage = page) => warehouseAdminApi.listPackages({ ...filters, page: targetPage }).then((result) => { setItems(result.packages); setPagination(result.pagination); setError(""); }).catch((reason) => setError(getErrorMessage(reason)));
  useEffect(() => { void load(); }, [page]);
  const submit = (event: FormEvent) => { event.preventDefault(); setPage(1); void load(1); };
  return <PermissionPage permission="warehouse:view_analytics"><div className="space-y-5"><PageHeader eyebrow="Depo" title="Paketler" description="Büyük veri setleri için Panel tarafında filtrelenen ve sayfalanan paket görünümü."/>
    <form onSubmit={submit} className="grid gap-2 rounded-2xl border border-line bg-white p-3 md:grid-cols-4 xl:grid-cols-8"><label className="relative md:col-span-2"><Search className="absolute left-3 top-3.5 text-muted" size={18}/><input className="field pl-10" placeholder="Kod, SKU, ürün, Supplier No" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })}/></label><input className="field" placeholder="Lot" value={filters.lot} onChange={(e) => setFilters({ ...filters, lot: e.target.value })}/><input className="field" placeholder="Lokasyon" value={filters.location} onChange={(e) => setFilters({ ...filters, location: e.target.value })}/><select className="field" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Tüm durumlar</option>{["EXPECTED","LABELED","PLACED","OPEN","EMPTY","MISSING","DAMAGED","QUARANTINED"].map((status) => <option key={status}>{status}</option>)}</select><input aria-label="Başlangıç tarihi" className="field" type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })}/><input aria-label="Bitiş tarihi" className="field" type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })}/><button className="secondary-button"><Search size={18}/> Filtrele</button></form>
    {error && <p role="alert" className="rounded-2xl bg-red-50 p-4 font-bold text-danger">{error}</p>}
    <div className="table-shell"><table className="w-full min-w-[1050px] text-left text-sm"><thead><tr>{["Package Code","SKU","Ürün","Lot","Paket","Adet","Lokasyon","Ağırlık","Status","Yerleştirilme"].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="font-black">{item.package_code}</td><td>{item.sku}</td><td>{item.product_name}</td><td>{item.lot_number || "—"}</td><td>{item.package_number}/{item.total_packages}</td><td>{item.quantity}</td><td>{item.location_code || "—"}</td><td>{item.weight || 0} kg</td><td>{item.status}</td><td>{formatDate(item.placed_at)}</td></tr>)}</tbody></table></div>
    <div className="flex items-center justify-between text-sm font-bold text-muted"><span>{pagination?.total || 0} paket</span><div className="flex gap-2"><button className="secondary-button" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>Önceki</button><span className="grid min-w-16 place-items-center">{page}/{pagination?.total_pages || 1}</span><button className="secondary-button" disabled={page >= (pagination?.total_pages || 1)} onClick={() => setPage((v) => v + 1)}>Sonraki</button></div></div>
  </div></PermissionPage>;
}

export function LocationsDesktopPage() {
  const [snapshot, setSnapshot] = useState<WarehouseMapSnapshot | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void warehouseAdminApi.getWarehouseMap().then(setSnapshot).catch((reason) => setError(getErrorMessage(reason))); }, []);
  const selectedPackages = snapshot?.packages.filter((pkg) => pkg.location_code === selectedCode) || [];
  return <PermissionPage permission="warehouse:view_map"><div className="space-y-5"><PageHeader eyebrow="Depo" title="Lokasyonlar" description="Kapasite, doluluk ve aktif rezervasyonlar Panel veritabanından hesaplanır."/>{error && <p role="alert">{error}</p>}<div className="table-shell"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr>{["Lokasyon","Raf","Kat","Pozisyon","Kapasite","Dolu","Rezerve","Boş"].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{snapshot?.locations.map((item) => { const match = item.code.match(/^(.*)-K(\d+)-P(\d+)$/); return <tr key={item.id} className="cursor-pointer" onClick={() => setSelectedCode(item.code)}><td><button className="font-black text-forest underline decoration-moss/40 underline-offset-4">{item.code}</button></td><td>{item.rack_code}</td><td>{match?.[2] || "—"}</td><td>{match?.[3] || "—"}</td><td>{item.capacity}</td><td>{item.occupied}</td><td>{item.reserved}</td><td>{item.available}</td></tr>; })}</tbody></table></div>{selectedCode && <section className="rounded-2xl border border-line bg-white p-5"><div className="flex items-center justify-between"><div><p className="eyebrow">Lokasyon Detayı</p><h2 className="text-xl font-black">{selectedCode}</h2></div><button className="secondary-button" onClick={() => setSelectedCode(null)}>Kapat</button></div><div className="mt-4 grid gap-2 md:grid-cols-2">{selectedPackages.map((pkg) => <article className="rounded-xl border border-line p-3" key={pkg.id}><b>{pkg.sku}</b><p className="text-sm text-muted">{pkg.product_name} · {pkg.package_code} · {pkg.quantity} adet</p></article>)}{selectedPackages.length === 0 && <p className="text-sm text-muted">Bu lokasyonda paket yok.</p>}</div></section>}</div></PermissionPage>;
}

export function MovementsPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");
  const load = () => warehouseAdminApi.listMovements().then(setItems).catch((reason) => setError(getErrorMessage(reason)));
  useEffect(() => { void load(); }, []);
  return <PermissionPage permission="warehouse:view_analytics"><div className="space-y-5"><PageHeader eyebrow="Analiz" title="Hareketler" description="Mal kabul, picking, yerleştirme, taşıma, sayım ve claim olaylarının kullanıcı bazlı izlenebilir kaydı."/><button className="secondary-button" onClick={load}><RefreshCw size={18}/> Yenile</button>{error && <p role="alert">{error}</p>}<div className="space-y-2">{items.map((item) => { const code = String(item.event_type); const subject = item.package_code || item.order_code || item.sku || item.entity_id; const route = item.from_location || item.to_location ? `${String(item.from_location || "Depo girişi")} → ${String(item.to_location || "—")}` : null; return <article key={String(item.id)} className="rounded-2xl border border-line bg-white p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{activityLabels[code] || "Depo işlemi"}</strong><time className="text-xs font-bold text-muted">{formatDate(item.created_at)}</time></div><p className="mt-1 text-sm">{String(subject || "—")}{route ? ` · ${route}` : ""}</p><p className="mt-2 text-xs font-bold text-moss">{String(item.actor_username || "Sistem")}</p></article>; })}</div></div></PermissionPage>;
}

const activityLabels: Record<string, string> = {
  WAREHOUSE_PICKING_STARTED: "Toplama başlatıldı", WAREHOUSE_ITEM_PICKED: "Ürün toplandı",
  WAREHOUSE_PICKING_COMPLETED: "Toplama tamamlandı", WAREHOUSE_PACKAGE_PLACED: "Paket yerleştirildi",
  WAREHOUSE_PACKAGE_MOVED: "Paket taşındı", WAREHOUSE_PACKAGE_COUNTED: "Stok sayıldı",
  WAREHOUSE_RECEIVING_SESSION_STARTED: "Mal kabul başlatıldı", WAREHOUSE_RECEIVING_COMPLETED: "Mal kabul tamamlandı",
};

export function UserActivityPage() {
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState("");
  useEffect(() => { void warehouseAdminApi.listUserActivity().then(setItems).catch((reason) => setError(getErrorMessage(reason))); }, []);
  return <PermissionPage permission="warehouse:view_analytics"><div className="space-y-5"><PageHeader eyebrow="Analiz" title="Kullanıcı Aktiviteleri" description="Puanlama olmadan; yalnız operasyonel izlenebilirlik için kim, neyi, ne zaman yaptı görünümü."/>{error && <p role="alert">{error}</p>}<div className="table-shell"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr>{["Kullanıcı","İşlem","Kayıt","Zaman"].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={String(item.id)}><td className="font-black">{String(item.actor_username || item.user_id || "Sistem")}</td><td>{activityLabels[String(item.event_type)] || "Depo işlemi"}</td><td>{String(item.package_code || item.order_code || item.sku || item.entity_id || "—")}</td><td>{formatDate(item.created_at)}</td></tr>)}</tbody></table></div></div></PermissionPage>;
}

export function CapacityPage() {
  const [snapshot, setSnapshot] = useState<WarehouseMapSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void warehouseAdminApi.getWarehouseMap().then(setSnapshot).catch((reason) => setError(getErrorMessage(reason))); }, []);
  const racks = Object.values((snapshot?.locations || []).reduce<Record<string, { code: string; capacity: number; occupied: number; reserved: number }>>((result, location) => {
    const row = result[location.rack_code] || { code: location.rack_code, capacity: 0, occupied: 0, reserved: 0 };
    row.capacity += location.capacity; row.occupied += location.occupied; row.reserved += location.reserved; result[location.rack_code] = row; return result;
  }, {})).sort((a, b) => a.code.localeCompare(b.code, "tr"));
  return <PermissionPage permission="warehouse:view_analytics"><div className="space-y-5"><PageHeader eyebrow="Analiz" title="Kapasite" description="Raf bazında gerçek DB kapasitesi, yerleştirilmiş paketler ve aktif rezervasyonlar."/>{error && <p role="alert">{error}</p>}<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{racks.map((rack) => { const used = rack.occupied + rack.reserved; const percent = rack.capacity ? Math.round(used / rack.capacity * 100) : 0; return <article key={rack.code} className="rounded-2xl border border-line bg-white p-5"><div className="flex items-center justify-between"><strong className="text-xl">{rack.code}</strong><b className="text-moss">%{percent}</b></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-moss" style={{ width: `${Math.min(100, percent)}%` }}/></div><div className="mt-4 grid grid-cols-3 text-sm"><span><small className="block text-muted">Dolu</small><b>{rack.occupied}</b></span><span><small className="block text-muted">Rezerve</small><b>{rack.reserved}</b></span><span><small className="block text-muted">Boş</small><b>{Math.max(0, rack.capacity - used)}</b></span></div></article>; })}</div></div></PermissionPage>;
}

export function StockPage() {
  const [snapshot, setSnapshot] = useState<WarehouseMapSnapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void warehouseAdminApi.getWarehouseMap().then(setSnapshot).catch((reason) => setError(getErrorMessage(reason))); }, []);
  const rows = Object.values((snapshot?.packages || []).reduce<Record<string, { sku: string; product: string; quantity: number; packages: number; locations: Set<string> }>>((result, pkg) => {
    const row = result[pkg.sku] || { sku: pkg.sku, product: pkg.product_name, quantity: 0, packages: 0, locations: new Set<string>() };
    row.quantity += Number(pkg.quantity || 0); row.packages += 1; row.locations.add(pkg.location_code); result[pkg.sku] = row; return result;
  }, {})).sort((a, b) => a.sku.localeCompare(b.sku, "tr"));
  return <PermissionPage permission="warehouse:view_analytics"><div className="space-y-5"><PageHeader eyebrow="Depo" title="Stok Görünümü" description="Paket bazlı canlı bakiyenin SKU ve lokasyon dağılımı. Hesap Panel DB snapshot'ından yapılır."/>{error && <p role="alert">{error}</p>}<div className="table-shell"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr>{["SKU","Ürün","Toplam Adet","Paket","Lokasyonlar"].map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.sku}><td className="font-black">{row.sku}</td><td>{row.product}</td><td>{row.quantity}</td><td>{row.packages}</td><td>{[...row.locations].join(", ")}</td></tr>)}</tbody></table></div></div></PermissionPage>;
}

const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export function PickingManagementPage() {
  const [orders, setOrders] = useState<WarehouseOrderSummary[]>([]);
  const [history, setHistory] = useState<PickSessionSummary[]>([]);
  const [summary, setSummary] = useState<PickHistorySummary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const today = new Date(); const from = new Date(today); from.setDate(from.getDate() - 7);
    void Promise.all([warehouseApi.listOrders(1, 100), warehouseApi.listPickHistory({ summary_from: isoDay(today), summary_to: isoDay(today), date_from: isoDay(from), date_to: isoDay(today) }, 1, 50)])
      .then(([active, completed]) => { setOrders(active.orders); setHistory(completed.sessions); setSummary(completed.summary); })
      .catch((reason) => setError(getErrorMessage(reason)));
  }, []);
  const active = orders.filter((order) => order.status === "Toplanıyor");
  return <div className="space-y-5"><PageHeader eyebrow="Operasyon" title="Order Picking Yönetimi" description="Aktif toplama işleri ve son yedi günün tamamlanan picking kayıtları."/>{error && <p role="alert">{error}</p>}<div className="grid gap-3 sm:grid-cols-4"><article className="metric-card"><small>Aktif picking</small><strong className="mt-2 text-3xl">{active.length}</strong></article><article className="metric-card"><small>Bugün tamamlanan</small><strong className="mt-2 text-3xl">{summary?.completed_pick_count || 0}</strong></article><article className="metric-card"><small>Bugün fiziksel adet</small><strong className="mt-2 text-3xl">{summary?.total_physical_item_quantity || 0}</strong></article><article className="metric-card"><small>Bugün toplam kg</small><strong className="mt-2 text-3xl">{((summary?.total_net_weight_g || 0) / 1000).toLocaleString("tr-TR")}</strong></article></div><div className="grid gap-5 xl:grid-cols-2"><section><h2 className="mb-3 text-lg font-black">Aktif işler</h2><div className="space-y-2">{active.map((order) => <Link to={`/orders/${order.id}`} key={order.id} className="block rounded-2xl border border-line bg-white p-4"><b>{order.order_code}</b><p className="mt-1 text-sm text-muted">{order.picker?.name || "Atanmamış"} · {order.total_quantity} adet · {formatDate(order.created_at)}</p></Link>)}</div></section><section><h2 className="mb-3 text-lg font-black">Tamamlananlar</h2><div className="space-y-2">{history.map((session) => <article key={session.id} className="rounded-2xl border border-line bg-white p-4"><b>{session.pick_number} · {session.order_code}</b><p className="mt-1 text-sm text-muted">{session.completed_by?.name || "—"} · {session.total_physical_item_quantity} adet · {(session.total_net_weight_g / 1000).toLocaleString("tr-TR")} kg · {formatDate(session.completed_at)}</p></article>)}</div></section></div></div>;
}
