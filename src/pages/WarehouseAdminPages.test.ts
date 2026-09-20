import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listReceivingSessions: vi.fn(), getMyActiveReceivingPackage: vi.fn(), getReceivingSession: vi.fn(), listMyReceivingPackages: vi.fn(),
  receiveGoods: vi.fn(),
}));

vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", username: "Alper", role: "user", permissions: { "warehouse:receive": true } } }),
  hasWarehousePermission: (_user: unknown, permission: string) => permission === "warehouse:receive",
}));
vi.mock("../lib/api", () => ({
  ApiError: class ApiError extends Error { constructor(message: string, public status?: number, public code?: string) { super(message); } },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Hata",
  warehouseAdminApi: api,
  warehouseExecutionApi: { receiveGoods: api.receiveGoods },
}));

import { formatReceivingEvent, InboundPage, ReplenishmentPage, requestReceivingLocationWithRetry } from "./WarehouseAdminPages";

describe("Mal Kabul kullanıcı akışı", () => {
  beforeEach(() => {
    api.listReceivingSessions.mockReset().mockResolvedValue([]);
    api.getMyActiveReceivingPackage.mockReset().mockResolvedValue(null);
    api.getReceivingSession.mockReset();
    api.listMyReceivingPackages.mockReset();
    api.receiveGoods.mockReset();
  });
  it("yalnız V2-08 receipt komutunu kullanır ve partial policy'yi kapalı tutar", () => {
    const source = InboundPage.toString();
    expect(source).toContain("warehouseExecutionApi.receiveGoods");
    expect(source).toContain("stageIndex: 1");
    expect(source).toContain("isFinal: true");
    expect(source).not.toContain("startReceivingSession");
    expect(source).not.toContain("completeReceivingSession");
  });

  it("ikmal ekranı bekleyen görevleri listeler ve kaynak paket ile hedef lokasyonu sırayla tarar", () => {
    const source = ReplenishmentPage.toString();
    expect(source).toContain("listReplenishmentTasks");
    expect(source).toContain("completeReplenishment");
    expect(source).toContain("scannedSource");
    expect(source).toContain("scanDestination");
  });

  it("geçici lokasyon hatasını 1 ve 2 saniyelik kontrollü beklemelerle tekrar dener", async () => {
    const request = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValue({ code: "A3-K2-P5" });
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(requestReceivingLocationWithRetry(request, wait)).resolves.toEqual({ code: "A3-K2-P5" });
    expect(request).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[1_000], [2_000]]);
  });

  it("business lokasyon hatasını tekrar denemeden kullanıcıya bırakır", async () => {
    const request = vi.fn().mockRejectedValue(new (await import("../lib/api")).ApiError("Raf dolu", 409, "PLANNED_LOCATION_FULL"));
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(requestReceivingLocationWithRetry(request, wait)).rejects.toMatchObject({ code: "PLANNED_LOCATION_FULL" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("teknik event adlarını kullanıcı dostu Türkçe hareketlere çevirir", () => {
    expect(formatReceivingEvent({
      event_type: "PACKAGE_PLACED", actor_username: "Alper", sku_snapshot: "PCI-R100-ELB",
      package_number: 2, total_packages: 4, location_code: "A3-K2-P5",
    })).toBe("Alper, PCI-R100-ELB 2/4 paketini A3-K2-P5 rafına yerleştirdi.");
    expect(formatReceivingEvent({ event_type: "LABEL_PRINTED", sku_snapshot: "PCI-R100-ELB", package_number: 2, total_packages: 4 }))
      .toBe("PCI-R100-ELB 2/4 etiketi basıldı.");
  });

  it("snapshot, gerçek kabul ve hasarlı miktarı tek aşamalı kanonik komuta gönderir", async () => {
    api.receiveGoods.mockResolvedValue({
      id: "receipt-1", status: "ACCEPTED_WITH_VARIANCE", acceptedQuantityBaseInt: 8,
      damagedQuantityBaseInt: 2, shortageQuantityBaseInt: 2, excessQuantityBaseInt: 0,
      packages: [{ id: "package-1", code: "PKG-1", receiptId: "receipt-1", inventoryLotId: "lot-1", productId: "product-1", supplierLotCode: "LOT-1", purchaseOrderId: "po-1", purchaseLineId: "line-1", costSnapshotId: "snapshot-1", baseUomCode: "piece", initialQuantityBaseInt: 8, remainingQuantityBaseInt: 8, targetQuantityBaseInt: 8, weightGrams: 0, disposition: "ACCEPTED", labelIdentity: null, status: "RECEIVED", currentSlotId: null, currentLocationCode: null }],
    });
    const user = userEvent.setup();
    render(createElement(InboundPage));
    await user.type(screen.getByPlaceholderText("V2-06 maliyet snapshot ID"), "snapshot-1");
    await user.type(screen.getByPlaceholderText("Tedarikçi lotu"), "LOT-1");
    await user.type(screen.getByPlaceholderText("Paket kodu"), "PKG-1");
    const quantities = screen.getAllByRole("spinbutton");
    await user.clear(quantities[0]); await user.type(quantities[0], "8");
    await user.clear(quantities[1]); await user.type(quantities[1], "2");
    await user.click(screen.getByRole("button", { name: "Kabulü kaydet ve paket oluştur" }));
    expect(api.receiveGoods).toHaveBeenCalledOnce();
    expect(api.receiveGoods.mock.calls[0][0]).toMatchObject({ costSnapshotId: "snapshot-1", supplierLotCode: "LOT-1", stageIndex: 1, isFinal: true, acceptedQuantityBaseInt: 8, damagedQuantityBaseInt: 2 });
    expect(api.receiveGoods.mock.calls[0][0].packages).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "PKG-1", quantityBaseInt: 8, disposition: "ACCEPTED" }),
      expect.objectContaining({ code: "PKG-1-DAMAGED", quantityBaseInt: 2, disposition: "DAMAGED" }),
    ]));
    expect(await screen.findByText(/8 kullanılabilir, 2 karantina/)).toBeInTheDocument();
    expect(screen.getByText("PKG-1")).toBeInTheDocument();
  });
});
