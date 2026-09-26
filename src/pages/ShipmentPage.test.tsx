import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shipmentApi } from "../lib/api";
import type { ShipmentSummaryV1, ShipmentV1 } from "../types/warehouse";
import ShipmentPage, { centimetersToMillimeters, shipmentDiagnosticStageLabel } from "./ShipmentPage";

const permissionState = vi.hoisted(() => ({ dispatch: true }));
vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", username: "Alper", role: "admin", permissions: {} } }),
  hasWarehousePermission: (_user: unknown, permission: string) => permission === "shipping:dispatch" ? permissionState.dispatch : true,
}));

const shipment: ShipmentV1 = {
  id: "shipment-1", orderId: "order-1", orderNumber: "DS-1042", sourceChannel: "TRENDYOL",
  reservationId: "reservation-1", state: "LABEL_READY", packageCount: 1,
  requiredContents: [{ productId: "product-1", sku: "SKU-1", title: "Raf seti", quantityBaseInt: 1, baseUomCode: "piece" }],
  recipient: { name: "Ayşe", email: "ayse@example.com", phone: null, address1: "Adres", address2: null, countryCode: "TR", cityName: "İstanbul", cityCode: "34", districtName: "Kadıköy", districtID: null, zip: null },
  packages: [{ id: "package-1", packageNumber: 1, measurementSource: "MEASURED", dimensionsMm: { length: 1200, width: 210, height: 120 }, weightGrams: 500, contents: [{ productId: "product-1", quantityBaseInt: 1 }], booking: { providerShipmentId: "provider-1", providerTransactionId: null, barcode: null, carrierCode: "carrier", serviceCode: "service", trackingNumber: "TRACK-1", trackingUrl: null }, label: null }],
  carrierSelection: null, handedOffAt: null, dispatchedAt: null, activeDiagnostic: null,
};

const queue: ShipmentSummaryV1[] = [
  { id: "shipment-ready-1", orderId: "order-1", orderNumber: "DS-1001", sourceChannel: "SHOPIFY", reservationId: "reservation-1", state: "LABEL_READY", packageCount: 1, customerName: "Ayşe", createdAt: "2026-09-26T08:00:00.000Z", updatedAt: "2026-09-26T08:00:00.000Z", activeDiagnostic: null },
  { id: "shipment-ready-2", orderId: "order-2", orderNumber: "DS-1002", sourceChannel: "TRENDYOL", reservationId: "reservation-2", state: "LABEL_READY", packageCount: 2, customerName: "Bora", createdAt: "2026-09-26T08:00:00.000Z", updatedAt: "2026-09-26T08:00:00.000Z", activeDiagnostic: null },
  { id: "shipment-preparing", orderId: "order-3", orderNumber: "DS-1003", sourceChannel: "PANEL", reservationId: "reservation-3", state: "PREPARING", packageCount: 1, customerName: "Cem", createdAt: "2026-09-26T08:00:00.000Z", updatedAt: "2026-09-26T08:00:00.000Z", activeDiagnostic: null },
];

