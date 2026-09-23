import {
  Boxes, CheckCircle2, ClipboardCheck, Eye, MapPin, Move, PackageCheck, Pause, Play, Printer, RefreshCw, Scale, Settings2, X,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ScanInput } from "../features/picking/ScanInput";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";
import { ApiError, getErrorMessage, labelApi, warehouseAdminApi, warehouseExecutionApi, type PrintJob, type ReprintReason } from "../lib/api";
import { openPdfBlob } from "../lib/labels";
import type { ReceivingPlacedPackage, ReceivingSession, WarehouseExecutionLocation, WarehouseExecutionPackage, WarehouseLocation, WarehousePackage, WarehousePermission, WarehouseReplenishmentTask } from "../types/warehouse";

const permissionLabels: Record<WarehousePermission, string> = {
  "warehouse:pick_orders": "Sipariş Toplama",
  "warehouse:receive": "Mal Kabul",
  "warehouse:manage_receiving_sessions": "Mal Kabul Oturumu Yönetimi",
  "warehouse:print_labels": "Etiketleme",
  "warehouse:place_packages": "Yerleştirme",
  "warehouse:move_stock": "Ürün Taşıma",
  "warehouse:manage_locations": "Lokasyonlar",
  "warehouse:count_stock": "Stok Sayımı",
  "warehouse:accept_returns": "İade Kabul",
  "shipping:manage": "Sevkiyat Yönetimi",
  "shipping:dispatch": "Fiziksel Teslim ve Dispatch",
  "warehouse:edit_label_templates": "Etiket Şablonları",
  "warehouse:view_map": "Depo Haritası",
  "warehouse:view_analytics": "Depo Analizi",
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
  { to: "/admin/replenishments", permission: "warehouse:move_stock", title: "Replenishment", description: "Bekleyen aynı-lot ikmal görevlerini tara ve tamamla", icon: RefreshCw },
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

const receivingBusinessErrors = new Set(["PLANNED_LOCATION_MISSING", "PLANNED_LOCATION_NOT_FOUND", "PLANNED_LOCATION_FULL"]);

export function formatReceivingEvent(event: Record<string, unknown>) {
  const actor = String(event.actor_username || "Sistem");
  const sku = String(event.sku_snapshot || "paket");
  const ordinal = event.package_number ? ` ${String(event.package_number)}/${String(event.total_packages)}` : "";
  const location = String(event.location_code || "");
  switch (String(event.event_type || "")) {
    case "SESSION_STARTED": return `${actor}, ${String(event.lot_number || "mal kabul")} oturumunu başlattı.`;
    case "SESSION_PAUSED": return `${actor}, mal kabulü duraklattı.`;
    case "SESSION_ACTIVE": return `${actor}, mal kabulü devam ettirdi.`;
    case "SESSION_COMPLETED": return `${actor}, mal kabulü tamamladı.`;
    case "SESSION_FORCE_COMPLETED": return `${actor}, mal kabulü açıklamayla tamamladı.`;
    case "SESSION_CANCELLED": return `${actor}, mal kabulü iptal etti.`;
    case "PACKAGE_CLAIMED": return `${actor}, ${sku}${ordinal} paketini işleme aldı.`;
    case "PACKAGE_CLAIM_RELEASED": return `${actor}, ${sku}${ordinal} paketinin claim'ini serbest bıraktı.`;
    case "LABEL_QUEUED": return `${sku}${ordinal} etiketi yazdırma kuyruğuna gönderildi.`;
    case "LABEL_REPRINT_QUEUED": return `${sku}${ordinal} etiketi yeniden yazdırma kuyruğuna gönderildi.`;
    case "LABEL_PRINTED": return `${sku}${ordinal} etiketi basıldı.`;
    case "LABEL_PRINT_FAILED": return `${sku}${ordinal} etiketi basılamadı.`;
    case "PACKAGE_PLACED": return `${actor}, ${sku}${ordinal} paketini ${location || "planlanan"} rafına yerleştirdi.`;
    default: return "Mal kabul işlemi güncellendi.";
  }
}

const waitForRetry = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function requestReceivingLocationWithRetry<T>(
  request: () => Promise<T>,
  wait: (milliseconds: number) => Promise<unknown> = waitForRetry,
  onRetry?: () => void,
) {
  const delays = [0, 1_000, 2_000];
  let lastError: unknown;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    const delay = delays[attempt];
    if (delay) await wait(delay);
    try {
      return await request();
    } catch (reason) {
      if (reason instanceof ApiError && receivingBusinessErrors.has(reason.code || "")) throw reason;
      lastError = reason;
      if (attempt < delays.length - 1) onRetry?.();
    }
  }
  throw lastError;
}

