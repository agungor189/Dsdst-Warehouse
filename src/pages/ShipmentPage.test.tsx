import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShipmentPage from "./ShipmentPage";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  definePackages: vi.fn(),
  listPackagingTypes: vi.fn(),
  createPackagingType: vi.fn(),
  loadGeliverOffers: vi.fn(),
  refreshGeliver: vi.fn(),
  queueNativeLabel: vi.fn(),
  listPrintJobs: vi.fn(),
  reprint: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  shipmentApi: api,
  warehouseAdminApi: { listPrintJobs: api.listPrintJobs, reprint: api.reprint },
  ApiError: class ApiError extends Error {
    constructor(message: string, public status?: number, public code?: string) { super(message); }
  },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-1", username: "Alper", role: "admin", permissions: {} } }),
  hasWarehousePermission: () => true,
}));

const detail = {
  id: "ship-1", orderId: "order-1", orderNumber: "SHO-8415454003267", sourceChannel: "SHOPIFY",
  reservationId: "res-1", state: "PREPARING", packageCount: 0, packages: [], recipient: null,
  carrierSelection: null, handedOffAt: null, dispatchedAt: null,
  requiredContents: [{ productId: "p-1", sku: "DSDST-4Y-7KQ30", title: "3 Yollu - 30mm", quantityBaseInt: 18, baseUomCode: "piece", unitWeightGrams: 45 }],
};

const packagingType = {
  id: "box-medium", name: "Orta Koli", type: "BOX", lengthMm: 400, widthMm: 300,
  heightMm: 250, emptyWeightGrams: 190, active: true, updatedAt: "2026-09-28T08:00:00Z",
};

const completeRecipient = {
  name: "Arda Gungor",
  email: "arda@example.test",
  phone: "+905325401212",
  address1: "Ataturk Mah. Test Sok. No: 1",
  address2: "Daire 4",
  countryCode: "TR",
  cityName: "Istanbul",
  cityCode: "34",
  districtName: "Umraniye",
  districtID: "108631",
  zip: "34764",
};

const offerReadyDetail = {
  ...detail,
  packageCount: 1,
  recipient: completeRecipient,
  packages: [{
    id: "package-1",
    packageNumber: 1,
    measurementSource: "MEASURED",
    dimensionsMm: { length: 400, width: 300, height: 250 },
    weightGrams: 1850,
    contents: [{ productId: "p-1", quantityBaseInt: 18 }],
    booking: null,
    label: null,
  }],
};

const livePackage = (offerPollingState: "READY" | "PENDING" | "TIMED_OUT" | "COMPLETE_EMPTY", offers: any[] = []) => ({
  providerShipmentId: "provider-1",
  packageId: "package-1",
  providerOrderNumber: "SHO-8415454003267-P1",
  createState: "CREATED",
  bookingState: null,
  providerTransactionId: null,
  providerStatusCode: offerPollingState === "COMPLETE_EMPTY" ? "GOT_OFFERS" : "CREATED",
  offerPollingState,
  barcode: null,
  selectedOffer: null,
  offers,
  tracking: { number: null, url: null, stateCode: null },
  label: null,
});

