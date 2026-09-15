import {
  Boxes, CheckCircle2, ClipboardCheck, MapPin, Move, PackageCheck, Pause, Play, Printer, RefreshCw, Scale, Settings2,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ScanInput } from "../features/picking/ScanInput";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";
import { ApiError, getErrorMessage, warehouseAdminApi } from "../lib/api";
import type { ReceivingSession, WarehouseLocation, WarehousePackage, WarehousePermission } from "../types/warehouse";

const permissionLabels: Record<WarehousePermission, string> = {
  "warehouse:receive": "Mal Kabul",
  "warehouse:print_labels": "Etiketleme",
  "warehouse:place_packages": "Yerleştirme",
  "warehouse:move_stock": "Ürün Taşıma",
  "warehouse:manage_locations": "Lokasyonlar",
  "warehouse:count_stock": "Stok Sayımı",
  "warehouse:edit_label_templates": "Etiket Şablonları",
};

function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="pt-4"><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{description}</p></div>;
}

function Notice({ message, error = false }: { message: string; error?: boolean }) {
  return <p role={error ? "alert" : "status"} className={`rounded-2xl p-4 text-sm font-bold ${error ? "bg-red-50 text-danger" : "bg-emerald-50 text-success"}`}>{message}</p>;
}

export function PermissionPage({ permission, children }: { permission: WarehousePermission; children: ReactNode }) {
  const { user } = useAuth();
  if (!hasWarehousePermission(user, permission)) {
    return <div className="state-card mt-6 text-center"><Settings2 size={34}/><h1 className="text-xl font-black">Yetki gerekli</h1><p className="text-sm text-muted">Bu ekran için <b>{permission}</b> yetkisi gerekli.</p></div>;
  }
  return children;
}

const adminCards: Array<{ to: string; permission: WarehousePermission; title: string; description: string; icon: typeof Boxes }> = [
  { to: "/admin/inbound", permission: "warehouse:receive", title: "Mal Kabul", description: "Lot seç, etiketi bas ve paketi yerine koy", icon: PackageCheck },
  { to: "/admin/labeling", permission: "warehouse:print_labels", title: "Etiketleme", description: "Tedarikçi koduyla sıradaki paketi ayır ve bas", icon: Printer },
  { to: "/admin/placement", permission: "warehouse:place_packages", title: "Yerleştirme", description: "Paket ve lokasyonu sırayla okut", icon: PackageCheck },
  { to: "/admin/move", permission: "warehouse:move_stock", title: "Ürün Taşıma", description: "Paketin lokasyonunu güvenle değiştir", icon: Move },
  { to: "/admin/locations", permission: "warehouse:manage_locations", title: "Lokasyonlar", description: "Kapasite ve dolulukları yönet", icon: MapPin },
  { to: "/admin/count", permission: "warehouse:count_stock", title: "Stok Sayımı", description: "Paket bakiyesini say ve senkronize et", icon: Scale },
  { to: "/admin/prints", permission: "warehouse:print_labels", title: "Baskı Geçmişi", description: "Kuyruk, hata ve deneme sayılarını izle", icon: ClipboardCheck },
  { to: "/admin/templates", permission: "warehouse:edit_label_templates", title: "Etiket Şablonları", description: "Merkezi Label Printer JSON şablonunu sürümle", icon: Settings2 },
];

export function WarehouseAdminPage() {
  const { user } = useAuth();
  const visible = adminCards.filter((card) => hasWarehousePermission(user, card.permission));
  return <div className="space-y-5"><PageIntro eyebrow="Warehouse Admin" title="Depo operasyonları" description="Mal kabulden paket bazlı stok ve yerleştirmeye kadar kontrollü operasyon ekranları."/>
    <div className="grid gap-3 sm:grid-cols-2">{visible.map((card) => <Link key={card.to} to={card.to} className="rounded-2xl border border-line bg-white p-5 shadow-sm transition active:scale-[.99]"><card.icon className="text-moss"/><h2 className="mt-4 font-black">{card.title}</h2><p className="mt-1 text-sm leading-5 text-muted">{card.description}</p></Link>)}</div>
    {!visible.length && <Notice error message="Bu kullanıcıya henüz Warehouse Admin yetkisi verilmemiş."/>}
  </div>;
}