function LegacyInboundPage() {
  const { user } = useAuth();
  const canManage = hasWarehousePermission(user, "warehouse:manage_receiving_sessions");
  const [sessions, setSessions] = useState<ReceivingSession[]>([]);
  const [selected, setSelected] = useState<ReceivingSession | null>(null);
  const [lotNumber, setLotNumber] = useState("");
  const [supplierCode, setSupplierCode] = useState("");
  const [pkg, setPkg] = useState<WarehousePackage | null>(null);
  const [suggestion, setSuggestion] = useState<WarehouseLocation | null>(null);
  const [myPackages, setMyPackages] = useState<ReceivingPlacedPackage[]>([]);
  const [packageDetail, setPackageDetail] = useState<ReceivingPlacedPackage | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [overrideLocation, setOverrideLocation] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [locationBusinessError, setLocationBusinessError] = useState(false);
  const [locationRetrying, setLocationRetrying] = useState(false);
  const [scanCycle, setScanCycle] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadReceivingLocation = async (activePackage: WarehousePackage) => {
    setSuggestion(null); setLocationBusinessError(false); setLocationRetrying(false);
    try {
      const target = await requestReceivingLocationWithRetry(
        () => warehouseAdminApi.getReceivingLocation(activePackage.id),
        waitForRetry,
        () => { setLocationRetrying(true); setMessage("Planlanan raf yüklenemedi. Tekrar deneniyor…"); },
      );
      setSuggestion(target); setError(""); setMessage(""); setLocationRetrying(false);
    } catch (reason) {
      setLocationRetrying(false); setMessage("");
      if (reason instanceof ApiError && receivingBusinessErrors.has(reason.code || "")) {
        setLocationBusinessError(true); setError(reason.message); return;
      }
      setError("Planlanan raf geçici olarak yüklenemedi. Bağlantıyı kontrol edip tekrar deneyin.");
    }
  };

  const openSession = async (id: string, restoredPackage?: WarehousePackage | null) => {
    setBusy(true); setError(""); setSuggestion(null); setOverrideLocation(""); setLocationBusinessError(false);
    try {
      const [session, activePackage, history] = await Promise.all([
        warehouseAdminApi.getReceivingSession(id),
        restoredPackage === undefined ? warehouseAdminApi.getMyActiveReceivingPackage(id) : Promise.resolve(restoredPackage),
        warehouseAdminApi.listMyReceivingPackages(id),
      ]);
      setSelected(session); setPkg(activePackage); setMyPackages(history);
      if (activePackage) setMessage("Devam eden paketiniz var. Kaldığınız aşamadan devam edebilirsiniz.");
      if (activePackage?.status === "LABELED") await loadReceivingLocation(activePackage);
    } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };

  const refreshSessions = async () => {
    try {
      const next = await warehouseAdminApi.listReceivingSessions();
      setSessions(next);
      if (selected) setSelected(await warehouseAdminApi.getReceivingSession(selected.id));
    } catch (reason) { setError(getErrorMessage(reason)); }
  };

  useEffect(() => {
    let active = true;
    void Promise.all([warehouseAdminApi.listReceivingSessions(), warehouseAdminApi.getMyActiveReceivingPackage()])
      .then(async ([nextSessions, activePackage]) => {
        if (!active) return;
        setSessions(nextSessions);
        if (activePackage) await openSession(activePackage.batch_id, activePackage);
      }).catch((reason) => { if (active) setError(getErrorMessage(reason)); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => void refreshSessions(), 3_000);
    return () => window.clearInterval(timer);
  }, [selected?.id]);

  useEffect(() => {
    if (!pkg || !["LABEL_QUEUED", "PRINT_FAILED"].includes(pkg.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const current = await warehouseAdminApi.getPackage(pkg.package_code);
        setPkg(current);
        if (current.status === "LABELED") {
          setMessage("Etiket başarıyla basıldı.");
          await loadReceivingLocation(current);
        }
      } catch (reason) { setError(getErrorMessage(reason)); }
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [pkg?.id, pkg?.status]);

  const start = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const session = await warehouseAdminApi.startReceivingSession(lotNumber, supplierCode);
      setLotNumber(""); setSupplierCode(""); setMessage(session.resumed ? "Bu lot için mevcut mal kabul açıldı." : `${session.lot_number} partisi oluşturuldu ve mal kabul başlatıldı.`);
      await refreshSessions(); await openSession(session.id);
    } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const claim = async (supplierCode: string) => {
    if (!selected) return false;
    setBusy(true); setError(""); setMessage("");
    try {
      const claimed = await warehouseAdminApi.claimNext(supplierCode, selected.id);
      setPkg(claimed); setSuggestion(null);
      if (claimed.status === "LABELED") await loadReceivingLocation(claimed);
      return true;
    }
    catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); }
  };
  const print = async () => {
    if (!pkg) return; setBusy(true); setError("");
    try { const job = await warehouseAdminApi.queuePrint(pkg.id, pkg.claim_token); setMessage(`${job.subject_code} için baskı işi kuyruğa alındı; fiziksel baskı henüz doğrulanmadı.`); }
    catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const preview = async () => {
    if (!pkg) return; setBusy(true); setError("");
    try { const snapshot = await warehouseAdminApi.getPackagePrintPreview(pkg.id); openPdfBlob(await labelApi.preview("goods_receipt", snapshot.payload)); }
    catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const placeAt = async (code: string, reason?: string) => {
    if (!pkg || (!suggestion && !reason)) return false; setBusy(true); setError("");
    try {
      const result = await warehouseAdminApi.placePackage(pkg.package_code, code, reason);
      setMessage(`✓ ${result.package.sku_snapshot} ${result.package.package_number}/${result.package.total_packages} ${result.package.location_code} lokasyonuna yerleştirildi`);
      setPkg(null); setSuggestion(null); setOverrideLocation(""); setOverrideReason(""); setLocationBusinessError(false); setScanCycle((value) => value + 1);
      if (selected) {
        const [session, history] = await Promise.all([warehouseAdminApi.getReceivingSession(selected.id), warehouseAdminApi.listMyReceivingPackages(selected.id)]);
        setSelected(session); setMyPackages(history);
      }
      return true;
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "WRONG_LOCATION" && hasWarehousePermission(user, "warehouse:move_stock")) setOverrideLocation(code);
      setError(getErrorMessage(failure)); return false;
    } finally { setBusy(false); }
  };
  const changeState = async (state: "active" | "paused" | "cancelled") => {
    if (!selected) return; setBusy(true); setError("");
    try { const session = await warehouseAdminApi.setReceivingState(selected.id, state); setSelected(session); setMessage(state === "active" ? "Mal kabul devam ediyor." : state === "paused" ? "Mal kabul duraklatıldı." : "Mal kabul iptal edildi."); await refreshSessions(); }
    catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const complete = async (force = false) => {
    if (!selected) return; setBusy(true); setError("");
    try { setSelected(await warehouseAdminApi.completeReceivingSession(selected.id, force ? forceReason : undefined)); setMessage("Mal kabul tamamlandı."); setForceReason(""); await refreshSessions(); }
    catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const releasePackage = async (packageId: string) => {
    if (!selected) return; setBusy(true); setError("");
    try { await warehouseAdminApi.releaseReceivingPackage(packageId); setMessage("Paket claim'i serbest bırakıldı."); await openSession(selected.id); }
    catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const activeSessions = sessions.filter((session) => ["active", "paused"].includes(session.receiving_state));
  const completedSessions = sessions.filter((session) => session.receiving_state === "completed");
  const supplierCodes = selected?.supplier_codes?.length ? selected.supplier_codes : selected?.lines.map((line) => line.supplier_code).filter(Boolean) || [];

  return <PermissionPage permission="warehouse:receive"><div className="space-y-5"><PageIntro eyebrow="Mal Kabul V2" title="Lot bazlı kabul" description={`${activeSessions.length} aktif mal kabul · kullanıcı işi ve raf rezervasyonu server-side korunur.`}/>
    {message && <Notice message={message}/>} {error && <Notice error message={error}/>}
    {canManage && <form onSubmit={start} className="space-y-3 rounded-2xl border border-line bg-white p-4"><h2 className="text-lg font-black">Yeni Parti / Lot</h2><input className="field min-h-14 text-lg font-black uppercase" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} placeholder="2026-09-16-01" required/><input className="field min-h-14 font-black uppercase" value={supplierCode} onChange={(event) => setSupplierCode(event.target.value)} placeholder="Tedarikçi kodu (opsiyonel)"/><button className="primary-button min-h-14 w-full text-lg" disabled={busy}>Partiyi Oluştur / Aç</button></form>}
    <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4"><h2 className="font-black text-amber-950">Aktif Mal Kabuller</h2>{activeSessions.length ? <div className="mt-3 space-y-2">{activeSessions.map((session) => <button key={session.id} onClick={() => void openSession(session.id)} className="w-full rounded-xl bg-white p-4 text-left shadow-sm"><b>{session.lot_number}</b><span className="float-right text-sm font-black text-amber-800">{session.placed_count || 0} / {session.expected_package_count}</span><p className="mt-1 text-xs text-muted">{session.receiving_state === "paused" ? "Duraklatıldı" : "Devam ediyor"}</p></button>)}</div> : <p className="mt-2 text-sm text-amber-900">Açık mal kabul bulunmuyor.</p>}</section>
    {selected && <section className="space-y-4 rounded-[1.5rem] border border-line bg-white p-4 shadow-sm"><div><span className="text-xs font-black uppercase tracking-wider text-moss">{selected.receiving_state}</span><h2 className="text-2xl font-black">{selected.lot_number}</h2><p className="text-sm text-muted">{selected.progress.placed_packages} / {selected.progress.total_packages} paket tamamlandı</p><div className="mt-3 h-3 overflow-hidden rounded-full bg-line"><span className="block h-full bg-moss transition-all" style={{ width: `${selected.progress.percent}%` }}/></div></div>
      {canManage && <div className="grid grid-cols-2 gap-2">{selected.receiving_state === "paused" ? <button className="primary-button min-h-12" onClick={() => void changeState("active")}><Play/>Devam et</button> : selected.receiving_state === "active" ? <button className="secondary-button min-h-12" onClick={() => void changeState("paused")}><Pause/>Duraklat</button> : null}{["active", "paused"].includes(selected.receiving_state) && <button className="secondary-button min-h-12 text-danger" onClick={() => void changeState("cancelled")}>İptal et</button>}</div>}
      {selected.receiving_state === "active" && <>
        {!pkg && (
          <ScanInput key={scanCycle} busy={busy} onScan={claim} label="Tedarikçi No Tara / Gir" placeholder="A012-B34" cameraTitle="Tedarikçi numarasını okutun" mode="both" ocrCandidates={[...new Set(supplierCodes)]}/>
        )}
        {pkg && <div className="space-y-3"><Notice message="Devam eden paketiniz var"/><PackageCard pkg={pkg}/>{pkg.image_path_snapshot && <img className="max-h-52 w-full rounded-2xl bg-canvas object-contain" src={`/api/products/${encodeURIComponent(pkg.product_id)}/image`} alt={pkg.product_name_snapshot}/>}<div className="grid grid-cols-2 gap-2 text-sm"><p className="rounded-xl bg-canvas p-3"><b>Tedarikçi</b><br/>{pkg.supplier_no_snapshot || pkg.supplier_code}</p><p className="rounded-xl bg-canvas p-3"><b>Lot</b><br/>{pkg.lot_number}</p><p className="rounded-xl bg-canvas p-3"><b>Paket</b><br/>{pkg.package_number}/{pkg.total_packages}</p><p className="rounded-xl bg-canvas p-3"><b>Ağırlık</b><br/>{pkg.package_weight_kg_snapshot || "—"} kg</p></div>
          {["CLAIMED", "PRINT_FAILED"].includes(pkg.status) && <div className="grid grid-cols-2 gap-2"><button className="secondary-button min-h-14" disabled={busy} onClick={() => void preview()}><Eye/>Etiket Önizle</button><button className="primary-button min-h-14" disabled={busy} onClick={() => void print()}><Printer/> {pkg.status === "PRINT_FAILED" ? "Yeniden Yazdır" : "Yazdır"}</button></div>}
          {pkg.status === "LABEL_QUEUED" && <Notice message="Etiket basılıyor; yazıcı sonucu bekleniyor…"/>}
          {pkg.status === "LABELED" && !suggestion && (
            <Notice message={locationRetrying ? "Planlanan raf yüklenemedi. Tekrar deneniyor…" : "Planlanan lokasyon yükleniyor…"}/>
          )}
          {pkg.status === "LABELED" && !suggestion && !locationRetrying && !locationBusinessError && <button className="secondary-button w-full" onClick={() => void loadReceivingLocation(pkg)}><RefreshCw/>Planlanan rafı tekrar yükle</button>}
          {suggestion && <><div className="rounded-2xl bg-emerald-50 p-5 text-center text-success"><p className="text-xs font-black uppercase tracking-[0.18em]">Yerleştirilecek Raf{suggestion.using_reserve ? " · Rezerv" : ""}</p><p className="mt-2 text-3xl font-black">{suggestion.code}</p><p className="mt-2 font-bold">ÜRÜNÜ {suggestion.code} RAFINA YERLEŞTİRİN</p></div><ScanInput busy={busy} onScan={(code) => placeAt(code)} label="Lokasyon barkodunu okutun" placeholder={suggestion.code} cameraTitle="Raf lokasyonunu okutun" mode="barcode"/>{overrideLocation && <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3"><p className="text-sm font-black text-amber-900">İstisnai yerleştirme: {overrideLocation}</p><input className="field" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Zorunlu açıklama"/><button className="secondary-button w-full" disabled={!overrideReason.trim() || busy} onClick={() => void placeAt(overrideLocation, overrideReason)}>Bu lokasyona yerleştir</button></div>}</>}
          {locationBusinessError && hasWarehousePermission(user, "warehouse:move_stock") && <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4"><p className="font-black text-amber-950">Yalnız istisnai manuel yerleştirme</p><ScanInput busy={busy} mode="barcode" onScan={async (code) => { setOverrideLocation(code); return true; }} label="Alternatif lokasyon barkodunu okutun" placeholder="Lokasyon kodu" cameraTitle="Alternatif rafı okutun"/>{overrideLocation && <><input className="field" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Zorunlu override açıklaması"/><button className="secondary-button w-full" disabled={!overrideReason.trim() || busy} onClick={() => void placeAt(overrideLocation, overrideReason)}>Override ile yerleştir</button></>}</div>}
        </div>}
      </>}
      <section><h3 className="font-black">Benim Yerleştirdiklerim</h3>{myPackages.length ? <div className="mt-3 space-y-2">{myPackages.map((item) => <button key={item.package_id} className="w-full rounded-xl bg-canvas p-3 text-left" onClick={() => setPackageDetail(item)}><b>{item.sku}</b><span className="float-right text-xs font-black text-moss">{item.location_code}</span><p className="mt-1 text-xs text-muted">Paket {item.package_number}/{item.total_packages} · {new Date(item.placed_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</p></button>)}</div> : <p className="mt-2 text-sm text-muted">Bu lotta henüz yerleştirdiğiniz paket yok.</p>}</section>
      {!!selected.events?.length && <details className="rounded-xl bg-canvas p-3"><summary className="cursor-pointer font-black">Son hareketler</summary><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{selected.events.slice(0, 30).map((event) => <div key={String(event.id)} className="rounded-lg bg-white p-3 text-xs"><span className="float-right text-muted">{new Date(String(event.created_at)).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span><p className="pr-12 font-bold">{formatReceivingEvent({ ...event, lot_number: selected.lot_number })}</p></div>)}</div></details>}
      {canManage && !!selected.active_packages?.length && <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer font-black">Aktif kullanıcı işleri ({selected.active_packages.length})</summary><div className="mt-3 space-y-2">{selected.active_packages.map((activePackage) => <div key={activePackage.id} className="rounded-xl bg-canvas p-3 text-sm"><b>{activePackage.sku_snapshot} {activePackage.package_number}/{activePackage.total_packages}</b><p className="text-xs text-muted">{activePackage.status} · {activePackage.package_code}</p><button className="secondary-button mt-2 w-full" disabled={busy} onClick={() => void releasePackage(activePackage.id)}>Claim'i serbest bırak</button></div>)}</div></details>}
      {canManage && selected.receiving_state !== "completed" && <button className="primary-button min-h-14 w-full" disabled={busy} onClick={() => void complete()}><CheckCircle2/>Mal Kabulü Tamamla</button>}
      {canManage && selected.progress.remaining_packages > 0 && <div className="space-y-2 border-t border-line pt-4"><input className="field" value={forceReason} onChange={(event) => setForceReason(event.target.value)} placeholder={`${selected.progress.remaining_packages} eksik paket için zorunlu açıklama`}/><button className="secondary-button w-full text-danger" disabled={!forceReason.trim() || busy} onClick={() => void complete(true)}>Yetkili olarak eksikle tamamla</button></div>}
      {canManage && !!selected.lines.length && <details className="rounded-xl border border-line p-3"><summary className="cursor-pointer font-black">Lot Detayı ({selected.lines.length} SKU)</summary><div className="mt-3 space-y-2">{selected.lines.map((line) => <div key={line.id} className="rounded-xl bg-canvas p-3"><b>{line.sku_snapshot}</b><span className="float-right font-black">{line.completed_packages || 0}/{line.expected_package_count}</span><p className="mt-1 text-xs text-muted">{line.product_name_snapshot}</p></div>)}</div></details>}
    </section>}
    {canManage && !!completedSessions.length && <section className="rounded-2xl border border-line bg-white p-4"><h2 className="font-black">Tamamlananlar</h2><div className="mt-3 space-y-2">{completedSessions.map((session) => <button key={session.id} onClick={() => void openSession(session.id)} className="w-full rounded-xl bg-canvas p-3 text-left"><b>{session.lot_number}</b><span className="float-right text-xs font-black text-moss">{session.expected_package_count} paket</span></button>)}</div></section>}
    {packageDetail && <div className="fixed inset-0 z-[80] flex items-end bg-black/50 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label="Yerleştirilen paket detayı"><div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-lg sm:rounded-3xl"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Paket Detayı</h2><button className="grid size-11 place-items-center rounded-xl bg-canvas" aria-label="Detayı kapat" onClick={() => setPackageDetail(null)}><X/></button></div><img className="mt-4 max-h-56 w-full rounded-2xl bg-canvas object-contain" src={packageDetail.image_url} alt={packageDetail.product_name}/><div className="mt-4 grid grid-cols-2 gap-2 text-sm"><p className="rounded-xl bg-canvas p-3"><b>SKU</b><br/>{packageDetail.sku}</p><p className="rounded-xl bg-canvas p-3"><b>Ürün</b><br/>{packageDetail.product_name}</p><p className="rounded-xl bg-canvas p-3"><b>Supplier No</b><br/>{packageDetail.supplier_no || "—"}</p><p className="rounded-xl bg-canvas p-3"><b>Lot</b><br/>{packageDetail.lot_number}</p><p className="rounded-xl bg-canvas p-3"><b>Paket</b><br/>{packageDetail.package_number}/{packageDetail.total_packages}</p><p className="rounded-xl bg-canvas p-3"><b>Adet</b><br/>{packageDetail.quantity}</p><p className="rounded-xl bg-canvas p-3"><b>Ağırlık</b><br/>{packageDetail.package_weight_kg || "—"} kg</p><p className="rounded-xl bg-canvas p-3"><b>Raf</b><br/>{packageDetail.location_code}</p><p className="rounded-xl bg-canvas p-3"><b>Zaman</b><br/>{new Date(packageDetail.placed_at).toLocaleString("tr-TR")}</p><p className="rounded-xl bg-canvas p-3"><b>Kullanıcı</b><br/>{packageDetail.placed_by_username}</p><p className="col-span-2 rounded-xl bg-canvas p-3"><b>Package Code</b><br/>{packageDetail.package_code}</p></div></div></div>}
  </div></PermissionPage>;
}

function PackageCard({ pkg }: { pkg: WarehousePackage }) {
  return <div className="rounded-2xl border border-line bg-white p-5"><span className="text-xs font-black uppercase text-moss">{pkg.status}</span><h2 className="mt-1 text-2xl font-black">{pkg.package_code}</h2><p className="mt-2 font-bold">{pkg.product_name_snapshot}</p><p className="mt-1 text-sm text-muted">{pkg.sku_snapshot} · Paket {pkg.package_number}/{pkg.total_packages} · {pkg.planned_quantity} adet</p>{pkg.location_code && <p className="mt-2 font-black text-moss">{pkg.location_code}</p>}</div>;
}

function ExecutionPackageCard({ pkg }: { pkg: WarehouseExecutionPackage }) {
  return <div className="rounded-2xl border border-line bg-white p-5"><span className="text-xs font-black uppercase text-moss">{pkg.status}</span><h2 className="mt-1 text-2xl font-black">{pkg.code}</h2><p className="mt-2 font-bold">Ürün: {pkg.productId}</p><p className="mt-1 text-sm text-muted">Lot {pkg.supplierLotCode} · {pkg.remainingQuantityBaseInt} {pkg.baseUomCode}</p>{pkg.currentLocationCode && <p className="mt-2 font-black text-moss">{pkg.currentLocationCode}</p>}</div>;
}

export function InboundPage() {
  const [costSnapshotId, setCostSnapshotId] = useState("");
  const [supplierLotCode, setSupplierLotCode] = useState("");
  const [packageCode, setPackageCode] = useState("");
  const [accepted, setAccepted] = useState("1");
  const [damaged, setDamaged] = useState("0");
  const [packages, setPackages] = useState<WarehouseExecutionPackage[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const acceptedQuantityBaseInt = Number(accepted);
      const damagedQuantityBaseInt = Number(damaged);
      const receiptId = crypto.randomUUID();
      const receiptPackages: Array<Record<string, unknown>> = [];
      if (acceptedQuantityBaseInt > 0) receiptPackages.push({ id: crypto.randomUUID(), code: packageCode.trim(), quantityBaseInt: acceptedQuantityBaseInt, disposition: "ACCEPTED" });
      if (damagedQuantityBaseInt > 0) receiptPackages.push({ id: crypto.randomUUID(), code: `${packageCode.trim()}-DAMAGED`, quantityBaseInt: damagedQuantityBaseInt, disposition: "DAMAGED" });
      const result = await warehouseExecutionApi.receiveGoods({
        receiptId, receiptSeriesId: receiptId, stageIndex: 1, isFinal: true,
        costSnapshotId: costSnapshotId.trim(), supplierLotCode: supplierLotCode.trim(),
        acceptedQuantityBaseInt, damagedQuantityBaseInt, receivedAt: new Date().toISOString(), packages: receiptPackages,
      });
      setPackages(result.packages);
      setMessage(`${result.status}: ${result.acceptedQuantityBaseInt} kullanılabilir, ${result.damagedQuantityBaseInt} karantina, ${result.shortageQuantityBaseInt} eksik.`);
    } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  return <PermissionPage permission="warehouse:receive"><div className="space-y-5"><PageIntro eyebrow="Mal Kabul V2-08" title="Onaylı maliyet snapshot'ından kabul" description="Tek aşamalı kabul etkindir. Eksik miktar kaydedilir; fazla miktar önce yetkili onayı ister; hasarlı paket karantinaya gider."/>
    {message && <Notice message={message}/>} {error && <Notice error message={error}/>}<form onSubmit={submit} className="space-y-3 rounded-2xl border border-line bg-white p-4">
      <input className="field" value={costSnapshotId} onChange={(event) => setCostSnapshotId(event.target.value)} placeholder="V2-06 maliyet snapshot ID" required/>
      <input className="field uppercase" value={supplierLotCode} onChange={(event) => setSupplierLotCode(event.target.value)} placeholder="Tedarikçi lotu" required/>
      <input className="field uppercase" value={packageCode} onChange={(event) => setPackageCode(event.target.value)} placeholder="Paket kodu" required/>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm font-bold">Kabul edilen<input className="field mt-1" type="number" min="0" step="1" value={accepted} onChange={(event) => setAccepted(event.target.value)} required/></label><label className="text-sm font-bold">Hasarlı / karantina<input className="field mt-1" type="number" min="0" step="1" value={damaged} onChange={(event) => setDamaged(event.target.value)} required/></label></div>
      <button className="primary-button w-full" disabled={busy || Number(accepted) + Number(damaged) <= 0}>Kabulü kaydet ve paket oluştur</button>
    </form>{packages.map((pkg) => <ExecutionPackageCard key={pkg.id} pkg={pkg}/>)}</div></PermissionPage>;
}

function LegacyLabelingPage() {
  const [pkg, setPkg] = useState<WarehousePackage | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const claim = async (code: string) => { setBusy(true); setError(""); try { setPkg(await warehouseAdminApi.claimNext(code)); setMessage(""); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  const print = async () => { if (!pkg) return; setBusy(true); setError(""); try { await warehouseAdminApi.queuePrint(pkg.id, pkg.claim_token); setMessage(`${pkg.package_code} baskı kuyruğuna eklendi; fiziksel teslim henüz doğrulanmadı.`); } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); } };
  const preview = async () => { if (!pkg) return; setBusy(true); setError(""); try { const snapshot = await warehouseAdminApi.getPackagePrintPreview(pkg.id); openPdfBlob(await labelApi.preview("goods_receipt", snapshot.payload)); } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); } };
  return <PermissionPage permission="warehouse:print_labels"><div className="space-y-5"><PageIntro eyebrow="Etiketleme" title="Sıradaki paketi ayır" description="Tedarikçi kodu paketi kısa süreli ayırır. Label Printer'ın güncel şablonu CUPS kuyruğunda basılır."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>}<ScanInput busy={busy} onScan={claim} label="Tedarikçi kodunu okutun" placeholder="Tedarikçi kodu" cameraTitle="Tedarikçi kodunu okutun"/>{pkg && <><PackageCard pkg={pkg}/><div className="grid grid-cols-2 gap-2"><button className="secondary-button" disabled={busy} onClick={() => void preview()}><Eye/>Etiket Önizle</button><button className="primary-button" disabled={busy} onClick={() => void print()}><Printer/>Yazdır</button></div></>}</div></PermissionPage>;
}

export function LabelingPage() {
  const [pkg, setPkg] = useState<WarehouseExecutionPackage | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const scanPackage = async (code: string) => { setBusy(true); setError(""); try { setPkg(await warehouseExecutionApi.getPackage(code)); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  const identify = async (identity: string) => { if (!pkg) return false; setBusy(true); setError(""); try { const updated = await warehouseExecutionApi.identifyPackage(pkg.id, identity); setPkg(updated); setMessage(`${updated.code} kimliği kaydedildi; artık yerleştirilebilir.`); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  const preview = async () => { if (!pkg) return; setBusy(true); setError(""); try { const snapshot = await warehouseAdminApi.getPackagePrintPreview(pkg.id); openPdfBlob(await labelApi.preview("goods_receipt", snapshot.payload)); } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); } };
  const print = async () => { if (!pkg) return; setBusy(true); setError(""); try { const job = await warehouseAdminApi.queuePrint(pkg.id); setMessage(`${job.subject_code} işi QUEUED; operatör baskıyı ayrıca doğrulayana kadar basıldı sayılmaz.`); } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); } };
  return <PermissionPage permission="warehouse:print_labels"><div className="space-y-5"><PageIntro eyebrow="Etiketleme V2-14" title="Paket etiketini önizle ve yazdır" description="100×150 mm mal kabul etiketi SKU Code128 taşır. Kuyruğa alma fiziksel baskı onayı değildir."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>} {!pkg ? <ScanInput busy={busy} onScan={scanPackage} label="1. Paket kodunu okutun" placeholder="Paket kodu" cameraTitle="Paket kodunu okutun"/> : <><ExecutionPackageCard pkg={pkg}/><div className="grid grid-cols-2 gap-2"><button className="secondary-button" disabled={busy} onClick={() => void preview()}><Eye/>Önizle</button><button className="primary-button" disabled={busy} onClick={() => void print()}><Printer/>Yazdır</button></div><ScanInput busy={busy} onScan={identify} label="2. Etiket kimliğini okutun" placeholder="Etiket kimliği" cameraTitle="Etiket kimliğini okutun"/></>}</div></PermissionPage>;
}

function TwoStepPackagePage({ mode }: { mode: "place" | "move" }) {
  const permission = mode === "place" ? "warehouse:place_packages" : "warehouse:move_stock";
  const [pkg, setPkg] = useState<WarehouseExecutionPackage | null>(null); const [suggestion, setSuggestion] = useState<WarehouseExecutionLocation | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const scanPackage = async (code: string) => { setBusy(true); setError(""); try { const found = await warehouseExecutionApi.getPackage(code); setPkg(found); setSuggestion(await warehouseExecutionApi.suggestLocation(found.id)); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  const scanLocation = async (code: string) => { if (!pkg) return false; setBusy(true); setError(""); try { const result = mode === "place" ? await warehouseExecutionApi.placePackage(pkg.id, code) : await warehouseExecutionApi.movePackage(pkg.id, code); setMessage(`${result.package.code} → ${result.destination.code} · toplam stok değişmedi (${result.onHandBaseInt})`); setPkg(null); setSuggestion(null); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  return <PermissionPage permission={permission}><div className="space-y-5"><PageIntro eyebrow={mode === "place" ? "Yerleştirme" : "Ürün Taşıma"} title={mode === "place" ? "Paket → lokasyon" : "Paketi taşı"} description="Canlı Panel otoritesi öneriyi üretir; paket ve hedef taraması aynı idempotent komutta doğrulanır."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>} {!pkg ? <ScanInput busy={busy} onScan={scanPackage} label="1. Paket kodunu okutun" placeholder="PKG-…" cameraTitle="Paket kodunu okutun"/> : <><ExecutionPackageCard pkg={pkg}/>{suggestion && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-success">Önerilen lokasyon: {suggestion.code} · {suggestion.role} · {suggestion.depthCode}</p>}<ScanInput busy={busy} onScan={scanLocation} label="2. Hedef lokasyonu okutun" placeholder={suggestion?.code || "Lokasyon kodu"} cameraTitle="Hedef lokasyonu okutun"/></>}</div></PermissionPage>;
}

export const PlacementPage = () => <TwoStepPackagePage mode="place"/>;
export const MoveStockPage = () => <TwoStepPackagePage mode="move"/>;

export function ReplenishmentPage() {
  const [tasks, setTasks] = useState<WarehouseReplenishmentTask[]>([]);
  const [selected, setSelected] = useState<WarehouseReplenishmentTask | null>(null);
  const [scannedSource, setScannedSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const reload = async () => {
    try { setTasks(await warehouseExecutionApi.listReplenishmentTasks()); setError(""); }
    catch (reason) { setError(getErrorMessage(reason)); }
  };
  useEffect(() => { void reload(); }, []);
  const scanSource = async (code: string) => {
    if (!selected?.sourcePackageCode || code.trim().toUpperCase() !== selected.sourcePackageCode.toUpperCase()) {
      setError("Okutulan kaynak paket bu ikmal göreviyle eşleşmiyor.");
      return false;
    }
    setScannedSource(code.trim()); setError(""); return true;
  };
  const scanDestination = async (code: string) => {
    if (!selected || !scannedSource) return false;
    setBusy(true); setError("");
    try {
      await warehouseExecutionApi.completeReplenishment(selected.id, scannedSource, code.trim());
      setMessage(`${selected.sourcePackageCode} → ${code.trim().toUpperCase()} aynı lot ikmali tamamlandı.`);
      setSelected(null); setScannedSource(""); await reload(); return true;
    } catch (reason) { setError(getErrorMessage(reason)); return false; }
    finally { setBusy(false); }
  };
  return <PermissionPage permission="warehouse:move_stock"><div className="space-y-5">
    <PageIntro eyebrow="Replenishment V2-08" title="Bekleyen ikmal görevleri" description="Panel'in otomatik oluşturduğu görevde kaynak paketi ve boş FRONT hedefini sırayla okutun. Lot seçimi değiştirilemez."/>
    {message && <Notice message={message}/>} {error && <Notice error message={error}/>}<button className="secondary-button w-full" onClick={() => void reload()}><RefreshCw/>Yenile</button>
    {selected ? <div className="space-y-3 rounded-2xl border border-line bg-white p-4"><b>{selected.sku} · %{selected.currentPct}</b><p className="text-sm text-muted">Lot {selected.lotId} · kaynak {selected.sourcePackageCode}</p>
      {!scannedSource ? <ScanInput busy={busy} onScan={scanSource} label="1. Kaynak rezerv paketini okutun" placeholder={selected.sourcePackageCode || "Paket kodu"} cameraTitle="Kaynak paketi okutun"/>
        : <ScanInput busy={busy} onScan={scanDestination} label="2. Boş FRONT hedefini okutun" placeholder="A1-K1-P1-FRONT" cameraTitle="Hedef lokasyonu okutun"/>}
      <button className="secondary-button w-full" onClick={() => { setSelected(null); setScannedSource(""); }}>Vazgeç</button></div>
      : <div className="space-y-2">{tasks.map((task) => <div key={task.id} className="rounded-2xl border border-line bg-white p-4"><b>{task.sku}</b><span className="float-right text-xs font-black text-moss">{task.state}</span><p className="mt-1 text-sm text-muted">%{task.currentPct} · lot {task.lotId}</p>{task.state === "PREPARE_REPLENISHMENT" && task.sourcePackageCode
        ? <button className="primary-button mt-3 w-full" onClick={() => setSelected(task)}>Görevi başlat</button>
        : <p className="mt-3 text-xs font-bold text-danger">{task.state === "CRITICAL_NO_RESERVE" ? "Kritik: aynı lot rezervi yok." : task.state === "STOCK_DISCREPANCY" ? "Sayım / discrepancy çözümü bekleniyor." : "İzleme eşiğinde."}</p>}</div>)}{tasks.length === 0 && <p className="state-card text-center text-sm font-bold">Bekleyen ikmal görevi yok.</p>}</div>}
  </div></PermissionPage>;
}

export function LocationsPage() {
  const [locations, setLocations] = useState<WarehouseLocation[]>([]); const [code, setCode] = useState(""); const [capacity, setCapacity] = useState("1"); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busyId, setBusyId] = useState("");
  const reload = () => warehouseAdminApi.listLocations().then(setLocations).catch((reason) => setError(getErrorMessage(reason)));
  useEffect(() => { void reload(); }, []);
  const create = async (event: FormEvent) => { event.preventDefault(); setError(""); try { await warehouseAdminApi.createLocation({ code, package_capacity: Number(capacity) }); setCode(""); setCapacity("1"); reload(); } catch (reason) { setError(getErrorMessage(reason)); } };
  const preview = async (location: WarehouseLocation) => { setBusyId(location.id); setError(""); try { const snapshot = await warehouseAdminApi.getLocationPrintPreview(location.id); openPdfBlob(await labelApi.preview("location", snapshot.payload)); } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusyId(""); } };
  const print = async (location: WarehouseLocation) => { setBusyId(location.id); setError(""); try { await warehouseAdminApi.queueLocationPrint(location.id); setMessage(`${location.code} etiketi baskı kuyruğuna eklendi.`); } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusyId(""); } };
  return <PermissionPage permission="warehouse:manage_locations"><div className="space-y-5"><PageIntro eyebrow="Lokasyonlar" title="Kapasite yönetimi" description="Yerleştirme önerisi en düşük doluluk ve kod sırasına göre deterministik olarak seçilir."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>}<form onSubmit={create} className="grid grid-cols-[1fr_90px] gap-3 rounded-2xl border border-line bg-white p-4"><input className="field uppercase" value={code} onChange={(event) => setCode(event.target.value)} placeholder="A1-K1-P1" required/><input className="field" type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)}/><button className="primary-button col-span-2">Lokasyon ekle</button></form><div className="space-y-2">{locations.map((location) => <div className="rounded-2xl border border-line bg-white p-4" key={location.id}><b>{location.code}</b><span className="float-right font-black text-moss">{location.occupied_packages}/{location.package_capacity}</span><div className="mt-3 h-2 overflow-hidden rounded bg-line"><span className="block h-full bg-moss" style={{ width: `${Math.min(100, location.occupied_packages / location.package_capacity * 100)}%` }}/></div><div className="mt-3 grid grid-cols-2 gap-2"><button className="secondary-button" disabled={busyId === location.id} onClick={() => void preview(location)}><Eye size={17}/>Önizle</button><button className="secondary-button" disabled={busyId === location.id} onClick={() => void print(location)}><Printer size={17}/>Etiket Yazdır</button></div></div>)}</div></div></PermissionPage>;
}

export function StockCountPage() {
  const [pkg, setPkg] = useState<WarehouseExecutionPackage | null>(null); const [quantity, setQuantity] = useState(""); const [reason, setReason] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const scan = async (code: string) => { setBusy(true); setError(""); try { const found = await warehouseExecutionApi.getPackage(code); setPkg(found); setQuantity(String(found.remainingQuantityBaseInt)); return true; } catch (scanError) { setError(getErrorMessage(scanError)); return false; } finally { setBusy(false); } };
  const submit = async () => { if (!pkg) return; setBusy(true); try { const result = await warehouseExecutionApi.recordCount(pkg.id, Number(quantity), reason.trim() || "OPERATOR_COUNT"); setMessage(result.status === "MATCHED" ? `${pkg.code}: sayım eşleşti.` : `${pkg.code}: ${result.differenceBaseInt} fark için onaylı düzeltme bekleniyor.`); setPkg(null); setReason(""); } catch (submitError) { setError(getErrorMessage(submitError)); } finally { setBusy(false); } };
  return <PermissionPage permission="warehouse:count_stock"><div className="space-y-5"><PageIntro eyebrow="Stok Sayımı" title="Paket bakiyesini say" description="Sayım farkı stok üzerine yazılmaz; ayrı yetkili onaya kadar discrepancy/count akışında bekler."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>} {!pkg ? <ScanInput busy={busy} onScan={scan} label="Paket kodunu okutun" placeholder="PKG-…" cameraTitle="Sayılacak paketi okutun"/> : <><ExecutionPackageCard pkg={pkg}/><input className="field text-xl font-black" type="number" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)}/><input className="field" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Sayım nedeni / not"/><button className="primary-button w-full" disabled={busy} onClick={() => void submit()}>Sayımı kaydet</button></>}</div></PermissionPage>;
}

