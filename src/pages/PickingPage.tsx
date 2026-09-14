import { Check, CheckCircle2, MapPin, PackageCheck, ScanBarcode, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { PickProgress } from "../features/picking/PickProgress";
import { ScanInput } from "../features/picking/ScanInput";
import { createPickSession } from "../features/picking/pickStorage";
import { usePickSession } from "../features/picking/usePickSession";
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
  const { session, setSession } = usePickSession();

  const load = () => {
    setLoadError("");
    warehouseApi.getPickPlan(id).then((data) => {
      setPlan(data);
      setSession((current) => current?.orderId === id ? current : createPickSession(id, data.order.order_code));
    }).catch((reason) => setLoadError(getErrorMessage(reason)));
  };
  useEffect(load, [id, setSession]);

  const currentIndex = session?.activePickIndex ?? 0;
  const currentItem = plan?.items[currentIndex];
  const isFinished = Boolean(plan && currentIndex >= plan.items.length);
  const completedCount = useMemo(() => plan ? plan.items.filter((item) => (session?.pickedQuantities[item.product_id] || 0) >= item.required_quantity).length : 0, [plan, session]);
  const allComplete = Boolean(plan?.items.length && completedCount === plan.items.length);

  const setPhase = (phase: "location" | "product" | "quantity", verifiedSku: string | null = null) => {
    setSession((current) => current ? { ...current, phase, verifiedSku } : current);
    setFeedback(null);
  };

  const scan = async (code: string) => {
    if (!currentItem) return false;
    setBusy(true);
    setFeedback(null);
    try {
      const product = await warehouseApi.scan(code);
      if (product.sku.toLocaleUpperCase("tr") !== currentItem.sku.toLocaleUpperCase("tr")) {
        setFeedback({ type: "error", text: `YANLIŞ ÜRÜN · Okutulan: ${product.sku}` });
        return false;
      }
      setFeedback({ type: "success", text: "Doğru ürün" });
      setPhase("quantity", product.sku);
      return true;
    } catch (reason) {
      setFeedback({ type: "error", text: getErrorMessage(reason) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirmQuantity = (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !currentItem) return;
    const picked = Number(quantity);
    if (!Number.isInteger(picked) || picked < 1 || picked > currentItem.required_quantity) {
      setFeedback({ type: "error", text: `Adet 1 ile ${currentItem.required_quantity} arasında olmalı.` });
      return;
    }
    const nextIndex = currentIndex + 1;
    setSession({
      ...session,
      activePickIndex: nextIndex,
      pickedQuantities: { ...session.pickedQuantities, [currentItem.product_id]: picked },
      phase: "location",
      verifiedSku: null,
    });
    setQuantity("");
    setFeedback({ type: "success", text: nextIndex >= (plan?.items.length || 0) ? "Tüm ürünler toplandı" : "Ürün tamamlandı" });
  };

  const complete = async () => {
    if (!allComplete) return;
    setBusy(true);
    setFeedback(null);
    try {
      await warehouseApi.completeOrder(id);
      setSession(null);
      navigate(`/orders/${id}/success`, { state: { orderCode: plan?.order.order_code } });
    } catch (reason) {
      setFeedback({ type: "error", text: getErrorMessage(reason) });
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <div className="pt-6"><ErrorState message={loadError} retry={load} /></div>;
  if (!plan || !session) return <div className="pt-6"><LoadingState label="Toplama planı yükleniyor" /></div>;

  if (isFinished) return (
    <div className="pt-5">
      <section className="rounded-[2rem] bg-forest p-6 text-center text-white">
        <div className="mx-auto grid size-20 place-items-center rounded-full bg-acid text-forest"><PackageCheck size={38}/></div>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-acid">{plan.order.order_code}</p>
        <h1 className="mt-2 text-3xl font-black">Ürünler hazır</h1>
        <p className="mt-2 text-white/60">{completedCount} toplama adımının tamamı onaylandı.</p>
        <div className="mt-6"><PickProgress current={completedCount} total={plan.items.length}/></div>
      </section>
      {feedback && <Feedback {...feedback} />}
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
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.16em] text-moss"><MapPin size={17}/> Lokasyon</div>
        <div className="mt-3 break-words text-5xl font-black leading-none tracking-[-0.05em] text-forest">{currentItem?.warehouse_location || "LOKASYON YOK"}</div>
        <div className="mt-5 border-t border-line pt-4"><p className="text-xs font-black uppercase tracking-widest text-muted">SKU</p><p className="mt-1 text-2xl font-black">{currentItem?.sku}</p><p className="mt-2 text-base font-semibold text-muted">{currentItem?.name || "Ürün adı yok"}</p></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-xl bg-canvas p-3"><p className="text-xs font-bold text-muted">Gerekli</p><p className="mt-1 text-2xl font-black">{currentItem?.required_quantity} <span className="text-sm">adet</span></p></div><div className="rounded-xl bg-canvas p-3"><p className="text-xs font-bold text-muted">Mevcut stok</p><p className={`mt-1 text-2xl font-black ${(currentItem?.central_stock || 0) < (currentItem?.required_quantity || 0) ? "text-danger" : ""}`}>{currentItem?.central_stock}</p></div></div>
      </section>

      {session.phase === "location" && (
        <button className="primary-button w-full" onClick={() => setPhase("product")}><MapPin size={22}/> Lokasyondayım</button>
      )}
      {session.phase === "product" && <ScanInput onScan={scan} busy={busy} />}
      {session.phase === "quantity" && (
        <form onSubmit={confirmQuantity} className="rounded-2xl border-2 border-success/30 bg-emerald-50 p-4">
          <div className="mb-4 flex items-center gap-2 font-black text-success"><Check size={22}/> Ürün doğrulandı</div>
          <label htmlFor="pick-quantity" className="text-sm font-black">Toplanan adet</label>
          <input id="pick-quantity" className="field mt-2 min-h-20 text-center text-4xl font-black" type="number" inputMode="numeric" min="1" max={currentItem?.required_quantity} value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus />
          <button className="primary-button mt-3 w-full" type="submit"><PackageCheck size={22}/> Adedi Onayla</button>
        </form>
      )}
      {feedback && <Feedback {...feedback} />}
    </div>
  );
}

function Feedback({ type, text }: { type: "success" | "error"; text: string }) {
  return <div className={`mt-4 flex items-center gap-3 rounded-xl p-4 text-sm font-black ${type === "error" ? "bg-red-100 text-danger" : "bg-emerald-100 text-success"}`} role={type === "error" ? "alert" : "status"}>{type === "error" ? <TriangleAlert size={22}/> : <CheckCircle2 size={22}/>} {text}</div>;
}