export function parseDelimitedText(source: string): Array<Record<string, string>> {
  const firstLine = source.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ";" : ",";
  const records: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && quoted && source[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(value.trim()); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value.trim()); value = "";
      if (row.some(Boolean)) records.push(row);
      row = [];
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) records.push(row);
  const headers = records.shift()?.map((header) => header.trim()) || [];
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ""])));
}

export function InboundPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ReceivingSession[]>([]);
  const [selected, setSelected] = useState<ReceivingSession | null>(null);
  const [lotNumber, setLotNumber] = useState("");
  const [pkg, setPkg] = useState<WarehousePackage | null>(null);
  const [suggestion, setSuggestion] = useState<WarehouseLocation | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [overrideLocation, setOverrideLocation] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [scanCycle, setScanCycle] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refreshSessions = async () => {
    try {
      const next = await warehouseAdminApi.listReceivingSessions();
      setSessions(next);
      if (selected) {
        const detail = await warehouseAdminApi.getReceivingSession(selected.id);
        setSelected(detail);
      }
    } catch (reason) { setError(getErrorMessage(reason)); }
  };
  useEffect(() => {
    void refreshSessions();
    const timer = window.setInterval(() => void refreshSessions(), 3_000);
    return () => window.clearInterval(timer);
  }, [selected?.id]);
  useEffect(() => {
    if (!pkg || !["LABEL_QUEUED", "PRINT_FAILED"].includes(pkg.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const current = await warehouseAdminApi.getPackage(pkg.package_code);
        setPkg(current);
        if (current.status === "LABELED") setSuggestion(await warehouseAdminApi.suggestLocation(current.id));
      } catch (reason) { setError(getErrorMessage(reason)); }
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [pkg?.id, pkg?.status]);
  const start = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const session = await warehouseAdminApi.startReceivingSession(lotNumber);
      setSelected(session); setPkg(null); setSuggestion(null); setOverrideLocation(""); setLotNumber("");
      setMessage(session.resumed ? "Bu parti için aktif mal kabul mevcut – devam ediliyor." : `${session.lot_number} mal kabulü başlatıldı.`);
      await refreshSessions();
    } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const openSession = async (id: string) => {
    setBusy(true); setError(""); setPkg(null); setSuggestion(null); setOverrideLocation("");
    try { setSelected(await warehouseAdminApi.getReceivingSession(id)); } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const claim = async (supplierCode: string) => {
    if (!selected) return false;
    setBusy(true); setError(""); setMessage("");
    try { setPkg(await warehouseAdminApi.claimNext(supplierCode, selected.id)); setSuggestion(null); setOverrideLocation(""); return true; }
    catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); }
  };
  const print = async () => {
    if (!pkg) return; setBusy(true); setError("");
    try { const result = await warehouseAdminApi.queuePrint(pkg.id, pkg.claim_token); setPkg(result.package); setMessage("Etiket baskı kuyruğuna gönderildi."); }
    catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const placeAt = async (code: string, reason?: string) => {
    if (!pkg || !suggestion) return false; setBusy(true); setError("");
    try {
      const result = await warehouseAdminApi.placePackage(pkg.package_code, code, reason);
      setMessage(`✓ ${result.package.sku_snapshot} ${result.package.package_number}/${result.package.total_packages} yerleştirildi`);
      setPkg(null); setSuggestion(null); setOverrideLocation(""); setOverrideReason(""); setScanCycle((value) => value + 1);
      setSelected(await warehouseAdminApi.getReceivingSession(selected!.id));
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "WRONG_LOCATION" && hasWarehousePermission(user, "warehouse:move_stock")) setOverrideLocation(code);
      setError(getErrorMessage(failure)); return false;
    } finally { setBusy(false); }
  };
  const scanLocation = (code: string) => placeAt(code);
  const changeState = async (state: "active" | "paused" | "cancelled") => {
    if (!selected) return; setBusy(true); setError("");
    try { setSelected(await warehouseAdminApi.setReceivingState(selected.id, state)); setMessage(state === "active" ? "Mal kabul devam ediyor." : state === "paused" ? "Mal kabul duraklatıldı." : "Mal kabul iptal edildi."); }
    catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const complete = async (force = false) => {
    if (!selected) return; setBusy(true); setError("");
    try { setSelected(await warehouseAdminApi.completeReceivingSession(selected.id, force ? forceReason : undefined)); setMessage("Mal kabul tamamlandı."); setForceReason(""); await refreshSessions(); }
    catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const activeSessions = sessions.filter((session) => ["active", "paused"].includes(session.receiving_state));
  const completedSessions = sessions.filter((session) => session.receiving_state === "completed");
  return <PermissionPage permission="warehouse:receive"><div className="space-y-5"><PageIntro eyebrow="Mal Kabul" title="Lot bazlı kabul" description="Lot Panel master verisinden açılır; tüm cihazlar aynı server-side ilerlemeyi görür."/>
    {message && <Notice message={message}/>} {error && <Notice error message={error}/>}
    <form onSubmit={start} className="space-y-3 rounded-2xl border border-line bg-white p-4"><h2 className="text-lg font-black">Yeni Mal Kabul Başlat</h2><input autoFocus className="field min-h-14 text-lg font-black uppercase" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} placeholder="LOT-2026-09-01" required/><button className="primary-button min-h-14 w-full text-lg" disabled={busy}>Lotu getir ve başlat</button></form>
    {!!activeSessions.length && <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><h2 className="font-black text-amber-950">Aktif Mal Kabul</h2><div className="mt-3 space-y-2">{activeSessions.map((session) => <button key={session.id} onClick={() => void openSession(session.id)} className="w-full rounded-xl bg-white p-4 text-left shadow-sm"><b>{session.lot_number}</b><span className="float-right text-sm font-black text-amber-800">{session.placed_count || 0} / {session.expected_package_count}</span><p className="mt-1 text-xs text-muted">{session.receiving_state === "paused" ? "Duraklatıldı" : "Devam ediyor"}</p></button>)}</div></section>}
    {selected && <section className="space-y-4 rounded-[1.5rem] border border-line bg-white p-4 shadow-sm"><div><span className="text-xs font-black uppercase tracking-wider text-moss">{selected.receiving_state}</span><h2 className="text-2xl font-black">{selected.lot_number}</h2><p className="text-sm text-muted">{selected.progress.sku_count} SKU · {selected.progress.placed_packages}/{selected.progress.total_packages} paket · %{selected.progress.percent}</p><div className="mt-3 h-3 overflow-hidden rounded-full bg-line"><span className="block h-full bg-moss transition-all" style={{ width: `${selected.progress.percent}%` }}/></div></div>
      {selected.receiving_state === "paused" && <button className="primary-button min-h-14 w-full" onClick={() => void changeState("active")}><Play/>Devam et</button>}
      {selected.receiving_state === "active" && <>
        {!pkg && <ScanInput key={scanCycle} busy={busy} onScan={claim} label="Tedarikçi No Tara / Gir" placeholder="A012-B34" cameraTitle="Tedarikçi numarasını okutun"/>}
        {pkg && <div className="space-y-3"><PackageCard pkg={pkg}/>{pkg.image_path_snapshot && <img className="max-h-52 w-full rounded-2xl object-contain bg-canvas" src={`/api/products/${encodeURIComponent(pkg.product_id)}/image`} alt={pkg.product_name_snapshot}/>}<div className="grid grid-cols-2 gap-2 text-sm"><p className="rounded-xl bg-canvas p-3"><b>Tedarikçi</b><br/>{pkg.supplier_no_snapshot || pkg.supplier_code}</p><p className="rounded-xl bg-canvas p-3"><b>Lot</b><br/>{pkg.lot_number}</p><p className="rounded-xl bg-canvas p-3"><b>Paket</b><br/>{pkg.package_number}/{pkg.total_packages}</p><p className="rounded-xl bg-canvas p-3"><b>Ağırlık</b><br/>{pkg.package_weight_kg_snapshot || "—"} kg</p></div>
          <p className="rounded-xl bg-canvas p-3 text-sm"><b>Ürün</b><br/>{[pkg.material_snapshot, pkg.size_snapshot].filter(Boolean).join(" · ") || "—"} · {pkg.unit_weight_g_snapshot || "—"} g/adet</p>
          {["CLAIMED", "PRINT_FAILED"].includes(pkg.status) && <button className="primary-button min-h-16 w-full text-lg" disabled={busy} onClick={() => void print()}><Printer/> {pkg.status === "PRINT_FAILED" ? "Etiketi yeniden bas" : "Etiket Yazdır"}</button>}
          {pkg.status === "LABEL_QUEUED" && <Notice message="Etiket basılıyor; yazıcı sonucu bekleniyor…"/>}
          {pkg.status === "LABELED" && !suggestion && <button className="secondary-button min-h-14 w-full" onClick={async () => { try { setSuggestion(await warehouseAdminApi.suggestLocation(pkg.id)); } catch (reason) { setError(getErrorMessage(reason)); } }}><MapPin/>Lokasyon öner</button>}
          {suggestion && <><p className="rounded-2xl bg-emerald-50 p-5 text-center text-lg font-black text-success">Paketi {suggestion.code} lokasyonuna yerleştirin</p><ScanInput busy={busy} onScan={scanLocation} label="Lokasyon barkodunu okutun" placeholder={suggestion.code} cameraTitle="Raf lokasyonunu okutun"/>{overrideLocation && <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3"><p className="text-sm font-black text-amber-900">{overrideLocation} için yetkili override</p><input className="field" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Zorunlu açıklama"/><button className="secondary-button w-full" disabled={!overrideReason.trim() || busy} onClick={() => void placeAt(overrideLocation, overrideReason)}>Bu lokasyona yerleştir</button></div>}</>}
        </div>}
        <button className="secondary-button min-h-12 w-full" onClick={() => void changeState("paused")}><Pause/>Mal kabulü duraklat</button>
      </>}
      <div className="space-y-2">{selected.lines.map((line) => <div key={line.id} className={`rounded-xl border p-3 ${Number(line.completed_packages) === Number(line.expected_package_count) ? "border-emerald-200 bg-emerald-50" : "border-line"}`}><b>{line.sku_snapshot}</b><span className="float-right font-black">{line.completed_packages || 0}/{line.expected_package_count}{Number(line.completed_packages) === Number(line.expected_package_count) ? " ✓" : ""}</span><p className="mt-1 text-xs text-muted">{line.product_name_snapshot} · {line.received_quantity || 0}/{line.total_units} adet</p></div>)}</div>
      {!!selected.events?.length && <details className="rounded-xl bg-canvas p-3"><summary className="cursor-pointer font-black">Mal kabul hareketleri ({selected.events.length})</summary><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{selected.events.map((event) => <div key={String(event.id)} className="rounded-lg bg-white p-2 text-xs"><b>{String(event.event_type)}</b><span className="float-right text-muted">{new Date(String(event.created_at)).toLocaleString("tr-TR")}</span><p className="mt-1 text-muted">{String(event.actor_username || "Sistem")}{event.package_code ? ` · ${String(event.package_code)}` : ""}{event.device_id ? ` · cihaz ${String(event.device_id).slice(0, 8)}` : ""}</p></div>)}</div></details>}
      {selected.receiving_state !== "completed" && <button className="primary-button min-h-14 w-full" disabled={busy} onClick={() => void complete()}><CheckCircle2/>Mal Kabulü Tamamla</button>}
      {selected.progress.remaining_packages > 0 && hasWarehousePermission(user, "warehouse:move_stock") && <div className="space-y-2 border-t border-line pt-4"><input className="field" value={forceReason} onChange={(event) => setForceReason(event.target.value)} placeholder={`${selected.progress.remaining_packages} eksik paket için zorunlu açıklama`}/><button className="secondary-button w-full text-danger" disabled={!forceReason.trim() || busy} onClick={() => void complete(true)}>Yetkili olarak eksikle tamamla</button></div>}
    </section>}
    {!!completedSessions.length && <section className="rounded-2xl border border-line bg-white p-4"><h2 className="font-black">Tamamlananlar</h2><div className="mt-3 space-y-2">{completedSessions.map((session) => <button key={session.id} onClick={() => void openSession(session.id)} className="w-full rounded-xl bg-canvas p-3 text-left"><b>{session.lot_number}</b><span className="float-right text-xs font-black text-moss">{session.expected_package_count} paket</span><p className="mt-1 text-xs text-muted">{session.sku_count} SKU · {session.expected_unit_count} adet · {Number(session.total_weight_kg || 0).toFixed(2)} kg · {session.actor_names || "—"}</p></button>)}</div></section>}
  </div></PermissionPage>;
}

