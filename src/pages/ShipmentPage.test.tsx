import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ShipmentPage from "./ShipmentPage";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
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

describe("Fulfillment mobile flow", () => {
  beforeEach(() => {
    api.list.mockReset().mockResolvedValue([{ id: detail.id, orderId: detail.orderId, orderNumber: detail.orderNumber,
      sourceChannel: detail.sourceChannel, reservationId: detail.reservationId, state: detail.state, packageCount: 0,
      customerName: "Arda Gungor", createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z" }]);
    api.get.mockReset().mockResolvedValue(detail);
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
});
