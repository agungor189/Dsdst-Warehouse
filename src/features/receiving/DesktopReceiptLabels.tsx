import { CheckCircle2, Printer, RefreshCw, RotateCcw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getErrorMessage, warehouseAdminApi, type ReprintReason } from "../../lib/api";
import type { ReceiptLabelOverview, ReceiptLabelSku } from "../../types/warehouse";
import { groupReceiptLabelSkus } from "./receiptLabels";

const activeStatuses = new Set(["QUEUED", "RENDERED", "SUBMITTED", "ACKNOWLEDGED", "DELIVERY_UNKNOWN"]);
const statusLabels: Record<string, string> = {
  QUEUED: "Kuyrukta", RENDERED: "Hazırlandı", SUBMITTED: "Yazıcıya gönderildi", ACKNOWLEDGED: "Yazıcı kabul etti",
  DELIVERY_UNKNOWN: "Sonuç belirsiz", FAILED: "Başarısız", CANCELLED: "İptal", PRINTED_CONFIRMED: "Fiziksel onaylı",
};

function useDesktopViewport() {
  const [desktop, setDesktop] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return desktop;
}

export function DesktopReceiptLabelsGate(props: { purchaseOrderId: string | null; supplierLotCode: string; onSupplierLotCodeChange?: (value: string) => void }) {
  return useDesktopViewport() && props.purchaseOrderId ? <DesktopReceiptLabels purchaseOrderId={props.purchaseOrderId} supplierLotCode={props.supplierLotCode} onSupplierLotCodeChange={props.onSupplierLotCodeChange}/> : null;
}

