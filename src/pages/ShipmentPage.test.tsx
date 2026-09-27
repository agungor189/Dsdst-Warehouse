import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShipmentPage from "./ShipmentPage";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  loadGeliverOffers: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  shipmentApi: api,
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
  requiredContents: [{ productId: "p-1", sku: "DSDST-4Y-7KQ30", title: "3 Yollu - 30mm", quantityBaseInt: 18, baseUomCode: "piece" }],
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

describe("Fulfillment mobile flow", () => {
  beforeEach(() => {
    api.list.mockReset().mockResolvedValue([{ id: detail.id, orderId: detail.orderId, orderNumber: detail.orderNumber,
      sourceChannel: detail.sourceChannel, reservationId: detail.reservationId, state: detail.state, packageCount: 0,
      customerName: "Arda Gungor", createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z" }]);
    api.get.mockReset().mockResolvedValue(detail);
    api.loadGeliverOffers.mockReset().mockResolvedValue([]);
  });

  it("toplaması tamamlanan siparişleri platform, müşteri, satır ve adet özetiyle paketleme kuyruğunda gösterir", async () => {
    render(<MemoryRouter><ShipmentPage/></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Paketleme" })).toBeInTheDocument();
    expect(await screen.findByText("SHOPIFY")).toBeInTheDocument();
    expect(screen.getByText("Arda Gungor")).toBeInTheDocument();
    expect(screen.getByText("1 ürün · 18 adet")).toBeInTheDocument();
  });

  it("paket hazırlamada standart koli seçimi ölçüleri getirir ve çoklu koli eklenebilir", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/shipments?shipmentId=ship-1"]}><ShipmentPage/></MemoryRouter>);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("ship-1"));
    await user.click(await screen.findByRole("button", { name: /Orta/ }));
    expect(screen.getByLabelText("Uzunluk (cm)")).toHaveValue("40");
    expect(screen.getByLabelText("Genişlik (cm)")).toHaveValue("30");
    expect(screen.getByLabelText("Yükseklik (cm)")).toHaveValue("25");
    await user.click(screen.getByRole("button", { name: "Paket ekle" }));
    expect(screen.getByText(/Paket 2/i)).toBeInTheDocument();
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
    expect(screen.getByRole("alert")).toHaveTextContent("ilçe");
    expect(screen.getByRole("alert")).toHaveTextContent("canonical sipariş kaydını düzeltin");
    expect(screen.queryByText("Alıcı adresi")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Geliver Kargo Tekliflerini Getir" })).toBeDisabled();
  });
});