export function PrintJobsPage() {
  const [jobs, setJobs] = useState<PrintJob[]>([]); const [error, setError] = useState(""); const [selected, setSelected] = useState<PrintJob | null>(null);
  const [reason, setReason] = useState<ReprintReason | "">(""); const [explanation, setExplanation] = useState("");
  const reload = () => warehouseAdminApi.listPrintJobs().then(setJobs).catch((reason) => setError(getErrorMessage(reason)));
  useEffect(() => { void reload(); }, []);
  const reprint = async () => { if (!selected || !reason || (reason === "OTHER" && !explanation.trim())) return; try { await warehouseAdminApi.reprint(selected.id, reason, explanation.trim() || undefined); setSelected(null); setReason(""); setExplanation(""); await reload(); } catch (failure) { setError(getErrorMessage(failure)); } };
  const confirm = async (job: PrintJob) => { try { await warehouseAdminApi.confirmPrinted(job.id); await reload(); } catch (failure) { setError(getErrorMessage(failure)); } };
  const labels: Record<PrintJob["status"], string> = { QUEUED: "Kuyrukta", RENDERED: "Hazırlandı", SUBMITTED: "Yazıcıya gönderildi", ACKNOWLEDGED: "Yazıcı kabul etti", PRINTED_CONFIRMED: "Fiziksel baskı doğrulandı", DELIVERY_UNKNOWN: "Teslim belirsiz", FAILED: "Hata", CANCELLED: "İptal" };
  return <PermissionPage permission="warehouse:print_labels"><div className="space-y-5"><PageIntro eyebrow="Baskı Geçmişi V2-14" title="Etiket işleri" description="Renderer ve yazıcı kabulü fiziksel baskı değildir. Geçmiş, denemeler ve yeniden baskı nedenleri değiştirilemez."/><button className="secondary-button w-full" onClick={reload}><RefreshCw/>Yenile</button>{error && <Notice error message={error}/>}<div className="space-y-2">{jobs.map((job) => <div key={job.id} className="rounded-2xl border border-line bg-white p-4"><b>{job.subject_code}</b><span className={`float-right text-xs font-black ${job.status === "FAILED" ? "text-danger" : "text-moss"}`}>{labels[job.status]}</span><p className="mt-1 text-xs text-muted">{job.purpose} · Xprinter XP-470B · 203 dpi · {job.attempts.length} deneme</p>{Boolean(job.error_message) && <p className="mt-2 text-xs text-danger">{String(job.error_message)}</p>}<details className="mt-3 text-xs"><summary className="cursor-pointer font-bold">Durum geçmişi ({job.history.length})</summary><ol className="mt-2 space-y-1">{job.history.map((event, index) => <li key={String(event.id || index)}>{String(event.from_status || "—")} → {String(event.to_status)} · {String(event.created_at || "")}</li>)}</ol></details><div className="mt-3 grid grid-cols-2 gap-2">{["ACKNOWLEDGED", "DELIVERY_UNKNOWN"].includes(job.status) && <button className="primary-button" onClick={() => void confirm(job)}>Baskıyı doğrula</button>}<button className="secondary-button" onClick={() => { setSelected(job); setReason(""); setExplanation(""); }}><Printer size={17}/>Yeniden yazdır</button></div></div>)}</div>{selected && <div className="fixed inset-0 z-[80] flex items-end bg-black/50 sm:items-center sm:justify-center"><div className="w-full space-y-3 rounded-t-3xl bg-white p-5 sm:max-w-md sm:rounded-3xl"><h2 className="text-lg font-black">{selected.subject_code} yeniden baskı nedeni</h2><select className="field" value={reason} onChange={(event) => setReason(event.target.value as ReprintReason | "")}><option value="">Neden seçin</option><option value="DAMAGED_OUTPUT">Hasarlı çıktı</option><option value="LOST">Kayıp</option><option value="PRINTER_ERROR">Yazıcı hatası</option><option value="OTHER">Diğer</option></select>{reason === "OTHER" && <textarea className="field" value={explanation} onChange={(event) => setExplanation(event.target.value)} placeholder="Açıklama zorunludur"/>}<div className="grid grid-cols-2 gap-2"><button className="secondary-button" onClick={() => setSelected(null)}>Vazgeç</button><button className="primary-button" disabled={!reason || (reason === "OTHER" && !explanation.trim())} onClick={() => void reprint()}>Yeniden yazdır</button></div></div></div>}</div></PermissionPage>;
}