function PackageCard({ pkg }: { pkg: WarehousePackage }) {
  return <div className="rounded-2xl border border-line bg-white p-5"><span className="text-xs font-black uppercase text-moss">{pkg.status}</span><h2 className="mt-1 text-2xl font-black">{pkg.package_code}</h2><p className="mt-2 font-bold">{pkg.product_name_snapshot}</p><p className="mt-1 text-sm text-muted">{pkg.sku_snapshot} · Paket {pkg.package_number}/{pkg.total_packages} · {pkg.planned_quantity} adet</p>{pkg.location_code && <p className="mt-2 font-black text-moss">{pkg.location_code}</p>}</div>;
}

export function LabelingPage() {
  const [pkg, setPkg] = useState<WarehousePackage | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const claim = async (code: string) => { setBusy(true); setError(""); try { setPkg(await warehouseAdminApi.claimNext(code)); setMessage(""); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  const print = async () => { if (!pkg) return; setBusy(true); setError(""); try { const result = await warehouseAdminApi.queuePrint(pkg.id, pkg.claim_token); setPkg(result.package); setMessage(`${pkg.package_code} baskı kuyruğuna eklendi.`); } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); } };
  return <PermissionPage permission="warehouse:print_labels"><div className="space-y-5"><PageIntro eyebrow="Etiketleme" title="Sıradaki paketi ayır" description="Tedarikçi kodu paketi kısa süreli ayırır. Barkod/QR PDF’i kuyrukta hazırlanıp CUPS yazıcısına gönderilir."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>}<ScanInput busy={busy} onScan={claim} label="Tedarikçi kodunu okutun" placeholder="Tedarikçi kodu" cameraTitle="Tedarikçi kodunu okutun"/>{pkg && <><PackageCard pkg={pkg}/><button className="primary-button w-full" disabled={busy} onClick={() => void print()}><Printer/>Etiketi kuyruğa gönder</button></>}</div></PermissionPage>;
}

