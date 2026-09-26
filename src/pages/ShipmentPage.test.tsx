import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shipmentApi } from "../lib/api";
import type { ShipmentV1 } from "../types/warehouse";
import ShipmentPage from "./ShipmentPage";

vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", username: "Alper", role: "admin", permissions: {} } }),
  hasWarehousePermission: () => true,
}));

const shipment: ShipmentV1 = {
  id: "shipment-1", orderId: "order-1", orderNumber: "DS-1042", sourceChannel: "TRENDYOL",
  reservationId: "reservation-1", state: "LABEL_READY", packageCount: 1,
  requiredContents: [{ productId: "product-1", sku: "SKU-1", title: "Raf seti", quantityBaseInt: 1, baseUomCode: "piece" }],
  recipient: { name: "Ayşe", email: "ayse@example.com", phone: null, address1: "Adres", address2: null, countryCode: "TR", cityName: "İstanbul", cityCode: "34", districtName: "Kadıköy", districtID: null, zip: null },
  packages: [{ id: "package-1", packageNumber: 1, measurementSource: "MEASURED", dimensionsMm: { length: 100, width: 100, height: 100 }, weightGrams: 500, contents: [{ productId: "product-1", quantityBaseInt: 1 }], booking: { providerShipmentId: "provider-1", providerTransactionId: null, barcode: null, carrierCode: "carrier", serviceCode: "service", trackingNumber: "TRACK-1", trackingUrl: null }, label: null }],
  carrierSelection: null, handedOffAt: null, dispatchedAt: null,
};

describe("ShipmentPage", () => {
  beforeEach(() => {
    vi.spyOn(shipmentApi, "get").mockResolvedValue(structuredClone(shipment));
  });

  it("query'deki shipment'ı yükler ve mevcut operasyon aksiyonlarını gösterir", async () => {
    render(<MemoryRouter initialEntries={["/shipments?shipmentId=shipment-1"]}><ShipmentPage/></MemoryRouter>);
    expect(await screen.findByText("DS-1042")).toBeInTheDocument();
    expect(screen.getByText("LABEL_READY")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fiziksel teslimi doğrula" })).toBeDisabled();
    expect(shipmentApi.get).toHaveBeenCalledWith("shipment-1");
  });
});
