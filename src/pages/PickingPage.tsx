import { Check, CheckCircle2, ImageOff, MapPin, PackageCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { PickProgress } from "../features/picking/PickProgress";
import { ScanInput } from "../features/picking/ScanInput";
import { getErrorMessage, warehouseApi } from "../lib/api";
import type { PickPlan } from "../types/warehouse";

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

  const load = async () => {
    setLoadError("");
    try {
      const data = await warehouseApi.getPickPlan(id);
      setPlan(data);
      const firstIncomplete = data.items.find((item) => !item.completed_at || item.picked_quantity !== item.required_quantity);
      setVerifiedProductId(firstIncomplete?.verified_code_type ? firstIncomplete.product_id : null);
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

  const scan = async (code: string) => {
    if (!currentItem) return false;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await warehouseApi.verifyPick(id, currentItem.product_id, code);
      setVerifiedProductId(currentItem.product_id);
      setFeedback({ type: "success", text: `Doğrulandı · ${result.match_type === "location" ? "Lokasyon" : result.match_type === "barcode" ? "Barkod" : "SKU"}` });
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
    <div className="pt-5">
      <section className="rounded-[2rem] bg-forest p-6 text-center text-white">
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-acid text-forest"><PackageCheck size={38}/></div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-acid">{plan.order.order_code}</p>
        <h1 className="mt-2 text-3xl font-black">Ürünler hazır</h1>
        <p className="mt-2 text-white/60">{completedCount} toplama adımının tamamı sunucuya kaydedildi.</p>
        <div className="mt-6"><PickProgress current={completedCount} total={plan.items.length}/></div>
      </section>
      {feedback && <Feedback {...feedback} />}
      <label className="mt-4 block text-left text-sm font-black" htmlFor="pick-note">
        Operasyon notu <span className="font-semibold text-muted">(isteğe bağlı)</span>
        <textarea id="pick-note" className="field mt-2 min-h-24 resize-y font-normal" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Paketleme ekibi için not..." disabled={busy}/>
      </label>
      <button className="primary-button mt-4 w-full" onClick={complete} disabled={!allComplete || busy}><CheckCircle2 size={22}/>{busy ? "Tamamlanıyor..." : "Siparişi Tamamla"}</button>
    </div>
  );

  return (
    <div className="space-y-4 pt-4">
      <section className="rounded-[1.75rem] bg-forest p-5 text-white">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold text-acid">{plan.order.order_code}</p><h1 className="mt-1 text-xl font-black">Toplama adımı {currentIndex + 1}</h1></div><span className="rounded-full bg-white/10 px-3 py-1 text-sm font-black">{currentIndex + 1}/{plan.items.length}</span></div>
        <div className="mt-5"><PickProgress current={completedCount} total={plan.items.length}/></div>
      </section>

      <section className="rounded-[1.75rem] border border-line bg-white p-5 shadow-sm">
        {currentItem.image_url ? <img className="mb-5 aspect-square w-full rounded-2xl bg-canvas object-contain" src={currentItem.image_url} alt={currentItem.name || currentItem.sku}/> : <div className="mb-5 grid aspect-[2/1] place-items-center rounded-2xl bg-canvas text-muted"><span className="flex items-center gap-2 font-bold"><ImageOff/> Ürün görseli yok</span></div>}
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-moss"><MapPin size={17}/> Lokasyon</div>
        <div className="mt-3 break-words text-5xl font-black leading-none tracking-[-0.05em] text-forest">{currentItem.warehouse_location || "LOKASYON YOK"}</div>
        <div className="mt-5 border-t border-line pt-4"><p className="text-xs font-black uppercase tracking-widest text-muted">SKU</p><p className="mt-1 text-2xl font-black">{currentItem.sku}</p><p className="mt-2 text-base font-semibold text-muted">{currentItem.name || "Ürün adı yok"}</p></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-canvas p-3"><p className="text-xs font-bold text-muted">Gerekli</p><p className="mt-1 text-2xl font-black">{currentItem.required_quantity} <span className="text-sm">adet</span></p></div><div className="rounded-xl bg-canvas p-3"><p className="text-xs font-bold text-muted">Mevcut stok</p><p className={`mt-1 text-2xl font-black ${currentItem.central_stock < currentItem.required_quantity ? "text-danger" : ""}`}>{currentItem.central_stock}</p></div></div>
      </section>

      {!isVerified && <ScanInput onScan={scan} busy={busy} />}
      {isVerified && (
        <form onSubmit={confirmQuantity} className="rounded-2xl border-2 border-success/30 bg-emerald-50 p-4">
          <div className="mb-4 flex items-center gap-2 font-black text-success"><Check size={22}/> Ürün / lokasyon doğrulandı</div>
          <label htmlFor="pick-quantity" className="text-sm font-black">Toplanan adet · tam olarak {currentItem.required_quantity}</label>
          <input id="pick-quantity" className="field mt-2 min-h-20 text-center text-4xl font-black" type="number" inputMode="decimal" step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus disabled={busy}/>
          <button className="primary-button mt-3 w-full" type="submit" disabled={busy}><PackageCheck size={22}/>{busy ? "Kaydediliyor..." : "Adedi Onayla"}</button>
        </form>
      )}
      {feedback && <Feedback {...feedback} />}
    </div>
  );
}

function Feedback({ type, text }: { type: "success" | "error"; text: string }) {
  return <div className={`mt-4 flex items-center gap-3 rounded-xl p-4 text-sm font-black ${type === "error" ? "bg-red-100 text-danger" : "bg-emerald-100 text-success"}`} role={type === "error" ? "alert" : "status"}>{type === "error" ? <TriangleAlert size={22}/> : <CheckCircle2 size={22}/>} {text}</div>;
}