function TwoStepPackagePage({ mode }: { mode: "place" | "move" }) {
  const permission = mode === "place" ? "warehouse:place_packages" : "warehouse:move_stock";
  const [pkg, setPkg] = useState<WarehousePackage | null>(null); const [suggestion, setSuggestion] = useState<WarehouseLocation | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const scanPackage = async (code: string) => { setBusy(true); setError(""); try { setPkg(await warehouseAdminApi.getPackage(code)); if (mode === "place") warehouseAdminApi.suggestLocation().then(setSuggestion).catch(() => setSuggestion(null)); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  const scanLocation = async (code: string) => { if (!pkg) return false; setBusy(true); setError(""); try { const result = mode === "place" ? await warehouseAdminApi.placePackage(pkg.package_code, code) : await warehouseAdminApi.movePackage(pkg.package_code, code); setMessage(`${result.package.package_code} → ${result.package.location_code}`); setPkg(null); setSuggestion(null); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  return <PermissionPage permission={permission}><div className="space-y-5"><PageIntro eyebrow={mode === "place" ? "Yerleştirme" : "Ürün Taşıma"} title={mode === "place" ? "Paket → lokasyon" : "Paketi taşı"} description="İşlem sırası sabittir: önce benzersiz paket kodu, sonra hedef lokasyon kodu okutulur."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>} {!pkg ? <ScanInput busy={busy} onScan={scanPackage} label="1. Paket kodunu okutun" placeholder="PKG-…" cameraTitle="Paket kodunu okutun"/> : <><PackageCard pkg={pkg}/>{suggestion && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-success">Önerilen lokasyon: {suggestion.code} · {suggestion.available_capacity} boş kapasite</p>}<ScanInput busy={busy} onScan={scanLocation} label="2. Hedef lokasyonu okutun" placeholder="A1-K1-P1" cameraTitle="Hedef lokasyonu okutun"/></>}</div></PermissionPage>;
}

export const PlacementPage = () => <TwoStepPackagePage mode="place"/>;
export const MoveStockPage = () => <TwoStepPackagePage mode="move"/>;

export function LocationsPage() {
  const [locations, setLocations] = useState<WarehouseLocation[]>([]); const [code, setCode] = useState(""); const [capacity, setCapacity] = useState("1"); const [error, setError] = useState("");
  const reload = () => warehouseAdminApi.listLocations().then(setLocations).catch((reason) => setError(getErrorMessage(reason)));
  useEffect(() => { void reload(); }, []);
  const create = async (event: FormEvent) => { event.preventDefault(); setError(""); try { await warehouseAdminApi.createLocation({ code, package_capacity: Number(capacity) }); setCode(""); setCapacity("1"); reload(); } catch (reason) { setError(getErrorMessage(reason)); } };
  return <PermissionPage permission="warehouse:manage_locations"><div className="space-y-5"><PageIntro eyebrow="Lokasyonlar" title="Kapasite yönetimi" description="Yerleştirme önerisi en düşük doluluk ve kod sırasına göre deterministik olarak seçilir."/>{error && <Notice error message={error}/>}<form onSubmit={create} className="grid grid-cols-[1fr_90px] gap-3 rounded-2xl border border-line bg-white p-4"><input className="field uppercase" value={code} onChange={(event) => setCode(event.target.value)} placeholder="A1-K1-P1" required/><input className="field" type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)}/><button className="primary-button col-span-2">Lokasyon ekle</button></form><div className="space-y-2">{locations.map((location) => <div className="rounded-2xl border border-line bg-white p-4" key={location.id}><b>{location.code}</b><span className="float-right font-black text-moss">{location.occupied_packages}/{location.package_capacity}</span><div className="mt-3 h-2 overflow-hidden rounded bg-line"><span className="block h-full bg-moss" style={{ width: `${Math.min(100, location.occupied_packages / location.package_capacity * 100)}%` }}/></div></div>)}</div></div></PermissionPage>;
}

export function StockCountPage() {
  const [pkg, setPkg] = useState<WarehousePackage | null>(null); const [quantity, setQuantity] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const scan = async (code: string) => { setBusy(true); setError(""); try { const found = await warehouseAdminApi.getPackage(code); setPkg(found); setQuantity(String(found.remaining_quantity)); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  const submit = async () => { if (!pkg) return; setBusy(true); try { const result = await warehouseAdminApi.countPackage(pkg.package_code, Number(quantity)); setMessage(`${result.package.package_code}: ${result.package.remaining_quantity} adet kaydedildi.`); setPkg(null); } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); } };
  return <PermissionPage permission="warehouse:count_stock"><div className="space-y-5"><PageIntro eyebrow="Stok Sayımı" title="Paket bakiyesini say" description="Fark, paket hareketi ve merkez stok hareketi olarak aynı işlemde kaydedilir."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>} {!pkg ? <ScanInput busy={busy} onScan={scan} label="Paket kodunu okutun" placeholder="PKG-…" cameraTitle="Sayılacak paketi okutun"/> : <><PackageCard pkg={pkg}/><input className="field text-xl font-black" type="number" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)}/><button className="primary-button w-full" disabled={busy} onClick={() => void submit()}>Sayımı kaydet</button></>}</div></PermissionPage>;
}