describe("Fulfillment mobile flow", () => {
  beforeEach(() => {
    api.list.mockReset().mockResolvedValue([{ id: detail.id, orderId: detail.orderId, orderNumber: detail.orderNumber,
      sourceChannel: detail.sourceChannel, reservationId: detail.reservationId, state: detail.state, packageCount: 0,
      customerName: "Arda Gungor", createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z" }]);
    api.get.mockReset().mockResolvedValue(detail);
    api.definePackages.mockReset().mockResolvedValue(undefined);
    api.listPackagingTypes.mockReset().mockResolvedValue([packagingType]);
    api.createPackagingType.mockReset();
    api.loadGeliverOffers.mockReset().mockResolvedValue([]);
    api.refreshGeliver.mockReset().mockResolvedValue([]);
    api.queueNativeLabel.mockReset().mockResolvedValue({ id: "print-1", purpose: "SHIPPING", subject_code: "PKG-1", status: "QUEUED", attempts: [], history: [] });
    api.listPrintJobs.mockReset().mockResolvedValue([]);
    api.reprint.mockReset();
  });

  it("toplaması tamamlanan siparişleri platform, müşteri, satır ve adet özetiyle paketleme kuyruğunda gösterir", async () => {
    render(<MemoryRouter><ShipmentPage/></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Paketleme" })).toBeInTheDocument();
    expect(await screen.findByText("SHOPIFY")).toBeInTheDocument();
    expect(screen.getByText("Arda Gungor")).toBeInTheDocument();
    expect(screen.getByText("1 ürün · 18 adet")).toBeInTheDocument();
  });

  it("paket hazırlamada Ayarlar'daki gerçek koli seçeneklerini gösterir ve çoklu koli eklenebilir", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/shipments?shipmentId=ship-1"]}><ShipmentPage/></MemoryRouter>);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("ship-1"));
    await user.click(await screen.findByRole("button", { name: /Orta Koli/ }));
    expect(screen.getByLabelText("Uzunluk (cm)")).toHaveValue("40");
    expect(screen.getByLabelText("Genişlik (cm)")).toHaveValue("30");
    expect(screen.getByLabelText("Yükseklik (cm)")).toHaveValue("25");
    await user.click(screen.getByRole("button", { name: "Paket ekle" }));
    expect(screen.getByText(/Paket 2/i)).toBeInTheDocument();
  });

  it("ürün ve boş koli ağırlığını otomatik toplar; operatörden ağırlık istemez", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce(detail).mockResolvedValueOnce(offerReadyDetail);
    render(<MemoryRouter initialEntries={["/shipments?shipmentId=ship-1"]}><ShipmentPage/></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: /Orta Koli/ }));
    expect(screen.queryByLabelText("Ağırlık (kg)")).not.toBeInTheDocument();
    expect(screen.getByText("Toplam ağırlık: 1 kg")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Paketleri Kaydet ve Devam Et/ }));

    await waitFor(() => expect(api.definePackages).toHaveBeenCalledWith("ship-1", [{
      packageNumber: 1,
      packagingTypeId: "box-medium",
      contents: [{ productId: "p-1", quantityBaseInt: 18 }],
    }], expect.any(String)));
  });

  it("kargo etiketi için telefon yazdırma penceresi açmadan yalnız yazıcı işi kuyruğa alır", async () => {
    const user = userEvent.setup();
    const labelReady = { ...offerReadyDetail, state: "LABEL_READY", packages: [{ ...offerReadyDetail.packages[0], label: {
      reference: "https://labels.invalid/label.pdf", responsiveReference: null, sha256: "a".repeat(64), mediaType: "application/pdf", providerNative: true,
    } }] };
    api.get.mockResolvedValue(labelReady);
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<MemoryRouter initialEntries={["/shipments?shipmentId=ship-1"]}><ShipmentPage/></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Yazıcıya Gönder" }));
    await waitFor(() => expect(api.queueNativeLabel).toHaveBeenCalledWith("ship-1", "package-1", expect.any(String)));
    expect(printSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("boş Türkiye ilçesini provider doğrulamasına bırakır ve manuel adres formu göstermez", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({
      ...offerReadyDetail,
      recipient: { ...completeRecipient, districtName: "", districtID: null, address1: "Bahçelievler, Adnan Kahveci Blv." },
    });

    render(<MemoryRouter initialEntries={["/shipments?shipmentId=ship-1"]}><ShipmentPage/></MemoryRouter>);

    expect(await screen.findByText("Arda Gungor")).toBeInTheDocument();
    expect(screen.queryByText("Alıcı adresi")).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Geliver Kargo Tekliflerini Getir" });
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(api.loadGeliverOffers).toHaveBeenCalledWith("ship-1", expect.any(String)));
  });

  it.each(["SHOPIFY", "TRENDYOL"])("%s shipment recipient adresini salt okunur gösterir ve Geliver teklifini snapshot ile alır", async (sourceChannel) => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({ ...offerReadyDetail, sourceChannel });

    render(<MemoryRouter initialEntries={["/shipments?shipmentId=ship-1"]}><ShipmentPage/></MemoryRouter>);

    expect(await screen.findByText("Arda Gungor")).toBeInTheDocument();
    expect(screen.getByText("+905325401212")).toBeInTheDocument();
    expect(screen.getByText("Istanbul / Umraniye")).toBeInTheDocument();
    expect(screen.getByText("Ataturk Mah. Test Sok. No: 1, Daire 4")).toBeInTheDocument();
    expect(screen.getByText(`${sourceChannel === "SHOPIFY" ? "Shopify" : "Trendyol"} siparişinden alındı`)).toBeInTheDocument();
    expect(screen.queryByText("Alıcı adresi")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Geliver Kargo Tekliflerini Getir" }));
    await waitFor(() => expect(api.loadGeliverOffers).toHaveBeenCalledWith("ship-1", expect.any(String)));
  });

  it("eksik Shopify recipient için manuel form açmaz ve canonical sipariş blocker'ı gösterir", async () => {
    api.get.mockResolvedValue({
      ...offerReadyDetail,
      recipient: { ...completeRecipient, phone: null, districtName: "" },
    });

    render(<MemoryRouter initialEntries={["/shipments?shipmentId=ship-1"]}><ShipmentPage/></MemoryRouter>);

    expect(await screen.findByRole("alert")).toHaveTextContent("Sipariş teslimat bilgileri eksik");
    expect(screen.getByRole("alert")).toHaveTextContent("telefon");
    expect(screen.getByRole("alert")).not.toHaveTextContent("ilçe");
    expect(screen.getByRole("alert")).toHaveTextContent("canonical sipariş kaydını düzeltin");
    expect(screen.queryByText("Alıcı adresi")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Geliver Kargo Tekliflerini Getir" })).toBeDisabled();
  });

  it("Geliver polling sürerken hazırlık durumunu, timeout sonrasında yenile aksiyonunu gösterir", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue(offerReadyDetail);
    let resolveOffers!: (value: any[]) => void;
    api.loadGeliverOffers.mockReturnValue(new Promise<any[]>((resolve) => { resolveOffers = resolve; }));

    render(<MemoryRouter initialEntries={["/shipments?shipmentId=ship-1"]}><ShipmentPage/></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Geliver Kargo Tekliflerini Getir" }));

    expect(screen.getByText("Kargo teklifleri hazırlanıyor…")).toBeInTheDocument();
    resolveOffers([livePackage("TIMED_OUT")]);
    expect(await screen.findByText("Teklifler henüz hazır değil")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Teklifleri Yenile" })).toBeInTheDocument();
    expect(screen.queryByText("Teklif bulunamadı.")).not.toBeInTheDocument();
  });

  it("Teklif bulunamadı mesajını yalnız provider teklif üretimini tamamladığında gösterir", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue(offerReadyDetail);
    api.loadGeliverOffers.mockResolvedValue([livePackage("COMPLETE_EMPTY")]);

    render(<MemoryRouter initialEntries={["/shipments?shipmentId=ship-1"]}><ShipmentPage/></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Geliver Kargo Tekliflerini Getir" }));

    expect(await screen.findByText("Teklif bulunamadı.")).toBeInTheDocument();
    expect(screen.queryByText("Teklifler henüz hazır değil")).not.toBeInTheDocument();
  });

  it("Geliver FAILED provider hata kodu ve mesajını operatöre gösterir", async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue(offerReadyDetail);
    api.loadGeliverOffers.mockRejectedValue(new Error("Geliver shipment failed (ADDRESS_REJECTED: Recipient district is not serviceable)."));

    render(<MemoryRouter initialEntries={["/shipments?shipmentId=ship-1"]}><ShipmentPage/></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Geliver Kargo Tekliflerini Getir" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("ADDRESS_REJECTED");
    expect(screen.getByRole("alert")).toHaveTextContent("Recipient district is not serviceable");
  });
});