describe("ShipmentPage", () => {
  beforeEach(() => {
    permissionState.dispatch = true;
    vi.spyOn(shipmentApi, "list").mockResolvedValue([]);
    vi.spyOn(shipmentApi, "get").mockResolvedValue(structuredClone(shipment));
  });

  it("query'deki shipment'ı yükler ve mevcut operasyon aksiyonlarını gösterir", async () => {
    render(<MemoryRouter initialEntries={["/shipments?shipmentId=shipment-1"]}><ShipmentPage/></MemoryRouter>);
    expect(await screen.findByText("DS-1042")).toBeInTheDocument();
    expect(screen.getByText("LABEL_READY")).toBeInTheDocument();
    expect(screen.getByText(/120×21×12 cm/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Aktif sevkiyat uyarısı")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fiziksel teslimi doğrula" })).toBeDisabled();
    expect(shipmentApi.get).toHaveBeenCalledWith("shipment-1");
  });

  it("cm ölçülerini Panel API contract'ı için mm'ye çevirir", async () => {
    const user = userEvent.setup();
    vi.mocked(shipmentApi.get).mockResolvedValue({ ...shipment, state: "PREPARING", packageCount: 0, packages: [] });
    const definePackages = vi.spyOn(shipmentApi, "definePackages").mockResolvedValue([]);

    render(<MemoryRouter initialEntries={["/shipments?shipmentId=shipment-1"]}><ShipmentPage/></MemoryRouter>);

    await user.type(await screen.findByLabelText("Uzunluk cm"), "120");
    await user.type(screen.getByLabelText("Genişlik cm"), "21");
    await user.type(screen.getByLabelText("Yükseklik cm"), "12.5");
    await user.type(screen.getByLabelText("Ağırlık g"), "500");
    await user.click(screen.getByRole("button", { name: "Paketleri kaydet" }));

    await waitFor(() => expect(definePackages).toHaveBeenCalledTimes(1));
    expect(definePackages).toHaveBeenCalledWith("shipment-1", [expect.objectContaining({
      measured: { lengthMm: 1200, widthMm: 210, heightMm: 125, weightGrams: 500 },
    })]);
  });

  it("geçersiz, sıfır veya negatif cm ölçüsünü kaydetmez", async () => {
    const user = userEvent.setup();
    vi.mocked(shipmentApi.get).mockResolvedValue({ ...shipment, state: "PREPARING", packageCount: 0, packages: [] });
    const definePackages = vi.spyOn(shipmentApi, "definePackages").mockResolvedValue([]);

    render(<MemoryRouter initialEntries={["/shipments?shipmentId=shipment-1"]}><ShipmentPage/></MemoryRouter>);

    const lengthInput = await screen.findByLabelText("Uzunluk cm");
    await user.type(screen.getByLabelText("Genişlik cm"), "21");
    await user.type(screen.getByLabelText("Yükseklik cm"), "12.5");
    await user.type(screen.getByLabelText("Ağırlık g"), "500");
    const saveButton = screen.getByRole("button", { name: "Paketleri kaydet" });

    for (const invalidValue of ["0", "-1", "12.55"]) {
      await user.clear(lengthInput);
      await user.type(lengthInput, invalidValue);
      expect(saveButton).toBeDisabled();
    }
    expect(definePackages).not.toHaveBeenCalled();
  });

  it("cm hassasiyetini 0.1 adımla mm tam sayısına dönüştürür", () => {
    expect(centimetersToMillimeters("120")).toBe(1200);
    expect(centimetersToMillimeters("21")).toBe(210);
    expect(centimetersToMillimeters("12.5")).toBe(125);
    expect(centimetersToMillimeters("0")).toBeNull();
    expect(centimetersToMillimeters("-1")).toBeNull();
    expect(centimetersToMillimeters("12.55")).toBeNull();
  });

  it("liste item'ında Panel diagnostic alanlarını güvenli biçimde gösterir", async () => {
    vi.mocked(shipmentApi.list).mockResolvedValue([{ ...queue[0], state: "EXCEPTION", activeDiagnostic: {
      code: "PROVIDER_BOOKING_BLOCKED",
      stage: "provider",
      message: "Kargo sağlayıcı işlemi durdurdu. Operatör kontrolü gerekiyor.",
    } }]);

    render(<MemoryRouter initialEntries={["/shipments"]}><ShipmentPage/></MemoryRouter>);

    const warning = await screen.findByLabelText("Sevkiyat uyarısı");
    expect(warning).toHaveTextContent("Kargo Sağlayıcı");
    expect(warning).toHaveTextContent("PROVIDER_BOOKING_BLOCKED");
    expect(warning).toHaveTextContent("Kargo sağlayıcı işlemi durdurdu. Operatör kontrolü gerekiyor.");
  });

  it("shipment detail diagnostic card'ını gösterir", async () => {
    vi.mocked(shipmentApi.get).mockResolvedValue({ ...shipment, state: "EXCEPTION", activeDiagnostic: {
      code: "BOOKING_OUTCOME_UNCERTAIN",
      stage: "booking",
      message: "Kargo rezervasyon sonucu belirsiz. Otomatik yeniden deneme durduruldu.",
    } });

    render(<MemoryRouter initialEntries={["/shipments?shipmentId=shipment-1"]}><ShipmentPage/></MemoryRouter>);

    const diagnosticCard = await screen.findByLabelText("Aktif sevkiyat uyarısı");
    expect(diagnosticCard).toHaveTextContent("Kargo Rezervasyonu");
    expect(diagnosticCard).toHaveTextContent("BOOKING_OUTCOME_UNCERTAIN");
    expect(diagnosticCard).toHaveTextContent("Kargo rezervasyon sonucu belirsiz. Otomatik yeniden deneme durduruldu.");
  });

  it("diagnostic stage değerlerini Türkçe etiketlere map eder", () => {
    expect(shipmentDiagnosticStageLabel("tracking_outbound")).toBe("Kanal / Tracking");
    expect(shipmentDiagnosticStageLabel("provider")).toBe("Kargo Sağlayıcı");
    expect(shipmentDiagnosticStageLabel("booking")).toBe("Kargo Rezervasyonu");
    expect(shipmentDiagnosticStageLabel("label")).toBe("Etiket");
    expect(shipmentDiagnosticStageLabel("other")).toBe("Diğer");
  });

  it("yalnız LABEL_READY shipment'ları seçer ve partial sonucu gösterip başarısız seçimi korur", async () => {
    const user = userEvent.setup();
    vi.mocked(shipmentApi.list).mockResolvedValue(queue);
    const bulk = vi.spyOn(shipmentApi, "bulkHandoff").mockResolvedValue({
      results: [
        { shipmentId: "shipment-ready-1", orderNumber: "DS-1001", success: true, resultingState: "DISPATCHED" },
        { shipmentId: "shipment-ready-2", orderNumber: "DS-1002", success: false, resultingState: "LABEL_READY", errorCode: "SHIPMENT_STATE_INVALID", message: "Shipment sevke hazır değil." },
      ],
      summary: { requested: 2, dispatched: 1, failed: 1, alreadyProcessed: 0 },
    });

    render(<MemoryRouter initialEntries={["/shipments"]}><ShipmentPage/></MemoryRouter>);
    const first = await screen.findByRole("checkbox", { name: "DS-1001 sevkiyatını seç" });
    const second = screen.getByRole("checkbox", { name: "DS-1002 sevkiyatını seç" });
    expect(screen.queryByRole("checkbox", { name: "DS-1003 sevkiyatını seç" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sevkiyat uyarısı")).not.toBeInTheDocument();

    await user.click(first);
    await user.click(second);
    await user.type(screen.getByLabelText(/Ortak teslim kanıtı/), "dock-7");
    await user.click(screen.getByRole("button", { name: "Toplu Sevk" }));
    expect(screen.getByRole("dialog", { name: "Toplu fiziksel sevki onayla" })).toHaveTextContent("2 shipment");

    const confirm = screen.getByRole("button", { name: "Fiziksel teslimi onayla" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await screen.findByText("Başarılı: 1");
    expect(screen.getByText("Başarısız: 1")).toBeInTheDocument();
    expect(screen.getByText("Daha önce işlenmiş: 0")).toBeInTheDocument();
    expect(screen.getByText("Shipment sevke hazır değil.")).toBeInTheDocument();
    expect(bulk).toHaveBeenCalledTimes(1);
    expect(bulk).toHaveBeenCalledWith(expect.objectContaining({
      shipmentIds: ["shipment-ready-1", "shipment-ready-2"],
      evidenceReference: "dock-7",
    }), expect.stringMatching(/^warehouse-bulk-handoff:/));
    await waitFor(() => expect(first).not.toBeChecked());
    expect(second).toBeChecked();
  });

  it("shipping:dispatch yetkisi olmayan kullanıcıya bulk aksiyon ve seçim göstermez", async () => {
    permissionState.dispatch = false;
    vi.mocked(shipmentApi.list).mockResolvedValue(queue);
    render(<MemoryRouter initialEntries={["/shipments"]}><ShipmentPage/></MemoryRouter>);
    expect(await screen.findByText("DS-1001")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Toplu Sevk" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