export function PrintJobsPage() {
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]); const [error, setError] = useState("");
  const reload = () => warehouseAdminApi.listPrintJobs().then(setJobs).catch((reason) => setError(getErrorMessage(reason)));
  useEffect(() => { void reload(); }, []);
  const reprint = async (job: Record<string, unknown>) => { try { await warehouseAdminApi.queuePrint(String(job.package_id)); await reload(); } catch (reason) { setError(getErrorMessage(reason)); } };
  return <PermissionPage permission="warehouse:print_labels"><div className="space-y-5"><PageIntro eyebrow="Baskı Geçmişi" title="Etiket kuyruğu" description="Her yeniden baskı aynı paket kodunu korur; yeni, izlenebilir bir baskı işi oluşturur."/><button className="secondary-button w-full" onClick={reload}><RefreshCw/>Yenile</button>{error && <Notice error message={error}/>}<div className="space-y-2">{jobs.map((job) => <div key={String(job.id)} className="rounded-2xl border border-line bg-white p-4"><b>{String(job.package_code)}</b><span className={`float-right text-xs font-black ${job.status === "FAILED" ? "text-danger" : "text-moss"}`}>{String(job.status)}</span><p className="mt-1 text-xs text-muted">{String(job.sku_snapshot)} · deneme {String(job.attempts)}/{String(job.max_attempts)}</p>{Boolean(job.error_message) && <p className="mt-2 text-xs text-danger">{String(job.error_message)}</p>}{["PRINT_FAILED", "LABELED", "PLACED", "OPEN", "EMPTY"].includes(String(job.package_status)) && <button className="secondary-button mt-3 w-full" onClick={() => void reprint(job)}><Printer size={17}/>Aynı paketi yeniden bas</button>}</div>)}</div></div></PermissionPage>;
}

