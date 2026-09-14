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
    vi.mocked(fetch).mockImplementation(() => response({ success: true, data: [orderSummary], pagination: { page: 1, limit: 25, total: 1, total_pages: 1 } }));
    const result = await warehouseApi.listOrders();
    expect(result.orders[0].order_code).toBe("DS-1042");
    expect(fetch).toHaveBeenCalledWith("/api/orders?page=1&limit=25", expect.objectContaining({
      headers: expect.not.objectContaining({ "x-api-key": expect.anything() }),
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
});
