import {
  Boxes,
  CalendarDays,
  ChevronRight,
  Clock3,
  History,
  PackageCheck,
  RefreshCw,
  Scale,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { getErrorMessage, warehouseApi } from "../lib/api";
import { formatDateTime, formatDuration, formatQuantity, formatTime, formatWeight } from "../lib/format";
import type {
  PickHistoryFilters,
  PickHistorySummary,
  PickSessionDetail,
  PickSessionStatus,
  PickSessionSummary,
  PickSessionUser,
} from "../types/warehouse";

type Period = "today" | "yesterday" | "seven-days" | "custom";

const emptySummary: PickHistorySummary = {
  completed_pick_count: 0,
  total_sale_product_quantity: 0,
  total_physical_item_quantity: 0,
  total_net_weight_g: 0,
  by_user: [],
};

const startOfDay = (date: Date) => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const inputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const fromInputDate = (value: string) => value ? new Date(`${value}T00:00:00`) : null;

const statusLabel: Record<PickSessionStatus, string> = {
  WAITING: "Bekliyor",
  PICKING: "Toplanıyor",
  PICKED: "Toplandı",
  PACKING: "Paketleniyor",
  PACKED: "Paketlendi",
  SHIPPED: "Sevk edildi",
  CANCELLED: "İptal",
};

export function PickHistoryPage() {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState(inputDate(today));
  const [customTo, setCustomTo] = useState(inputDate(today));
  const [pickerUserId, setPickerUserId] = useState("");
  const [sku, setSku] = useState("");
  const [productName, setProductName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [status, setStatus] = useState<"" | PickSessionStatus>("");
  const [sessions, setSessions] = useState<PickSessionSummary[]>([]);
  const [summary, setSummary] = useState(emptySummary);
  const [users, setUsers] = useState<PickSessionUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PickSessionDetail | null>(null);
  const [detailError, setDetailError] = useState("");

  const filters = useMemo<PickHistoryFilters>(() => {
    const tomorrow = addDays(today, 1);
    let from = today;
    let to = tomorrow;
    if (period === "yesterday") {
      from = addDays(today, -1);
      to = today;
    } else if (period === "seven-days") {
      from = addDays(today, -6);
    } else if (period === "custom") {
      from = fromInputDate(customFrom) || today;
      to = addDays(fromInputDate(customTo) || from, 1);
    }
    return {
      date_from: from.toISOString(),
      date_to: to.toISOString(),
      summary_from: today.toISOString(),
      summary_to: tomorrow.toISOString(),
      picker_user_id: pickerUserId || undefined,
      sku: sku.trim() || undefined,
      product_name: productName.trim() || undefined,
      order_number: orderNumber.trim() || undefined,
      status: status || undefined,
    };
  }, [customFrom, customTo, orderNumber, period, pickerUserId, productName, sku, status, today]);

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await warehouseApi.listPickHistory(filters);
      setSessions(result.sessions);
      setSummary(result.summary);
      setUsers(result.users);
    } catch (reason) {
      setError(getErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load, reloadKey]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError("");
      return;
    }
    let active = true;
    setDetail(null);
    setDetailError("");
    warehouseApi.getPickHistory(selectedId)
      .then((result) => { if (active) setDetail(result); })
      .catch((reason) => { if (active) setDetailError(getErrorMessage(reason)); });
    return () => { active = false; };
  }, [selectedId]);

  return (
    <div className="space-y-5 pt-4">
      <div className="flex items-end justify-between gap-4">
        <div><p className="eyebrow">Operasyon kayıtları</p><h1 className="page-title">Toplama Geçmişi</h1><p className="mt-2 text-sm text-muted">Tamamlanan toplamalar ve değişmez BOM içerikleri.</p></div>
        <button className="icon-button shrink-0" aria-label="Geçmişi yenile" onClick={() => setReloadKey((value) => value + 1)}><RefreshCw size={20}/></button>
      </div>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-moss"><CalendarDays size={16}/> Tarih</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([[
            "today", "Bugün",
          ], ["yesterday", "Dün"], ["seven-days", "Son 7 Gün"], ["custom", "Tarih Aralığı"]] as Array<[Period, string]>).map(([value, label]) => (
            <button key={value} className={`filter-chip ${period === value ? "filter-chip-active" : ""}`} onClick={() => setPeriod(value)}>{label}</button>
          ))}
        </div>
        {period === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl border border-line bg-white p-3">
            <label className="text-xs font-bold text-muted">Başlangıç<input className="field mt-1" type="date" value={customFrom} max={customTo} onChange={(event) => setCustomFrom(event.target.value)}/></label>
            <label className="text-xs font-bold text-muted">Bitiş<input className="field mt-1" type="date" value={customTo} min={customFrom} onChange={(event) => setCustomTo(event.target.value)}/></label>
          </div>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3" aria-label="Bugünün özeti">
        <SummaryCard icon={<History size={18}/>} label="Tamamlanan" value={formatQuantity(summary.completed_pick_count)} />
        <SummaryCard icon={<PackageCheck size={18}/>} label="Satış ürünü" value={formatQuantity(summary.total_sale_product_quantity)} />
        <SummaryCard icon={<Boxes size={18}/>} label="Fiziksel parça" value={formatQuantity(summary.total_physical_item_quantity)} />
        <SummaryCard icon={<Scale size={18}/>} label="Net ağırlık" value={formatWeight(summary.total_net_weight_g)} />
      </section>

      {summary.by_user.length > 0 && (
        <section className="rounded-2xl bg-forest p-4 text-white">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-acid"><UserRound size={16}/> Bugün ekip özeti</div>
          <div className="space-y-2">
            {summary.by_user.map((row) => (
              <div key={row.user_id} className="flex items-center justify-between rounded-xl bg-white/8 px-3 py-2.5 text-sm">
                <strong>{row.name}</strong><span className="text-white/70"><b className="text-white">{formatQuantity(row.completed_pick_count)}</b> toplama · <b className="text-white">{formatQuantity(row.total_physical_item_quantity)}</b> parça</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <details className="rounded-2xl border border-line bg-white p-4">
        <summary className="cursor-pointer font-black">Ek filtreler</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-muted">Toplayan kullanıcı<select className="field mt-1" value={pickerUserId} onChange={(event) => setPickerUserId(event.target.value)}><option value="">Tümü</option>{users.map((user) => <option key={user.user_id} value={user.user_id}>{user.name}</option>)}</select></label>
          <label className="text-xs font-bold text-muted">Durum<select className="field mt-1" value={status} onChange={(event) => setStatus(event.target.value as "" | PickSessionStatus)}><option value="">Tümü</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <FilterField label="SKU" value={sku} onChange={setSku} placeholder="KIT-RACK-01" />
          <FilterField label="Ürün adı" value={productName} onChange={setProductName} placeholder="Raf bağlantı seti" />
          <div className="sm:col-span-2"><FilterField label="Sipariş / toplama numarası" value={orderNumber} onChange={setOrderNumber} placeholder="DS-1042 veya PICK-000124" /></div>
        </div>
      </details>

      {loading ? <LoadingState label="Toplama geçmişi getiriliyor"/> : error ? <ErrorState message={error} retry={() => void load()}/> : (
        <section className="space-y-3">
          {sessions.map((session) => (
            <button key={session.id} className="w-full rounded-2xl border border-line bg-white p-4 text-left shadow-sm transition active:scale-[0.99]" onClick={() => setSelectedId(session.id)}>
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-black uppercase tracking-wider text-moss">#{session.pick_number}</p><h2 className="mt-1 text-lg font-black">{session.order_code || session.external_order_id || "Siparişsiz toplama"}</h2></div>
                <div className="flex items-center gap-2"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-800">{statusLabel[session.status]}</span><ChevronRight size={19} className="text-muted"/></div>
              </div>
              <div className="mt-3 flex items-center gap-4 text-sm text-muted"><span className="flex items-center gap-1.5 font-bold text-ink"><Clock3 size={16}/>{formatTime(session.completed_at)}</span><span className="flex items-center gap-1.5"><UserRound size={16}/>{session.completed_by.name}</span></div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
                <CardMetric value={session.total_product_types} label="ürün" />
                <CardMetric value={session.total_sale_product_quantity} label="satış ürünü" />
                <CardMetric value={session.total_physical_item_quantity} label="fiziksel parça" />
              </div>
              <div className="mt-3 flex items-center justify-between rounded-xl bg-canvas px-3 py-2 text-sm"><span className="font-bold text-muted">Toplam ağırlık</span><strong>{formatWeight(session.total_net_weight_g)}</strong></div>
            </button>
          ))}
          {sessions.length === 0 && <div className="state-card"><Search size={34} className="text-muted"/><p className="font-black">Bu filtrelerde toplama kaydı yok</p></div>}
        </section>
      )}

      {selectedId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest/60 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Toplama detayı" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}>
          <div className="max-h-[94dvh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-canvas p-4 shadow-2xl sm:rounded-[2rem] sm:p-5">
            <div className="sticky top-0 z-10 mb-4 flex items-center justify-between rounded-2xl border border-line bg-white/95 p-3 backdrop-blur">
              <div><p className="text-xs font-black uppercase tracking-wider text-moss">Toplama detayı</p><p className="font-black">{detail?.pick_number || "Yükleniyor..."}</p></div>
              <button className="icon-button" aria-label="Detayı kapat" onClick={() => setSelectedId(null)}><X size={20}/></button>
            </div>
            {detailError
              ? <ErrorState message={detailError} retry={() => { const value = selectedId; setSelectedId(null); window.setTimeout(() => setSelectedId(value), 0); }}/>
              : !detail ? <LoadingState label="Toplama detayı getiriliyor"/> : <PickDetail detail={detail}/>
            }
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="metric-card min-h-24"><span className="flex items-center gap-2 text-xs font-bold text-muted">{icon}{label}</span><strong className="mt-2 text-2xl font-black">{value}</strong></div>;
}

function FilterField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="text-xs font-bold text-muted">{label}<input className="field mt-1" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}/></label>;
}

function CardMetric({ value, label }: { value: number; label: string }) {
  return <div><strong className="block text-lg font-black">{formatQuantity(value)}</strong><span className="text-[11px] font-bold text-muted">{label}</span></div>;
}

function PickDetail({ detail }: { detail: PickSessionDetail }) {
  return (
    <div className="space-y-4">
      <section className="rounded-[1.75rem] bg-forest p-5 text-white">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-acid">#{detail.pick_number}</p><h2 className="mt-2 text-2xl font-black">{detail.order_code || detail.external_order_id || "Siparişsiz toplama"}</h2></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black">{statusLabel[detail.status]}</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <Info label="Başlatan" value={detail.started_by.name}/><Info label="Tamamlayan" value={detail.completed_by.name}/>
          <Info label="Başlangıç" value={formatDateTime(detail.started_at)}/><Info label="Bitiş" value={formatDateTime(detail.completed_at)}/>
          <div className="col-span-2"><Info label="Süre" value={formatDuration(detail.started_at, detail.completed_at)}/></div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <SummaryCard icon={<Boxes size={18}/>} label="Fiziksel parça" value={formatQuantity(detail.total_physical_item_quantity)}/>
        <SummaryCard icon={<Scale size={18}/>} label="Net ağırlık" value={formatWeight(detail.total_net_weight_g)}/>
      </section>

      {detail.note && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-black uppercase tracking-wider text-amber-800">Operasyon notu</p><p className="mt-2 whitespace-pre-wrap text-sm font-semibold text-amber-950">{detail.note}</p></section>}

      <section>
        <h3 className="mb-3 font-black">Toplanan ürünler</h3>
        <div className="space-y-3">
          {detail.items.map((item) => (
            <details key={item.id} className="overflow-hidden rounded-2xl border border-line bg-white" open={detail.items.length === 1}>
              <summary className="cursor-pointer list-none p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-black">{item.sku_snapshot}</p><p className="mt-1 text-sm text-muted">{item.product_name_snapshot}</p></div><strong className="shrink-0 text-lg">× {formatQuantity(item.picked_quantity)}</strong></div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs"><span className="rounded-lg bg-canvas p-2"><b>{formatQuantity(item.total_component_quantity)}</b> parça</span><span className="rounded-lg bg-canvas p-2 text-right"><b>{formatWeight(item.total_weight_g)}</b></span></div>
              </summary>
              <div className="border-t border-line bg-canvas/70 p-3">
                <p className="mb-2 text-xs font-black uppercase tracking-wider text-moss">Ürün içeriği · snapshot</p>
                <div className="space-y-2">
                  {item.components.map((component) => (
                    <div key={`${component.component_product_id}-${component.component_sku_snapshot}`} className="rounded-xl bg-white p-3 text-sm">
                      <div className="flex items-start justify-between gap-3"><div><strong className="block">{component.component_sku_snapshot}</strong><span className="text-xs text-muted">{component.component_name_snapshot}</span></div><strong className="shrink-0">{formatQuantity(component.total_component_quantity)} adet</strong></div>
                      <div className="mt-2 flex justify-between border-t border-line pt-2 text-xs text-muted"><span>Kit başına {formatQuantity(component.quantity_per_product)}</span><span>{formatWeight(component.total_weight_g)}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 text-sm shadow-sm">
        <div className="flex justify-between"><span className="font-bold text-muted">Toplam fiziksel parça</span><strong>{formatQuantity(detail.total_physical_item_quantity)}</strong></div>
        <div className="mt-3 flex justify-between border-t border-line pt-3"><span className="font-bold text-muted">Toplam net ağırlık</span><strong className="text-lg">{formatWeight(detail.total_net_weight_g)}</strong></div>
      </section>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/8 p-3"><p className="text-xs text-white/55">{label}</p><strong className="mt-1 block">{value}</strong></div>;
}
