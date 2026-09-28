import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shipmentApi, warehouseApi } from "../lib/api";
import { orderSummary } from "../test/fixtures";
import { OrdersPage } from "./OrdersPage";

describe("OrdersPage", () => {
  beforeEach(() => {
    vi.spyOn(warehouseApi, "listOrders").mockResolvedValue({ orders: [orderSummary], pagination: { page: 1, limit: 100, total: 1, total_pages: 1 } });
    vi.spyOn(warehouseApi, "listPickHistory").mockResolvedValue({ sessions: [{
      id: "pick-1", pick_number: "PICK-1", order_id: "done-1", order_code: "DS-1041", external_order_id: null,
      status: "PICKED", started_by: { user_id: "u-1", name: "Alper" }, completed_by: { user_id: "u-1", name: "Alper" },
      started_at: "2026-09-28T08:00:00Z", completed_at: "2026-09-28T08:10:00Z", total_product_types: 1,
      total_sale_product_quantity: 1, total_physical_item_quantity: 1, total_net_weight_g: 100, note: null,
      created_at: "2026-09-28T08:00:00Z", updated_at: "2026-09-28T08:10:00Z",
    }], pagination: { page: 1, limit: 100, total: 1, total_pages: 1 }, summary: {
      completed_pick_count: 1, total_sale_product_quantity: 1, total_physical_item_quantity: 1, total_net_weight_g: 100, by_user: [],
    }, users: [] });
    vi.spyOn(shipmentApi, "list").mockResolvedValue([{ id: "ship-1", orderId: "packed-1", orderNumber: "DS-1040", sourceChannel: "Direct",
      reservationId: "res-1", state: "LABEL_READY", packageCount: 1, customerName: "Müşteri", createdAt: "2026-09-28T08:00:00Z", updatedAt: "2026-09-28T09:00:00Z" }]);
  });

  it("günlük tamamlanacak ve tamamlanan toplama, paketleme ve sevkiyat işlerini birlikte gösterir", async () => {
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Bugünün işleri" })).toBeInTheDocument();
    expect(screen.getByText("Toplanacak")).toBeInTheDocument();
    expect(screen.getByText("Toplandı")).toBeInTheDocument();
    expect(screen.getByText("Sevke hazır")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bugün tamamlanan" })).toBeInTheDocument();
  });

  it("sipariş listesini kartlarda gösterir", async () => {
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    expect(await screen.findByText("DS-1042")).toBeInTheDocument();
    expect(screen.getByText("Ayşe Yılmaz")).toBeInTheDocument();
    expect(screen.getAllByText("Hazırlanıyor")).toHaveLength(2);
  });

  it("manuel yenileme 100 siparişlik kuyruğu tekrar getirir", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    await screen.findByText("DS-1042");
    await user.click(screen.getByRole("button", { name: "Listeyi yenile" }));
    expect(warehouseApi.listOrders).toHaveBeenLastCalledWith(1, 100);
  });
});
