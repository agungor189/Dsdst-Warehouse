import { beforeEach, describe, expect, it, vi } from "vitest";
import { warehouseApi } from "./api";
import { order, orderSummary, pickPlan } from "../test/fixtures";

const response = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
}));

describe("Warehouse API client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("sipariş listesini aynı origin /api yolundan ve anahtarsız getirir", async () => {
    vi.mocked(fetch).mockImplementation(() => response({ success: true, data: [orderSummary], pagination: { page: 1, limit: 100, total: 1, total_pages: 1 } }));
    const result = await warehouseApi.listOrders();
    expect(result.orders[0].order_code).toBe("DS-1042");
    expect(fetch).toHaveBeenCalledWith("/api/orders?page=1&limit=100", expect.objectContaining({
      headers: expect.not.objectContaining({ "x-api-key": expect.anything() }),
    }));
  });

  it("verify-pick body içinde yalnız ürün ve kodu gönderir", async () => {
    vi.mocked(fetch).mockImplementation(() => response({ success: true, data: { product_id: "product-1", match_type: "location", verified: true } }));
    await warehouseApi.verifyPick("order-1", "product-1", "A1-K2-P3");
    expect(fetch).toHaveBeenCalledWith("/api/orders/order-1/verify-pick", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ product_id: "product-1", code: "A1-K2-P3" }),
    }));
  });

  it("sipariş detayı ve pick planını getirir", async () => {
    vi.mocked(fetch)
      .mockImplementationOnce(() => response({ success: true, data: order }))
      .mockImplementationOnce(() => response({ success: true, data: pickPlan }));
    await expect(warehouseApi.getOrder("order-1")).resolves.toMatchObject({ order_code: "DS-1042" });
    await expect(warehouseApi.getPickPlan("order-1")).resolves.toMatchObject({ items: [{ sku: "CS-R075-H2" }] });
  });

  it("start çağrısını POST ile gönderir", async () => {
    vi.mocked(fetch).mockImplementation(() => response({ success: true, data: { id: "order-1", order_code: "DS-1042", status: "Toplanıyor" } }));
    await warehouseApi.startOrder("order-1");
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/orders/order-1/start"), expect.objectContaining({ method: "POST" }));
  });

  it("API offline olduğunda net panel bağlantısı hatası verir", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));
    await expect(warehouseApi.listOrders()).rejects.toThrow("Panel bağlantısı yok");
  });

  it("çevrimdışıyken complete yazma çağrısını fetch öncesinde engeller", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(warehouseApi.completeOrder("order-1")).rejects.toMatchObject({ code: "OFFLINE" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("toplama geçmişi filtrelerini aynı-origin BFF rotasına taşır", async () => {
    vi.mocked(fetch).mockImplementation(() => response({
      success: true,
      data: [],
      pagination: { page: 1, limit: 100, total: 0, total_pages: 0 },
      summary: { completed_pick_count: 0, total_sale_product_quantity: 0, total_physical_item_quantity: 0, total_net_weight_g: 0, by_user: [] },
      filters: { users: [] },
    }));
    await warehouseApi.listPickHistory({
      date_from: "2026-09-15T00:00:00.000Z",
      date_to: "2026-09-16T00:00:00.000Z",
      summary_from: "2026-09-15T00:00:00.000Z",
      summary_to: "2026-09-16T00:00:00.000Z",
      sku: "KIT-001",
    });
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/^\/api\/pick-history\?.*sku=KIT-001/), expect.anything());
  });

  it("tamamlama notunu JSON body ile gönderir", async () => {
    vi.mocked(fetch).mockImplementation(() => response({ success: true, data: { ...pickPlan.order, status: "Toplandı" } }));
    await warehouseApi.completeOrder("order-1", "Kırılabilir");
    expect(fetch).toHaveBeenCalledWith("/api/orders/order-1/complete", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ note: "Kırılabilir" }),
    }));
  });
});
