import {
  Check, CheckCircle2, ChevronLeft, Expand, ImageOff, PackageCheck, TriangleAlert, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { ScanInput } from "../features/picking/ScanInput";
import { getErrorMessage, warehouseApi } from "../lib/api";
import type { PickItem, PickPlan } from "../types/warehouse";

export function PickingPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PickPlan | null>(null);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [verifiedProductId, setVerifiedProductId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = async () => {
    setLoadError("");
    try {
      const data = await warehouseApi.getPickPlan(id);
      setPlan(data);
      const firstIncomplete = data.items.find((item) => !item.completed_at || item.picked_quantity !== item.required_quantity);
      const alreadyVerified = Boolean(firstIncomplete?.verified_code_type);
      setVerifiedProductId(alreadyVerified ? firstIncomplete?.product_id || null : null);
      setQuantity(alreadyVerified && firstIncomplete ? String(firstIncomplete.required_quantity) : "");
    } catch (reason) {
      setLoadError(getErrorMessage(reason));
    }
  };
  useEffect(() => { void load(); }, [id]);

  const completedCount = useMemo(
    () => plan?.items.filter((item) => Boolean(item.completed_at) && item.picked_quantity === item.required_quantity).length || 0,
    [plan],
  );
  const currentItem = plan?.items.find((item) => !item.completed_at || item.picked_quantity !== item.required_quantity);
  const allComplete = Boolean(plan?.items.length && completedCount === plan.items.length);
  const currentIndex = currentItem ? plan?.items.indexOf(currentItem) || 0 : plan?.items.length || 0;
  const isVerified = currentItem?.product_id === verifiedProductId || Boolean(currentItem?.verified_code_type);
  const primaryAllocation = currentItem?.package_allocations?.[0];
  const requiredTotal = plan?.items.reduce((total, item) => total + item.required_quantity, 0) || 0;
  const pickedTotal = plan?.items.reduce((total, item) => total + item.picked_quantity, 0) || 0;

  useEffect(() => setPreviewOpen(false), [currentItem?.product_id]);

  const scan = async (code: string) => {
    if (!currentItem) return false;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await warehouseApi.verifyPick(id, currentItem.product_id, code);
      setVerifiedProductId(currentItem.product_id);
      setQuantity(String(currentItem.required_quantity));
      setFeedback({ type: "success", text: `Ürün / lokasyon doğrulandı · ${result.match_type === "location" ? "Lokasyon" : result.match_type === "barcode" ? "Barkod" : "SKU"}` });
      return true;
    } catch (reason) {
      setFeedback({ type: "error", text: getErrorMessage(reason) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirmQuantity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentItem || !isVerified) return;
    const picked = Number(quantity);
    if (!Number.isFinite(picked) || picked !== currentItem.required_quantity) {
      setFeedback({
        type: "error",
        text: picked < currentItem.required_quantity
          ? `Eksik adet. Tam olarak ${currentItem.required_quantity} adet toplamalısın.`
          : `Fazla adet. Tam olarak ${currentItem.required_quantity} adet toplamalısın.`,
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      await warehouseApi.completePickItem(id, currentItem.product_id, picked);
      setQuantity("");
      setVerifiedProductId(null);
      setFeedback({ type: "success", text: "Ürün kaydedildi" });
      await load();
    } catch (reason) {
      setFeedback({ type: "error", text: getErrorMessage(reason) });
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (!allComplete) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (note.trim()) await warehouseApi.completeOrder(id, note);
      else await warehouseApi.completeOrder(id);
      const { orders } = await warehouseApi.listOrders(1, 1);
      if (orders[0]) {
        navigate(`/orders/${orders[0].id}`, { replace: true });
      } else {
        navigate(`/orders/${id}/success`, {
          replace: true,
          state: { orderCode: plan?.order.order_code, allWaitingComplete: true },
        });
      }
    } catch (reason) {
      setFeedback({ type: "error", text: getErrorMessage(reason) });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <div className="pt-6"><ErrorState message={loadError} retry={() => void load()} /></div>;
  if (!plan) return <div className="pt-6"><LoadingState label="Toplama planı yükleniyor" /></div>;

  if (!currentItem) return (
    <div className="pick-complete-page">
      <FlowHeader backTo={`/orders/${id}`} backLabel="Sipariş" orderCode={plan.order.order_code} count={`${plan.items.length}/${plan.items.length}`}/>
      <section className="pick-complete-card">
        <span><PackageCheck size={32}/></span>
        <p>{plan.order.order_code}</p>
        <h1>Ürünler hazır</h1>
        <small>{completedCount} ürünün tamamı sunucuya kaydedildi.</small>
      </section>
      {feedback && <Feedback {...feedback} />}
      <label className="pick-note" htmlFor="pick-note">
        Operasyon notu <span>(isteğe bağlı)</span>
        <textarea id="pick-note" className="field" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Paketleme ekibi için not..." disabled={busy}/>
      </label>
      <button className="primary-button w-full" onClick={complete} disabled={!allComplete || busy}><CheckCircle2 size={20}/>{busy ? "Tamamlanıyor..." : "Siparişi Tamamla"}</button>
    </div>
  );

  const location = primaryAllocation?.location_code || currentItem.warehouse_location;
  const availableStock = currentItem.available_stock ?? currentItem.central_stock;

  return (
    <div className="picking-work-page">
      <FlowHeader backTo={`/orders/${id}`} backLabel="Sipariş" orderCode={plan.order.order_code} count={`${currentIndex + 1}/${plan.items.length}`}/>
      <div className="pick-compact-progress" aria-label={`${currentIndex + 1}. ürün, ${pickedTotal}/${requiredTotal} adet toplandı`}>
        <span style={{ width: `${plan.items.length ? (completedCount / plan.items.length) * 100 : 0}%` }}/>
        <small>Ürün {currentIndex + 1} / {plan.items.length} · {pickedTotal} / {requiredTotal}</small>
      </div>

      <section className="pick-product-card">
        <button className="pick-product-image" type="button" aria-label="Ürün görselini büyüt" onClick={() => setPreviewOpen(true)}>
          {currentItem.image_url
            ? <img src={currentItem.image_url} alt="" />
            : <ImageOff size={30} aria-hidden="true"/>}
          <span><Expand size={15}/></span>
        </button>
        <div className="pick-product-main">
          <h1>{currentItem.name || "Ürün adı yok"}</h1>
          <p>{currentItem.sku}</p>
          <div className="pick-product-metrics">
            <div><small>Gerekli</small><strong>{currentItem.required_quantity} adet</strong></div>
            <div><small>Stok</small><strong className={availableStock < currentItem.required_quantity ? "text-danger" : ""}>{availableStock}</strong></div>
          </div>
        </div>
        <div className="pick-location-block">
          <small>Lokasyon</small>
          <strong>{location || "Lokasyon yok"}</strong>
          <p>{location ? "Doğrulanacak raf / kutu konumu." : "Doğru raf kutulunca burada gösterilir."}</p>
        </div>
        {currentItem.package_tracking && currentItem.package_allocations?.length ? <div className="pick-package-list">
          {currentItem.package_allocations.map((allocation) => <span key={allocation.package_id}><strong>{allocation.package_code}</strong><small>{allocation.pick_quantity} adet</small></span>)}
        </div> : null}
      </section>

      <section className="pick-scan-card">
        <ScanInput
          onScan={scan}
          busy={busy}
          variant="picking"
          listenForScanRequest
          label={currentItem.package_tracking ? "Paket / Lokasyon / Barkod / SKU okutun" : "Lokasyon / Barkod / SKU okutun"}
          placeholder={primaryAllocation?.package_code || "Lokasyon, barkod veya SKU"}
          cameraTitle={currentItem.package_tracking ? "Paket veya lokasyonu okutun" : "Lokasyon veya SKU okutun"}
        />
        {isVerified && <div className="pick-verified" role="status"><Check size={15}/> Ürün / lokasyon doğrulandı</div>}
      </section>

      {isVerified && <form onSubmit={confirmQuantity} className="pick-quantity-card">
        <div className="pick-quantity-heading"><label htmlFor="pick-quantity">Toplanacak adet</label><small>Klavye ile sayıyı yazın</small></div>
        <div className="pick-quantity-row">
          <div className="pick-quantity-input-wrap"><input id="pick-quantity" aria-label={`Toplanan adet · tam olarak ${currentItem.required_quantity}`} type="number" inputMode="decimal" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={busy}/><span>adet</span></div>
          <div className="pick-quantity-summary"><span><small>Gerekli</small><strong>{currentItem.required_quantity} adet</strong></span><small>Stok {availableStock}</small></div>
        </div>
        <button className="primary-button w-full" type="submit" disabled={busy}><PackageCheck size={20}/>{busy ? "Kaydediliyor..." : "Adedi Onayla"}</button>
      </form>}

      {feedback?.type === "error" && <Feedback {...feedback} />}
      <aside className="pick-last-step"><strong>Son adım</strong><span>{isVerified ? "Miktarı yazın ve onaylayın." : "Ürün, barkod, SKU veya lokasyonu doğrulayın."}</span></aside>

      {previewOpen && <ProductPreview item={currentItem} onClose={() => setPreviewOpen(false)}/>}
    </div>
  );
}

function FlowHeader({ backTo, backLabel, orderCode, count }: { backTo: string; backLabel: string; orderCode: string; count: string }) {
  return <header className="pick-flow-header"><Link to={backTo}><ChevronLeft size={16}/>{backLabel}</Link><strong>{orderCode}</strong><span>{count}</span></header>;
}

function ProductPreview({ item, onClose }: { item: PickItem; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <div className="product-preview-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="product-preview" role="dialog" aria-modal="true" aria-label="Ürün görseli">
      <div className="product-preview-heading"><div><h2>{item.name || "Ürün adı yok"}</h2><p>{item.sku}</p></div><button ref={closeRef} type="button" aria-label="Görsel önizlemeyi kapat" onClick={onClose}><X size={19}/></button></div>
      <button className="product-preview-image" type="button" aria-label="Görsele dokunarak kapat" onClick={onClose}>
        {item.image_url ? <img src={item.image_url} alt={item.name || item.sku}/> : <span><ImageOff size={52}/><small>Ürün görseli yok</small></span>}
        <i><Expand size={15}/></i>
      </button>
      <div className="product-preview-note"><strong>Ürün görseli</strong><span>API / ürün kartından gelir. Görsel alanı dokunulabilir.</span></div>
    </section>
  </div>;
}

function Feedback({ type, text }: { type: "success" | "error"; text: string }) {
  return <div className={`pick-feedback ${type}`} role={type === "error" ? "alert" : "status"}>{type === "error" ? <TriangleAlert size={18}/> : <CheckCircle2 size={18}/>} {text}</div>;
}
