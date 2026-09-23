import { useEffect, useState } from "react";
import { PackageCheck, RefreshCw, Truck, XCircle } from "lucide-react";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";
import { shipmentApi } from "../lib/api";
import type { GeliverLivePackage, ShipmentV1 } from "../types/warehouse";

type PackageDraft = { lengthMm: string; widthMm: string; heightMm: string; weightGrams: string; contents: Record<string, string> };
const emptyRecipient = { name: "", email: "", phone: "", address1: "", address2: "", countryCode: "TR",
  cityName: "", cityCode: "", districtName: "", districtID: "", zip: "" };

export default function ShipmentPage() {
  const { user } = useAuth();
  const [shipmentId, setShipmentId] = useState("");
  const [shipment, setShipment] = useState<ShipmentV1 | null>(null);
  const [packageDrafts, setPackageDrafts] = useState<PackageDraft[]>([]);
  const [recipient, setRecipient] = useState(emptyRecipient);
  const [livePackages, setLivePackages] = useState<GeliverLivePackage[]>([]);
  const [handoffReference, setHandoffReference] = useState("");
  const [actualCharge, setActualCharge] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const canManage = hasWarehousePermission(user, "shipping:manage");
  const canDispatch = hasWarehousePermission(user, "shipping:dispatch");

  const defaultDraft = (current: ShipmentV1, includeAll: boolean): PackageDraft => ({ lengthMm: "", widthMm: "", heightMm: "", weightGrams: "",
    contents: Object.fromEntries(current.requiredContents.map((item) => [item.productId, includeAll ? String(item.quantityBaseInt) : "0"])) });

  const load = async () => {
    if (!shipmentId.trim()) return;
    setBusy(true); setFeedback(""); setLivePackages([]);
    try { setShipment(await shipmentApi.get(shipmentId.trim())); }
    catch (error: any) { setFeedback(error.message); }
    finally { setBusy(false); }
  };

  useEffect(() => { setShipment(null); setPackageDrafts([]); setLivePackages([]); }, [shipmentId]);
  useEffect(() => {
    if (shipment?.state === "PREPARING" && shipment.packageCount === 0 && packageDrafts.length === 0) setPackageDrafts([defaultDraft(shipment, true)]);
    if (shipment?.recipient) setRecipient({ ...emptyRecipient, ...shipment.recipient,
      phone: shipment.recipient.phone || "", address2: shipment.recipient.address2 || "",
      districtID: shipment.recipient.districtID || "", zip: shipment.recipient.zip || "" });
  }, [shipment]);

  const definePackages = async () => {
    setBusy(true); setFeedback("");
    try {
      const packages = packageDrafts.map((draft, index) => ({ packageNumber: index + 1,
        measured: { lengthMm: Number(draft.lengthMm), widthMm: Number(draft.widthMm), heightMm: Number(draft.heightMm), weightGrams: Number(draft.weightGrams) },
        contents: shipment!.requiredContents.map((item) => ({ productId: item.productId, quantityBaseInt: Number(draft.contents[item.productId] || 0) }))
          .filter((item) => item.quantityBaseInt > 0) }));
      await shipmentApi.definePackages(shipment!.id, packages);
      setShipment(await shipmentApi.get(shipment!.id)); setFeedback("Ölçülen paket verileri kaydedildi.");
    } catch (error: any) { setFeedback(error.message); } finally { setBusy(false); }
  };

  const loadOffers = async () => {
    setBusy(true); setFeedback("");
    try {
      const data = await shipmentApi.loadGeliverOffers(shipment!.id, recipient);
      setLivePackages(data); setShipment(await shipmentApi.get(shipment!.id));
      setFeedback(data.some((item) => item.offers.length) ? "Canlı Geliver teklifleri alındı; seçim operatöre bırakıldı." : "Teklifler henüz hazır değil; yenileyin.");
    } catch (error: any) { setFeedback(error.message); } finally { setBusy(false); }
  };

  const refresh = async () => {
    setBusy(true); setFeedback("");
    try { setLivePackages(await shipmentApi.refreshGeliver(shipment!.id)); setShipment(await shipmentApi.get(shipment!.id)); setFeedback("Geliver durumu yenilendi."); }
    catch (error: any) { setFeedback(error.message); } finally { setBusy(false); }
  };

  const acceptOffer = async (offerId: string) => {
    setBusy(true); setFeedback("");
    try { setShipment(await shipmentApi.acceptGeliverOffer(shipment!.id, offerId)); setLivePackages(await shipmentApi.refreshGeliver(shipment!.id));
      setFeedback("Seçilen Geliver teklifi kabul edildi."); }
    catch (error: any) { setFeedback(error.message); } finally { setBusy(false); }
  };

  const cancel = async () => {
    setBusy(true); setFeedback("");
    try { setShipment(await shipmentApi.cancel(shipment!.id, cancelReason)); setFeedback("Sevkiyat teslim öncesi iptal edildi."); }
    catch (error: any) { setFeedback(error.message); } finally { setBusy(false); }
  };

  const handoff = async () => {
    setBusy(true); setFeedback("");
    try { setShipment(await shipmentApi.confirmHandoff(shipment!.id, { evidenceReference: handoffReference,
      actualChargeMinor: actualCharge === "" ? undefined : Number(actualCharge), currency: "TRY" }));
      setFeedback("Fiziksel teslim doğrulandı; kanonik dispatch tamamlandı."); }
    catch (error: any) { setFeedback(error.message); } finally { setBusy(false); }
  };

  const cancellable = shipment && !["HANDED_OFF", "DISPATCHED", "CANCELLED"].includes(shipment.state);
  return <div className="space-y-5 pt-4">
    <div><p className="eyebrow">V2-13</p><h1 className="page-title">Sevkiyat & Geliver</h1>
      <p className="mt-2 text-sm text-muted">Canlı teklif seçimi operatöre aittir. Booking, etiket ve takip stok düşmez; yalnız fiziksel teslim dispatch yapar.</p></div>
    <section className="rounded-3xl border border-line bg-white p-5"><label className="text-xs font-black uppercase tracking-wide text-muted">Shipment ID</label>
      <div className="mt-2 flex gap-2"><input className="field" value={shipmentId} onChange={(event) => setShipmentId(event.target.value)} placeholder="shipment:reservation-id"/>
        <button className="primary-button" disabled={busy || !shipmentId.trim()} onClick={() => void load()}>Yükle</button></div></section>
    {shipment && <>
      <section className="rounded-3xl border border-line bg-white p-5">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-acid text-forest"><PackageCheck/></span>
          <div className="flex-1"><h2 className="text-xl font-black">{shipment.orderNumber}</h2><p className="text-sm text-muted">{shipment.state} · {shipment.packageCount} paket</p></div>
          {canManage && shipment.recipient && !["CANCELLED"].includes(shipment.state) && <button className="secondary-button" disabled={busy} onClick={() => void refresh()}><RefreshCw className="size-4"/> Geliver yenile</button>}</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{shipment.packages.map((pack) => <div key={pack.id} className="rounded-2xl border border-line p-3 text-sm">
          <b>Paket {pack.packageNumber}</b><p className="text-muted">{pack.measurementSource} · {pack.dimensionsMm.length}×{pack.dimensionsMm.width}×{pack.dimensionsMm.height} mm · {pack.weightGrams} g</p>
          <p>Booking: {pack.booking ? "hazır" : "bekliyor"} · Etiket: {pack.label ? pack.label.mediaType || "sağlayıcı formatı" : "bekliyor"}</p>
          <p>Takip: {pack.booking?.trackingNumber || "henüz atanmadı"}</p></div>)}</div>
      </section>
      {canManage && shipment.state === "PREPARING" && shipment.packageCount === 0 && <section className="rounded-3xl border border-line bg-white p-5">
        <h2 className="text-lg font-black">Paket ölçümleri ve içerikleri</h2><p className="mt-1 text-xs text-muted">Ölçülen değerleri paket bazında girin; içerik toplamları rezervasyonla eşleşmelidir.</p>
        <div className="mt-4 space-y-4">{packageDrafts.map((draft, index) => <div key={index} className="rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between"><b>Paket {index + 1}</b>{packageDrafts.length > 1 && <button className="text-sm text-danger" onClick={() => setPackageDrafts((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Paketi kaldır</button>}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">{(["lengthMm", "widthMm", "heightMm", "weightGrams"] as const).map((key) => <input key={key} className="field" inputMode="numeric"
            placeholder={({ lengthMm: "Uzunluk mm", widthMm: "Genişlik mm", heightMm: "Yükseklik mm", weightGrams: "Ağırlık g" })[key]} value={draft[key]}
            onChange={(event) => setPackageDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item))}/>)}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{shipment.requiredContents.map((content) => <label key={content.productId} className="text-xs font-bold">{content.sku} · {content.title}
            <input className="field mt-1" inputMode="numeric" value={draft.contents[content.productId] || "0"} onChange={(event) => setPackageDrafts((items) => items.map((item, itemIndex) => itemIndex === index
              ? { ...item, contents: { ...item.contents, [content.productId]: event.target.value } } : item))}/></label>)}</div>
        </div>)}</div>
        <div className="mt-4 flex gap-2"><button className="secondary-button" onClick={() => setPackageDrafts((items) => [...items, defaultDraft(shipment, false)])}>Paket ekle</button>
          <button className="primary-button" disabled={busy || packageDrafts.some((item) => !item.lengthMm || !item.widthMm || !item.heightMm || !item.weightGrams)} onClick={() => void definePackages()}>Paketleri kaydet</button></div>
      </section>}
      {canManage && shipment.state === "PREPARING" && shipment.packageCount > 0 && livePackages.length === 0 && <section className="rounded-3xl border border-line bg-white p-5">
        <div className="flex items-center gap-2"><Truck/><h2 className="text-lg font-black">Geliver alıcı ve canlı teklifler</h2></div>
        <p className="mt-1 text-xs text-muted">Alıcı adresi sağlayıcı gönderisine immutable snapshot olarak bağlanır. Eksik alanla gönderi oluşturulmaz.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(emptyRecipient) as Array<keyof typeof emptyRecipient>).map((key) => <input key={key} className="field"
          value={recipient[key] || ""} placeholder={({ name: "Ad soyad", email: "E-posta", phone: "Telefon", address1: "Adres", address2: "Adres 2 (opsiyonel)", countryCode: "Ülke kodu",
            cityName: "İl", cityCode: "İl kodu", districtName: "İlçe", districtID: "İlçe ID (opsiyonel)", zip: "Posta kodu (opsiyonel)" })[key]}
          onChange={(event) => setRecipient((current) => ({ ...current, [key]: event.target.value }))}/>)}</div>
        <button className="primary-button mt-4" disabled={busy || !recipient.name || !recipient.email || !recipient.address1 || !recipient.countryCode || !recipient.cityName || !recipient.cityCode || !recipient.districtName}
          onClick={() => void loadOffers()}>Canlı teklifleri getir</button>
      </section>}
      {canManage && livePackages.length > 0 && <section className="rounded-3xl border border-line bg-white p-5">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Canlı Geliver teklifleri</h2><p className="text-xs text-muted">En ucuz teklif otomatik seçilmez.</p></div>
          <button className="secondary-button" disabled={busy} onClick={() => void refresh()}><RefreshCw className="size-4"/> Yenile</button></div>
        <div className="mt-4 space-y-4">{livePackages.map((providerPackage, index) => <div key={providerPackage.packageId} className="rounded-2xl border border-line p-4">
          <b>Paket {index + 1}</b><p className="text-xs text-muted">Booking: {providerPackage.bookingState || "bekliyor"} · Etiket: {providerPackage.label ? providerPackage.label.fileType || "sağlayıcı formatı" : "bekliyor"} · Takip: {providerPackage.tracking.number || "henüz atanmadı"}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{providerPackage.offers.map((offer) => <button key={offer.id} disabled={busy || Boolean(providerPackage.selectedOffer)}
            className={`rounded-xl border p-3 text-left ${providerPackage.selectedOffer?.id === offer.id ? "border-forest bg-acid/20" : "border-line"}`}
            onClick={() => void acceptOffer(offer.id)}><b>{offer.carrier}</b><p>{offer.service}</p><p className="font-black">{offer.amountLocal || offer.amount} {offer.currencyLocal || offer.currency}</p></button>)}</div>
        </div>)}</div>
      </section>}
      {canManage && cancellable && <section className="rounded-3xl border border-danger/30 bg-white p-5"><div className="flex items-center gap-2"><XCircle className="text-danger"/><h2 className="font-black">Teslim öncesi iptal</h2></div>
        <div className="mt-3 flex gap-2"><input className="field" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="İptal nedeni"/>
          <button className="secondary-button" disabled={busy || !cancelReason.trim()} onClick={() => void cancel()}>İptal et</button></div></section>}
      {canDispatch && shipment.state === "LABEL_READY" && <section className="rounded-3xl border border-line bg-white p-5">
        <h2 className="text-lg font-black">Fiziksel taşıyıcı teslimi</h2><p className="mt-1 text-xs text-danger">Bu onay stok ve FIFO/COGS hareketini başlatır.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><input className="field" value={handoffReference} onChange={(event) => setHandoffReference(event.target.value)} placeholder="Teslim kanıtı / tutanak referansı"/>
          <input className="field" value={actualCharge} onChange={(event) => setActualCharge(event.target.value)} placeholder="Gerçek gider minor (opsiyonel)"/></div>
        <button className="primary-button mt-4" disabled={busy || !handoffReference.trim()} onClick={() => void handoff()}>Fiziksel teslimi doğrula</button>
      </section>}
    </>}
    {feedback && <p role="status" className="rounded-2xl bg-canvas p-4 text-sm font-bold">{feedback}</p>}
  </div>;
}