export function LabelTemplatesPage() {
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]); const [selected, setSelected] = useState<Record<string, unknown> | null>(null); const [error, setError] = useState("");
  const reload = async () => { try { const data = await labelApi.listTemplates(); setTemplates(data); if (!selected && data[0]) setSelected(data[0]); } catch (reason) { setError(getErrorMessage(reason)); } };
  useEffect(() => { void reload(); }, []);
  return <PermissionPage permission="warehouse:edit_label_templates"><div className="space-y-5"><PageIntro eyebrow="Etiket Şablonları" title="Label Printer canlı şablonları" description="Warehouse yalnız sürüm metadatasını gösterir; içerik ve yeni sürümler Label Printer'da yönetilir. JSON düzenleme yoktur."/>{error && <Notice error message={error}/>}<button className="secondary-button" onClick={() => void reload()}><RefreshCw size={17}/>Yenile</button><div className="flex gap-2 overflow-x-auto">{templates.map((template) => <button key={String(template.id)} className="filter-chip" onClick={() => setSelected(template)}>{String(template.name)} · {String(template.purpose)}</button>)}</div>{selected && <section className="rounded-2xl border border-line bg-white p-5"><h2 className="text-lg font-black">{String(selected.name)}</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted">Amaç</dt><dd className="font-bold">{String(selected.purpose)}</dd></div><div><dt className="text-muted">Boyut</dt><dd className="font-bold">{String(selected.width)}×{String(selected.height)} mm</dd></div><div><dt className="text-muted">Sürüm</dt><dd className="font-bold">v{String(selected.version)}</dd></div><div><dt className="text-muted">İçerik hash</dt><dd className="break-all font-mono text-xs">{String(selected.contentHash)}</dd></div></dl></section>}</div></PermissionPage>;
}

export { permissionLabels };