export function DesktopReceiptLabels({ purchaseOrderId, supplierLotCode, onSupplierLotCodeChange }: { purchaseOrderId: string; supplierLotCode: string; onSupplierLotCodeChange?: (value: string) => void }) {
  const [overview, setOverview] = useState<ReceiptLabelOverview | null>(null);
  const [query, setQuery] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reprintSku, setReprintSku] = useState<ReceiptLabelSku | null>(null);
  const [reprintJobId, setReprintJobId] = useState("");
  const [reason, setReason] = useState<ReprintReason | "">("");
  const [explanation, setExplanation] = useState("");
  const [selectedConfirmationIds, setSelectedConfirmationIds] = useState<Set<string>>(() => new Set());

  const reload = useCallback(async (quiet = false) => {
    try {
      const next = await warehouseAdminApi.getReceiptLabelOverview(purchaseOrderId);
      const available = new Set(next.skus.flatMap((sku) => sku.packages.filter((item) => item.confirmationAvailable && item.currentJobId).map((item) => item.currentJobId!)));
      setSelectedConfirmationIds((current) => new Set([...current].filter((id) => available.has(id))));
      setOverview(next);
      if (!quiet) setError("");
    } catch (failure) {
      if (!quiet) setError(getErrorMessage(failure));
    }
  }, [purchaseOrderId]);

  useEffect(() => {
    setOverview(null); setMessage(""); setError(""); setReprintSku(null); setSelectedConfirmationIds(new Set());
    void reload();
    const timer = window.setInterval(() => void reload(true), 5_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const groups = useMemo(() => groupReceiptLabelSkus(overview?.skus || [], query), [overview, query]);
  const lotReady = supplierLotCode.trim().length > 0;

  const print = async (sku: ReceiptLabelSku, mode: "NEXT" | "ALL") => {
    const key = `${sku.productId}:${mode}`;
    setBusyKey(key); setError(""); setMessage("");
    try {
      const result = await warehouseAdminApi.queueReceiptSkuPrint(purchaseOrderId, sku.productId, mode, supplierLotCode.trim());
      const queued = result.jobs.length;
      const replacementBlocked = result.jobs.filter((job) => job.replacement_blocked).length;
      const blocked = result.blockedPackageNumbers.length ? ` ${result.blockedPackageNumbers.join(", ")} numaralı paketlerde devam eden, belirsiz veya engellenmiş iş var.` : "";
      setMessage(queued
        ? `${sku.sku}: ${queued} etiket kuyruğa alındı.${replacementBlocked ? ` ${replacementBlocked} iş eski etiket onayı verilene kadar yazıcıya gönderilmeyecek.` : " Yazıcı işi tamamlandıktan sonra fiziksel baskıyı ayrıca doğrulayın."}${blocked}`
        : `${sku.sku}: yeni etiket kuyruğa alınmadı${result.blockedPackageNumbers.length ? `; ${result.blockedPackageNumbers.join(", ")} numaralı paketlerde devam eden veya belirsiz iş var.` : "."}`);
      await reload(true);
    } catch (failure) { setError(getErrorMessage(failure)); }
    finally { setBusyKey(""); }
  };

  const confirm = async (sku: ReceiptLabelSku) => {
    const jobs = sku.packages.filter((item) => item.confirmationAvailable && item.currentJobId && selectedConfirmationIds.has(item.currentJobId)).map((item) => item.currentJobId!);
    if (!jobs.length) return;
    setBusyKey(`${sku.productId}:confirm`); setError(""); setMessage("");
    try {
      for (const jobId of jobs) await warehouseAdminApi.confirmPrinted(jobId);
      setMessage(`${sku.sku}: ${jobs.length} fiziksel baskı doğrulandı.`);
      setSelectedConfirmationIds((current) => new Set([...current].filter((id) => !jobs.includes(id))));
      await reload(true);
    } catch (failure) { setError(getErrorMessage(failure)); await reload(true); }
    finally { setBusyKey(""); }
  };

  const acknowledgeReplacement = async (sku: ReceiptLabelSku, jobId: string) => {
    setBusyKey(`${sku.productId}:replacement`); setError(""); setMessage("");
    try {
      await warehouseAdminApi.acknowledgeReplacement(jobId);
      setMessage(`${sku.sku}: eski etiketin kaldırıldığı/değiştirildiği onaylandı; iş artık yazıcı tarafından alınabilir.`);
      await reload(true);
    } catch (failure) { setError(getErrorMessage(failure)); await reload(true); }
    finally { setBusyKey(""); }
  };

  const toggleConfirmation = (jobId: string) => setSelectedConfirmationIds((current) => {
    const next = new Set(current);
    if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
    return next;
  });

  const openReprint = (sku: ReceiptLabelSku) => {
    const first = sku.packages.find((item) => item.canReprint && item.currentJobId);
    setReprintSku(sku); setReprintJobId(first?.currentJobId || ""); setReason(""); setExplanation("");
  };

  const reprint = async () => {
    if (!reprintSku || !reprintJobId || !reason || (reason === "OTHER" && !explanation.trim())) return;
    setBusyKey(`${reprintSku.productId}:reprint`); setError(""); setMessage("");
    try {
      await warehouseAdminApi.reprint(reprintJobId, reason, explanation.trim() || undefined);
      setMessage(`${reprintSku.sku}: seçilen paket yeniden baskı kuyruğuna alındı; normal baskı sayacı değişmedi.`);
      setReprintSku(null);
      await reload(true);
    } catch (failure) { setError(getErrorMessage(failure)); }
    finally { setBusyKey(""); }
  };

  return <section aria-label="Mal kabul etiket yönetimi" className="space-y-3 rounded-2xl border border-line bg-canvas/60 p-4">
    <div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Masaüstü etiket yönetimi</p><h2 className="text-lg font-black">Mal kabul SKU etiketleri</h2><p className="mt-1 text-xs text-muted">Baskı, mal kabul veya stok hareketi oluşturmaz. Sayaç yalnız fiziksel onaydan sonra ilerler.</p></div><button type="button" className="secondary-button shrink-0" onClick={() => void reload()} aria-label="Etiket listesini yenile"><RefreshCw size={16}/></button></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-danger">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-success">{message}</p>}
    {!lotReady && <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Liste hazır. Yazdırmak için tedarikçi lotunu girin.</p>}
    <div className="grid gap-2 lg:grid-cols-2"><label className="text-xs font-bold">Tedarikçi lotu<input aria-label="Masaüstü tedarikçi lotu" className="field mt-1 uppercase" value={supplierLotCode} onChange={(event) => onSupplierLotCodeChange?.(event.target.value)} placeholder="Tedarikçi lotu" required/></label><label className="relative mt-auto block"><Search className="pointer-events-none absolute left-3 top-3.5 text-muted" size={18}/><input aria-label="SKU ara" className="field pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SKU ara"/></label></div>
    {!overview && !error && <p className="text-sm text-muted">Etiket listesi yükleniyor…</p>}
    {overview && groups.length === 0 && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Eşleşen yazdırılabilir SKU yok.</p>}
    {groups.map((material) => <div className="space-y-2" key={material.material}><h3 className="text-sm font-black text-forest">{material.material}</h3>{material.profileTypes.map((profile) => <div className="space-y-2 border-l-2 border-moss/20 pl-3" key={profile.profileType}><p className="text-xs font-black uppercase tracking-wide text-muted">{profile.profileType}</p>{profile.sizes.map((size) => <div className="space-y-2" key={size.size}><p className="text-xs font-bold">Ölçü · {size.size}</p>{size.skus.map((sku) => {
      const confirmationPackages = sku.packages.filter((item) => item.confirmationAvailable && item.currentJobId);
      const selectedConfirmationCount = confirmationPackages.filter((item) => selectedConfirmationIds.has(item.currentJobId!)).length;
      const hasReprint = sku.packages.some((item) => item.canReprint && item.currentJobId);
      const next = sku.packages.find((item) => item.packageNumber === sku.nextPackageNumber);
      const nextBlocked = !!next && (next.revisionAmbiguous || (!!next.currentJobStatus && activeStatuses.has(next.currentJobStatus)));
      const normalRemaining = sku.totalPackageCount - sku.printedCount;
      return <article className="rounded-xl border border-line bg-white p-3" key={sku.productId}><div className="flex flex-wrap items-center justify-between gap-3"><div><strong className="text-sm">{sku.sku}</strong><p className="text-xs text-muted">{sku.productTitle}</p></div><div className="flex gap-4 text-right text-xs"><p><span className="block text-muted">Paket</span><b>{sku.totalPackageCount}</b></p><p><span className="block text-muted">Basılmış</span><b>{sku.printedCount}/{sku.totalPackageCount}</b></p><p><span className="block text-muted">Sıradaki</span><b>{sku.nextPackageNumber == null ? "Tamamlandı" : `${sku.nextPackageNumber}/${sku.totalPackageCount}`}</b></p></div></div><div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="secondary-button" disabled={!lotReady || normalRemaining === 0 || nextBlocked || !!busyKey} onClick={() => void print(sku, "NEXT")}><Printer size={16}/> Tek Baskı</button>
        <button type="button" className="secondary-button" disabled={!lotReady || normalRemaining === 0 || !!busyKey} onClick={() => void print(sku, "ALL")}><Printer size={16}/> Toplu Baskı</button>
        <button type="button" className="secondary-button" disabled={!hasReprint || !!busyKey} onClick={() => openReprint(sku)}><RotateCcw size={16}/> Yeniden Baskı</button>
        {confirmationPackages.length > 0 && <button type="button" className="secondary-button" disabled={!!busyKey || selectedConfirmationCount === 0} onClick={() => void confirm(sku)}><CheckCircle2 size={16}/> Seçilenleri doğrula ({selectedConfirmationCount})</button>}
      </div><div className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">{sku.packages.map((pkg) => <div key={pkg.id} className={`rounded-lg border p-2 text-xs ${pkg.revisionAmbiguous || pkg.replacementBlocked || pkg.currentJobStatus === "DELIVERY_UNKNOWN" || pkg.currentJobStatus === "FAILED" ? "border-amber-300 bg-amber-50" : "border-line bg-canvas/50"}`}><div className="flex items-center justify-between gap-2"><b>{pkg.packageNumber}/{pkg.totalPackages}</b>{pkg.confirmationAvailable && pkg.currentJobId && <input type="checkbox" aria-label={`${pkg.packageNumber}/${pkg.totalPackages} etiketini doğrula`} checked={selectedConfirmationIds.has(pkg.currentJobId)} onChange={() => toggleConfirmation(pkg.currentJobId!)}/>}</div><p className="mt-1 text-muted">{pkg.code}</p><p className="mt-1 font-bold">{pkg.revisionAmbiguous ? "Sürüm belirsiz" : pkg.currentJobStatus ? statusLabels[pkg.currentJobStatus] || pkg.currentJobStatus : "Basılmadı"}</p>{pkg.currentJobStatus === "DELIVERY_UNKNOWN" && <p className="mt-1 text-amber-800">Yalnız fiziksel etiketi gördüyseniz seçin.</p>}{pkg.currentJobStatus === "FAILED" && <p className="mt-1 text-amber-800">Basılmış sayılmadı{pkg.errorMessage ? `: ${pkg.errorMessage}` : "."}</p>}{pkg.revisionAmbiguous && <p className="mt-1 text-amber-800">İşlem engellendi; baskı geçmişinden sürümü çözün.</p>}{pkg.replacementBlocked && pkg.currentJobId && <div className="mt-2"><p className="font-bold text-amber-800">Eski etiketin kaldırıldığı veya değiştirildiği onaylanmalı.</p><button type="button" className="secondary-button mt-2" disabled={!!busyKey} onClick={() => void acknowledgeReplacement(sku, pkg.currentJobId!)}>Eski etiketi kaldırdım/değiştirdim</button></div>}</div>)}</div>{nextBlocked && !next?.replacementBlocked && <p className="mt-2 text-xs font-bold text-amber-700">Sıradaki pakette devam eden veya sonucu belirsiz bir baskı var; yinelenen baskıyı önlemek için bekleniyor.</p>}</article>;
    })}</div>)}</div>)}</div>)}
    {reprintSku && <div role="dialog" aria-modal="true" aria-labelledby="receipt-reprint-title" className="rounded-xl border border-moss bg-white p-4"><h3 id="receipt-reprint-title" className="font-black">{reprintSku.sku} yeniden baskı</h3><div className="mt-3 grid gap-2 lg:grid-cols-3"><label className="text-xs font-bold">Paket etiketi<select className="field mt-1" value={reprintJobId} onChange={(event) => setReprintJobId(event.target.value)}>{reprintSku.packages.filter((item) => item.canReprint && item.currentJobId).map((item) => <option key={item.id} value={item.currentJobId!}>{item.packageNumber}/{item.totalPackages} · {item.code}</option>)}</select></label><label className="text-xs font-bold">Neden<select className="field mt-1" value={reason} onChange={(event) => setReason(event.target.value as ReprintReason | "")}><option value="">Neden seçin</option><option value="DAMAGED_OUTPUT">Hasarlı çıktı</option><option value="LOST">Kayıp</option><option value="PRINTER_ERROR">Yazıcı hatası</option><option value="OTHER">Diğer</option></select></label>{reason === "OTHER" && <label className="text-xs font-bold">Açıklama<input className="field mt-1" value={explanation} onChange={(event) => setExplanation(event.target.value)}/></label>}</div><div className="mt-3 flex gap-2"><button type="button" className="primary-button" disabled={!reprintJobId || !reason || (reason === "OTHER" && !explanation.trim()) || !!busyKey} onClick={() => void reprint()}>Yeniden Yazdır</button><button type="button" className="secondary-button" onClick={() => setReprintSku(null)}>Vazgeç</button></div></div>}
  </section>;
}
