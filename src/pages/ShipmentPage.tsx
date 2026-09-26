import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PackageCheck, Printer, RefreshCw, Truck, XCircle } from "lucide-react";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";
import { shipmentApi } from "../lib/api";
import type { BulkHandoffResponseV1, GeliverLivePackage, ShipmentSummaryV1, ShipmentV1 } from "../types/warehouse";
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, LoadingState, PageHeader } from "../components/ui";

type PackageDraft = { lengthMm: string; widthMm: string; heightMm: string; weightGrams: string; contents: Record<string, string> };
const emptyRecipient = { name: "", email: "", phone: "", address1: "", address2: "", countryCode: "TR",
  cityName: "", cityCode: "", districtName: "", districtID: "", zip: "" };

export default function ShipmentPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [shipmentId, setShipmentId] = useState(() => searchParams.get("shipmentId") || "");
  const [shipment, setShipment] = useState<ShipmentV1 | null>(null);
  const [shipments, setShipments] = useState<ShipmentSummaryV1[]>([]);
  const [shipmentScope, setShipmentScope] = useState<"pending" | "completed" | "all">("pending");
  const [shipmentSearch, setShipmentSearch] = useState("");
  const [listBusy, setListBusy] = useState(false);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<string[]>([]);
  const [bulkEvidence, setBulkEvidence] = useState("");
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkHandoffResponseV1 | null>(null);
  const bulkSubmitting = useRef(false);
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
  const canPrint = hasWarehousePermission(user, "warehouse:print_labels");

  const defaultDraft = (current: ShipmentV1, includeAll: boolean): PackageDraft => ({ lengthMm: "", widthMm: "", heightMm: "", weightGrams: "",
    contents: Object.fromEntries(current.requiredContents.map((item) => [item.productId, includeAll ? String(item.quantityBaseInt) : "0"])) });

  const loadShipments = async (silent = false) => {
    if (!silent) setListBusy(true);
    try {
      setShipments(await shipmentApi.list(shipmentScope));
    } catch (error: any) {
      if (!silent) setFeedback(error.message);
    } finally {
      if (!silent) setListBusy(false);
    }
  };

  const loadById = async (id: string) => {
    const normalized = id.trim();
    if (!normalized) return;

    setShipmentId(normalized);
    setBusy(true);
    setFeedback("");
    setLivePackages([]);

    try {
      setShipment(await shipmentApi.get(normalized));
    } catch (error: any) {
      setFeedback(error.message);
    } finally {
      setBusy(false);
    }
  };

  const load = async () => {
    await loadById(shipmentId);
  };

  useEffect(() => {
    void loadShipments();

    const timer = window.setInterval(() => {
      void loadShipments(true);
    }, 15_000);

    const refreshVisible = () => {
      if (document.visibilityState === "visible") void loadShipments(true);
    };

    const refreshFocus = () => {
      void loadShipments(true);
    };

    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("focus", refreshFocus);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("focus", refreshFocus);
    };
  }, [shipmentScope]);

  useEffect(() => { setShipment(null); setPackageDrafts([]); setLivePackages([]); }, [shipmentId]);
  // initial shipment from query
  useEffect(() => {
    if (!shipmentId.trim()) return;
    void load();
  }, []);
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

  const automaticMarketplaceRecipient = ["TRENDYOL", "SHOPIFY"].includes(shipment?.sourceChannel?.toUpperCase() || "");

  const loadOffers = async () => {
    setBusy(true); setFeedback("");
    try {
      const data = await shipmentApi.loadGeliverOffers(
        shipment!.id,
        automaticMarketplaceRecipient ? undefined : recipient,
      );
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

  const printNativeLabel = async (packageId: string) => {
    setBusy(true); setFeedback("");
    try { const job = await shipmentApi.queueNativeLabel(shipment!.id, packageId); setFeedback(`${job.subject_code} sağlayıcı etiketi kuyruğa alındı; fiziksel baskı henüz doğrulanmadı.`); }
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

  const normalizedShipmentSearch = shipmentSearch.trim().toLocaleLowerCase("tr-TR");

  const visibleShipments = shipments.filter((item) => {
    if (!normalizedShipmentSearch) return true;

    return [
      item.id,
      item.orderNumber,
      item.customerName || "",
      item.sourceChannel,
      item.state,
    ].some((value) =>
      String(value).toLocaleLowerCase("tr-TR").includes(normalizedShipmentSearch)
    );
  });

  const shipmentStateLabel = (state: ShipmentSummaryV1["state"]) => ({
    PREPARING: "Hazırlanıyor",
    CARRIER_SELECTED: "Kargo seçildi",
    BOOKED: "Booking hazır",
    LABEL_READY: "Etiket hazır",
    HANDED_OFF: "Teslim edildi",
    DISPATCHED: "Gönderildi",
    CANCELLED: "İptal",
    EXCEPTION: "Sorunlu",
  })[state] || state;

  const readyVisibleShipments = visibleShipments.filter((item) => item.state === "LABEL_READY");
  const selectedShipmentIdsSet = new Set(selectedShipmentIds);

  const toggleShipmentSelection = (item: ShipmentSummaryV1) => {
    if (!canDispatch || item.state !== "LABEL_READY" || bulkBusy) return;
    setBulkResult(null);
    setSelectedShipmentIds((current) => {
      if (current.includes(item.id)) return current.filter((id) => id !== item.id);
      if (current.length >= 50) {
        setFeedback("Tek toplu sevk işleminde en fazla 50 shipment seçilebilir.");
        return current;
      }
      return [...current, item.id];
    });
  };

  const selectAllReady = () => {
    setBulkResult(null);
    setSelectedShipmentIds(readyVisibleShipments.slice(0, 50).map((item) => item.id));
    if (readyVisibleShipments.length > 50) setFeedback("İlk 50 sevke hazır shipment seçildi.");
  };

  const submitBulkHandoff = async () => {
    if (bulkSubmitting.current || selectedShipmentIds.length === 0 || !bulkEvidence.trim()) return;
    bulkSubmitting.current = true;
    setBulkBusy(true);
    setFeedback("");
    try {
      const result = await shipmentApi.bulkHandoff({
        shipmentIds: selectedShipmentIds,
        handedOffAt: new Date().toISOString(),
        evidenceReference: bulkEvidence.trim(),
      }, `warehouse-bulk-handoff:${crypto.randomUUID()}`);
      setBulkResult(result);
      setSelectedShipmentIds(result.results.filter((item) => !item.success).map((item) => item.shipmentId));
      setBulkConfirmOpen(false);
      setFeedback("Toplu fiziksel teslim işlemi tamamlandı; sonuçlar shipment bazında gösteriliyor.");
      await loadShipments(true);
    } catch (error: any) {
      setFeedback(error.message);
    } finally {
      bulkSubmitting.current = false;
      setBulkBusy(false);
    }
  };

  const cancellable = shipment && !["HANDED_OFF", "DISPATCHED", "CANCELLED"].includes(shipment.state);
  return <div className="space-y-5 pt-4">
    <PageHeader eyebrow="V2-13" title="Sevkiyat & Geliver" description="Canlı teklif seçimi operatöre aittir. Booking, etiket ve takip stok düşmez; yalnız fiziksel teslim dispatch yapar."/>
    <Card as="section" padding="lg" className="rounded-3xl">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-black">Sevkiyatlar</h2>
          <p className="mt-1 text-xs text-muted">Bekleyen sevkiyatlar otomatik listelenir.</p>
        </div>
        <Button variant="secondary" loading={listBusy} onClick={() => void loadShipments()}>
          <RefreshCw className="size-4"/> Yenile
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {([
          ["pending", "Bekleyenler"],
          ["completed", "Tamamlananlar"],
          ["all", "Tümü"],
        ] as const).map(([value, label]) => (
          <Button
            key={value}
            variant={shipmentScope === value ? "primary" : "secondary"}
            size="sm"
            onClick={() => setShipmentScope(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      {canDispatch && <div className="mt-4 rounded-2xl border border-line bg-canvas p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" disabled={bulkBusy || readyVisibleShipments.length === 0} onClick={selectAllReady}>Tüm Sevke Hazırları Seç</Button>
            <Button variant="ghost" size="sm" disabled={bulkBusy || selectedShipmentIds.length === 0} onClick={() => { setSelectedShipmentIds([]); setBulkResult(null); }}>Seçimi temizle</Button>
            <Badge variant={selectedShipmentIds.length ? "info" : "default"}>{selectedShipmentIds.length} / 50 seçili</Badge>
          </div>
          <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(16rem,1fr)_auto] lg:w-[34rem]">
            <Input label="Ortak teslim kanıtı / referansı" required disabled={bulkBusy} value={bulkEvidence} onChange={(event) => setBulkEvidence(event.target.value)} placeholder="Tutanak, teslim fişi veya taşıyıcı referansı"/>
            <Button className="self-end" loading={bulkBusy} disabled={selectedShipmentIds.length === 0 || !bulkEvidence.trim()} onClick={() => setBulkConfirmOpen(true)}>Toplu Sevk</Button>
          </div>
        </div>
      </div>}

      <Input
        containerClassName="mt-4"
        value={shipmentSearch}
        onChange={(event) => setShipmentSearch(event.target.value)}
        placeholder="Sipariş no, müşteri, platform veya Shipment ID ara"
      />

      <div className="mt-4 space-y-2">
        {listBusy && shipments.length === 0 && (
          <LoadingState compact label="Sevkiyatlar yükleniyor..."/>
        )}

        {!listBusy && visibleShipments.length === 0 && (
          <EmptyState title="Bu filtrede sevkiyat bulunamadı."/>
        )}

        {visibleShipments.map((item) => <div
          key={item.id}
          className={`flex items-center gap-3 rounded-2xl border border-line p-4 transition hover:bg-canvas ${selectedShipmentIdsSet.has(item.id) ? "bg-acid/10" : ""}`}
        >
          {canDispatch && item.state === "LABEL_READY" && <input
            type="checkbox"
            className="size-5 shrink-0 accent-forest"
            aria-label={`${item.orderNumber || item.id} sevkiyatını seç`}
            checked={selectedShipmentIdsSet.has(item.id)}
            disabled={bulkBusy}
            onChange={() => toggleShipmentSelection(item)}
          />}
          <button
            className="grid min-w-0 flex-1 gap-2 text-left sm:grid-cols-[1.3fr_1fr_1fr_auto]"
            onClick={() => void loadById(item.id)}
          >
            <div className="min-w-0">
              <p className="font-black">{item.orderNumber || item.id}</p>
              <p className="mt-1 break-all text-xs text-muted">{item.id}</p>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wide text-muted">Müşteri</p>
              <p className="mt-1 text-sm font-bold">{item.customerName || "—"}</p>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wide text-muted">Kanal</p>
              <p className="mt-1 text-sm font-bold">{item.sourceChannel}</p>
            </div>

            <div className="sm:text-right">
              <p className="font-black">{shipmentStateLabel(item.state)}</p>
              <p className="mt-1 text-xs text-muted">{item.packageCount} paket</p>
            </div>
          </button>
        </div>)}
      </div>
    </Card>

    {bulkResult && <Card as="section" padding="lg" className="rounded-3xl" aria-live="polite">
      <h2 className="text-lg font-black">Toplu sevk sonucu</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="success">Başarılı: {bulkResult.summary.dispatched}</Badge>
        <Badge variant={bulkResult.summary.failed ? "danger" : "default"}>Başarısız: {bulkResult.summary.failed}</Badge>
        <Badge variant="info">Daha önce işlenmiş: {bulkResult.summary.alreadyProcessed}</Badge>
      </div>
      {bulkResult.results.some((item) => !item.success) && <div className="mt-4 space-y-2">
        <p className="text-sm font-black">Başarısız shipment'lar yeniden denemek için seçili bırakıldı.</p>
        {bulkResult.results.filter((item) => !item.success).map((item) => <div key={item.shipmentId} className="rounded-xl border border-danger/30 bg-red-50 p-3 text-sm">
          <p className="font-black">{item.orderNumber || item.shipmentId}</p>
          <p className="mt-1 text-danger">{item.message || "Shipment sevk edilemedi."}</p>
        </div>)}
      </div>}
    </Card>}

    <Card as="section" padding="lg" className="rounded-3xl">
      <div className="flex gap-2">
        <Input
          containerClassName="flex-1"
          label="Shipment ID ile aç"
          value={shipmentId}
          onChange={(event) => setShipmentId(event.target.value)}
          placeholder="Opsiyonel: shipment:reservation-id"
        />
        <Button className="self-end" loading={busy} disabled={!shipmentId.trim()} onClick={() => void load()}>
          Aç
        </Button>
      </div>
    </Card>
    {shipment && <>
      <Card as="section" padding="lg" className="rounded-3xl">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-acid text-forest"><PackageCheck/></span>
          <div className="flex-1"><h2 className="text-xl font-black">{shipment.orderNumber}</h2><p className="text-sm text-muted"><Badge variant={shipment.state === "CANCELLED" ? "danger" : shipment.state === "DISPATCHED" ? "success" : "info"}>{shipment.state}</Badge> · {shipment.packageCount} paket</p></div>
          {canManage && shipment.recipient && !["CANCELLED"].includes(shipment.state) && <Button variant="secondary" loading={busy} onClick={() => void refresh()}><RefreshCw className="size-4"/> Geliver yenile</Button>}</div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{shipment.packages.map((pack) => <div key={pack.id} className="rounded-2xl border border-line p-3 text-sm">
          <b>Paket {pack.packageNumber}</b><p className="text-muted">{pack.measurementSource} · {pack.dimensionsMm.length}×{pack.dimensionsMm.width}×{pack.dimensionsMm.height} mm · {pack.weightGrams} g</p>
          <p>Booking: {pack.booking ? "hazır" : "bekliyor"} · Etiket: {pack.label ? pack.label.mediaType || "sağlayıcı formatı" : "bekliyor"}</p>
          <p>Takip: {pack.booking?.trackingNumber || "henüz atanmadı"}</p>{pack.label && <div className="mt-3 grid grid-cols-2 gap-2"><a className="secondary-button" href={pack.label.reference} target="_blank" rel="noreferrer">Önizle</a>{canPrint && <Button variant="secondary" loading={busy} onClick={() => void printNativeLabel(pack.id)}><Printer className="size-4"/> Yazdır</Button>}</div>}</div>)}</div>
      </Card>
      {canManage && shipment.state === "PREPARING" && shipment.packageCount === 0 && <Card as="section" padding="lg" className="rounded-3xl">
        <h2 className="text-lg font-black">Paket ölçümleri ve içerikleri</h2><p className="mt-1 text-xs text-muted">Ölçülen değerleri paket bazında girin; içerik toplamları rezervasyonla eşleşmelidir.</p>
        <div className="mt-4 space-y-4">{packageDrafts.map((draft, index) => <div key={index} className="rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between"><b>Paket {index + 1}</b>{packageDrafts.length > 1 && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setPackageDrafts((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Paketi kaldır</Button>}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">{(["lengthMm", "widthMm", "heightMm", "weightGrams"] as const).map((key) => <Input key={key} inputMode="numeric"
            placeholder={({ lengthMm: "Uzunluk mm", widthMm: "Genişlik mm", heightMm: "Yükseklik mm", weightGrams: "Ağırlık g" })[key]} value={draft[key]}
            onChange={(event) => setPackageDrafts((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: event.target.value } : item))}/>)}</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{shipment.requiredContents.map((content) => <label key={content.productId} className="text-xs font-bold">{content.sku} · {content.title}
            <Input containerClassName="mt-1" inputMode="numeric" value={draft.contents[content.productId] || "0"} onChange={(event) => setPackageDrafts((items) => items.map((item, itemIndex) => itemIndex === index
              ? { ...item, contents: { ...item.contents, [content.productId]: event.target.value } } : item))}/></label>)}</div>
        </div>)}</div>
        <div className="mt-4 flex gap-2"><Button variant="secondary" onClick={() => setPackageDrafts((items) => [...items, defaultDraft(shipment, false)])}>Paket ekle</Button>
          <Button loading={busy} disabled={packageDrafts.some((item) => !item.lengthMm || !item.widthMm || !item.heightMm || !item.weightGrams)} onClick={() => void definePackages()}>Paketleri kaydet</Button></div>
      </Card>}
      {canManage && shipment.state === "PREPARING" && shipment.packageCount > 0 && livePackages.length === 0 && <Card as="section" padding="lg" className="rounded-3xl">
        <div className="flex items-center gap-2"><Truck/><h2 className="text-lg font-black">Geliver alıcı ve canlı teklifler</h2></div>
        {automaticMarketplaceRecipient ? (
          <div className="mt-4 rounded-2xl border border-line bg-canvas p-4">
            <p className="font-black">Alıcı bilgileri pazaryeri siparişinden otomatik alınacak.</p>
            <p className="mt-1 text-xs text-muted">İl ve ilçe kodları Geliver verisinden otomatik çözümlenir; manuel adres girişi gerekmez.</p>
          </div>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">Alıcı adresi sağlayıcı gönderisine immutable snapshot olarak bağlanır. Eksik alanla gönderi oluşturulmaz.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(Object.keys(emptyRecipient) as Array<keyof typeof emptyRecipient>).map((key) => <Input key={key}
              value={recipient[key] || ""} placeholder={({ name: "Ad soyad", email: "E-posta", phone: "Telefon", address1: "Adres", address2: "Adres 2 (opsiyonel)", countryCode: "Ülke kodu",
                cityName: "İl", cityCode: "İl kodu", districtName: "İlçe", districtID: "İlçe ID (opsiyonel)", zip: "Posta kodu (opsiyonel)" })[key]}
              onChange={(event) => setRecipient((current) => ({ ...current, [key]: event.target.value }))}/>)}</div>
          </>
        )}
        <Button className="mt-4" loading={busy}
          disabled={busy || (!automaticMarketplaceRecipient && (!recipient.name || !recipient.email || !recipient.address1 || !recipient.countryCode || !recipient.cityName || !recipient.cityCode || !recipient.districtName))}
          onClick={() => void loadOffers()}>Canlı teklifleri getir</Button>
      </Card>}
      {canManage && livePackages.length > 0 && <Card as="section" padding="lg" className="rounded-3xl">
        <div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Canlı Geliver teklifleri</h2><p className="text-xs text-muted">En ucuz teklif otomatik seçilmez.</p></div>
          <Button variant="secondary" loading={busy} onClick={() => void refresh()}><RefreshCw className="size-4"/> Yenile</Button></div>
        <div className="mt-4 space-y-4">{livePackages.map((providerPackage, index) => <div key={providerPackage.packageId} className="rounded-2xl border border-line p-4">
          <b>Paket {index + 1}</b><p className="text-xs text-muted">Booking: {providerPackage.bookingState || "bekliyor"} · Etiket: {providerPackage.label ? providerPackage.label.fileType || "sağlayıcı formatı" : "bekliyor"} · Takip: {providerPackage.tracking.number || "henüz atanmadı"}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{providerPackage.offers.map((offer) => <button key={offer.id} disabled={busy || Boolean(providerPackage.selectedOffer)}
            className={`rounded-xl border p-3 text-left ${providerPackage.selectedOffer?.id === offer.id ? "border-forest bg-acid/20" : "border-line"}`}
            onClick={() => void acceptOffer(offer.id)}><b>{offer.carrier}</b><p>{offer.service}</p><p className="font-black">{offer.amountLocal || offer.amount} {offer.currencyLocal || offer.currency}</p></button>)}</div>
        </div>)}</div>
      </Card>}
      {canManage && cancellable && <Card as="section" padding="lg" className="rounded-3xl border-danger/30"><div className="flex items-center gap-2"><XCircle className="text-danger"/><h2 className="font-black">Teslim öncesi iptal</h2></div>
        <div className="mt-3 flex gap-2"><Input containerClassName="flex-1" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="İptal nedeni"/>
          <Button variant="danger" loading={busy} disabled={!cancelReason.trim()} onClick={() => void cancel()}>İptal et</Button></div></Card>}
      {canDispatch && shipment.state === "LABEL_READY" && <Card as="section" padding="lg" className="rounded-3xl">
        <h2 className="text-lg font-black">Fiziksel taşıyıcı teslimi</h2><p className="mt-1 text-xs text-danger">Bu onay stok ve FIFO/COGS hareketini başlatır.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><Input value={handoffReference} onChange={(event) => setHandoffReference(event.target.value)} placeholder="Teslim kanıtı / tutanak referansı"/>
          <Input value={actualCharge} onChange={(event) => setActualCharge(event.target.value)} placeholder="Gerçek gider minor (opsiyonel)"/></div>
        <Button className="mt-4" loading={busy} disabled={!handoffReference.trim()} onClick={() => void handoff()}>Fiziksel teslimi doğrula</Button>
      </Card>}
    </>}
    {feedback && <p role="status" className="rounded-2xl bg-canvas p-4 text-sm font-bold">{feedback}</p>}
    <ConfirmDialog
      open={bulkConfirmOpen}
      onClose={() => { if (!bulkBusy) setBulkConfirmOpen(false); }}
      onConfirm={submitBulkHandoff}
      title="Toplu fiziksel sevki onayla"
      description={`${selectedShipmentIds.length} shipment fiziksel olarak taşıyıcıya teslim edilmiş sayılacak. Bu işlem stok hareketlerini ve finansal kayıtları kesinleştirir. Ortak kanıt: ${bulkEvidence.trim()}`}
      confirmLabel="Fiziksel teslimi onayla"
      loading={bulkBusy}
    />
  </div>;
}
