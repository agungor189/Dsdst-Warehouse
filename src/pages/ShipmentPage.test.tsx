import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shipmentApi } from "../lib/api";
import type { ShipmentSummaryV1, ShipmentV1 } from "../types/warehouse";
import ShipmentPage from "./ShipmentPage";

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
  packages: [{ id: "package-1", packageNumber: 1, measurementSource: "MEASURED", dimensionsMm: { length: 100, width: 100, height: 100 }, weightGrams: 500, contents: [{ productId: "product-1", quantityBaseInt: 1 }], booking: { providerShipmentId: "provider-1", providerTransactionId: null, barcode: null, carrierCode: "carrier", serviceCode: "service", trackingNumber: "TRACK-1", trackingUrl: null }, label: null }],
  carrierSelection: null, handedOffAt: null, dispatchedAt: null,
};

const queue: ShipmentSummaryV1[] = [
  { id: "shipment-ready-1", orderId: "order-1", orderNumber: "DS-1001", sourceChannel: "SHOPIFY", reservationId: "reservation-1", state: "LABEL_READY", packageCount: 1, customerName: "Ayşe", createdAt: "2026-09-26T08:00:00.000Z", updatedAt: "2026-09-26T08:00:00.000Z" },
  { id: "shipment-ready-2", orderId: "order-2", orderNumber: "DS-1002", sourceChannel: "TRENDYOL", reservationId: "reservation-2", state: "LABEL_READY", packageCount: 2, customerName: "Bora", createdAt: "2026-09-26T08:00:00.000Z", updatedAt: "2026-09-26T08:00:00.000Z" },
  { id: "shipment-preparing", orderId: "order-3", orderNumber: "DS-1003", sourceChannel: "PANEL", reservationId: "reservation-3", state: "PREPARING", packageCount: 1, customerName: "Cem", createdAt: "2026-09-26T08:00:00.000Z", updatedAt: "2026-09-26T08:00:00.000Z" },
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
    expect(screen.getByRole("button", { name: "Fiziksel teslimi doğrula" })).toBeDisabled();
    expect(shipmentApi.get).toHaveBeenCalledWith("shipment-1");
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