export function LabelTemplatesPage() {
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]); const [selected, setSelected] = useState<Record<string, unknown> | null>(null); const [json, setJson] = useState(""); const [name, setName] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const reload = async () => { try { const data = await warehouseAdminApi.listTemplates(); setTemplates(data); if (!selected && data[0]) { setSelected(data[0]); setName(String(data[0].name || "")); setJson(JSON.stringify(data[0].template, null, 2)); } } catch (reason) { setError(getErrorMessage(reason)); } };
  useEffect(() => { void reload(); }, []);
  const choose = (template: Record<string, unknown>) => { setSelected(template); setName(String(template.name || "")); setJson(JSON.stringify(template.template, null, 2)); setMessage(""); setError(""); };
  const save = async () => { try { const template = JSON.parse(json); await warehouseAdminApi.saveTemplate({ id: selected?.id, name, template, is_default: selected?.is_default === 1 }); setMessage("Şablon yeni sürüm olarak kaydedildi."); await reload(); } catch (reason) { setError(reason instanceof SyntaxError ? "JSON biçimi geçersiz." : getErrorMessage(reason)); } };
  return <PermissionPage permission="warehouse:edit_label_templates"><div className="space-y-5"><PageIntro eyebrow="Etiket Şablonları" title="Merkezi JSON şablonu" description="Label Printer tasarım JSON'u değişmeden Panel veritabanında sürümlenir; baskı işleri seçilen snapshot'ı kullanır."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>}<div className="flex gap-2 overflow-x-auto">{templates.map((template) => <button key={String(template.id)} className="filter-chip" onClick={() => choose(template)}>{String(template.name)}</button>)}</div><input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Şablon adı"/><textarea className="field min-h-96 font-mono text-xs" spellCheck={false} value={json} onChange={(event) => setJson(event.target.value)}/><button className="primary-button w-full" onClick={() => void save()}>Şablonu kaydet</button></div></PermissionPage>;
}

export { permissionLabels };
