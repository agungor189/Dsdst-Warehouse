import { useEffect, useState } from "react";
import { PackageCheck, Truck } from "lucide-react";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";
import { shipmentApi } from "../lib/api";
import type { ShipmentV1 } from "../types/warehouse";

const emptyCarrier = { carrierCode: "", serviceCode: "", quoteId: "", quoteAmountMinor: "", currency: "TRY", quoteReference: "" };

export default function ShipmentPage() {
  const { user } = useAuth();
  const [shipmentId, setShipmentId] = useState("");
  const [shipment, setShipment] = useState<ShipmentV1 | null>(null);
  const [packagesJson, setPackagesJson] = useState("[]");
  const [carrier, setCarrier] = useState(emptyCarrier);
  const [handoffReference, setHandoffReference] = useState("");
  const [actualCharge, setActualCharge] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const canManage = hasWarehousePermission(user, "shipping:manage");
  const canDispatch = hasWarehousePermission(user, "shipping:dispatch");

  const load = async () => {
    if (!shipmentId.trim()) return;
    setBusy(true); setFeedback("");
    try { setShipment(await shipmentApi.get(shipmentId.trim())); }
    catch (error: any) { setFeedback(error.message); }
    finally { setBusy(false); }
  };

  useEffect(() => { setShipment(null); }, [shipmentId]);

  const selectCarrier = async () => {
    setBusy(true); setFeedback("");
    try {
      setShipment(await shipmentApi.selectCarrier(shipment!.id, {
        ...carrier, quoteAmountMinor: Number(carrier.quoteAmountMinor),
      }));
      setFeedback("Taşıyıcı ve servis operatör seçimi olarak kaydedildi.");
    } catch (error: any) { setFeedback(error.message); } finally { setBusy(false); }
  };

  const definePackages = async () => {
    setBusy(true); setFeedback("");
    try {
      const packages = JSON.parse(packagesJson);
      if (!Array.isArray(packages)) throw new Error("Paket tanımı JSON listesi olmalıdır.");
      await shipmentApi.definePackages(shipment!.id, packages);
      setShipment(await shipmentApi.get(shipment!.id));
      setFeedback("Paket ölçüm ve içerik snapshot’ları kaydedildi.");
    } catch (error: any) { setFeedback(error.message); } finally { setBusy(false); }
  };

  const book = async () => {
    setBusy(true); setFeedback("");
    try {
      const result = await shipmentApi.requestBooking(shipment!.id);
      setShipment(result.shipment);
      setFeedback("Booking işi kaydedildi. Canlı Geliver taşıması doğrulanmadıysa fail-closed kalır.");
    } catch (error: any) { setFeedback(error.message); } finally { setBusy(false); }
  };

  const handoff = async () => {
    setBusy(true); setFeedback("");
    try {
      setShipment(await shipmentApi.confirmHandoff(shipment!.id, {
        evidenceReference: handoffReference,
        actualChargeMinor: actualCharge === "" ? undefined : Number(actualCharge),
        currency: "TRY",
      }));
      setFeedback("Fiziksel teslim doğrulandı; kanonik dispatch tamamlandı.");
    } catch (error: any) { setFeedback(error.message); } finally { setBusy(false); }
  };

  return <div className="space-y-5 pt-4">
    <div><p className="eyebrow">V2-13</p><h1 className="page-title">Sevkiyat & Geliver</h1>
      <p className="mt-2 text-sm text-muted">Taşıyıcı/servis seçimi operatöre aittir. Booking, takip ve etiket stok düşmez; yalnız fiziksel teslim dispatch yapar.</p></div>
    <section className="rounded-3xl border border-line bg-white p-5">
      <label className="text-xs font-black uppercase tracking-wide text-muted">Shipment ID</label>
      <div className="mt-2 flex gap-2"><input className="field" value={shipmentId} onChange={(event) => setShipmentId(event.target.value)} placeholder="shipment:reservation-id"/>
        <button className="primary-button" disabled={busy || !shipmentId.trim()} onClick={() => void load()}>Yükle</button></div>
    </section>
    {shipment && <>
      <section className="rounded-3xl border border-line bg-white p-5">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-acid text-forest"><PackageCheck/></span>
          <div><h2 className="text-xl font-black">{shipment.orderNumber}</h2><p className="text-sm text-muted">{shipment.state} · {shipment.packageCount} paket</p></div></div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{shipment.packages.map((pack) => <div key={pack.id} className="rounded-2xl border border-line p-3 text-sm">
          <b>Paket {pack.packageNumber}</b><p className="text-muted">{pack.measurementSource} · {pack.dimensionsMm.length}×{pack.dimensionsMm.width}×{pack.dimensionsMm.height} mm · {pack.weightGrams} g</p>
          {pack.booking?.trackingNumber && <p>Takip: {pack.booking.trackingNumber}</p>}</div>)}</div>
      </section>
      {canManage && shipment.state === "PREPARING" && shipment.packageCount === 0 && <section className="rounded-3xl border border-line bg-white p-5">
        <h2 className="text-lg font-black">Paket ölçümleri ve içerikleri</h2>
        <p className="mt-1 text-xs text-muted">Bir veya daha çok paket girin. Ölçülen değerleri kullanın; yalnız immutable reçete varsa measured alanını kaldırıp recipePackageNumber verin.</p>
        <textarea className="field mt-4 min-h-44 font-mono text-xs" value={packagesJson} onChange={(event) => setPackagesJson(event.target.value)}
          aria-label="Paket JSON tanımı" placeholder='[{"packageNumber":1,"measured":{"lengthMm":300,"widthMm":200,"heightMm":150,"weightGrams":1200},"contents":[{"productId":"...","quantityBaseInt":1}]}]'/>
        <button className="primary-button mt-4" disabled={busy || packagesJson.trim() === "[]"} onClick={() => void definePackages()}>Paketleri kaydet</button>
      </section>}
      {canManage && shipment.state === "PREPARING" && shipment.packageCount > 0 && <section className="rounded-3xl border border-line bg-white p-5">
        <div className="flex items-center gap-2"><Truck/><h2 className="text-lg font-black">Geliver taşıyıcı/servis seçimi</h2></div>
        <p className="mt-1 text-xs text-muted">En ucuz otomatik seçilmez; gördüğünüz teklifin kimliğini ve kaynağını aynen girin.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(["carrierCode", "serviceCode", "quoteId", "quoteAmountMinor", "currency", "quoteReference"] as const).map((key) => <input key={key} className="field" value={carrier[key]}
            placeholder={({ carrierCode: "Taşıyıcı kodu", serviceCode: "Servis kodu", quoteId: "Teklif ID", quoteAmountMinor: "Teklif (minor)", currency: "Para birimi", quoteReference: "Teklif kaynak referansı" })[key]}
            onChange={(event) => setCarrier((current) => ({ ...current, [key]: event.target.value }))}/>)}</div>
        <button className="primary-button mt-4" disabled={busy || Object.values(carrier).some((value) => !value)} onClick={() => void selectCarrier()}>Seçimi kaydet</button>
      </section>}
      {canManage && shipment.state === "CARRIER_SELECTED" && <button className="primary-button" disabled={busy} onClick={() => void book()}>Geliver booking isteği oluştur</button>}
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
