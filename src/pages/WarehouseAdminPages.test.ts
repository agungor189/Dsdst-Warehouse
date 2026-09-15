import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listReceivingSessions: vi.fn(), getMyActiveReceivingPackage: vi.fn(), getReceivingSession: vi.fn(), listMyReceivingPackages: vi.fn(),
}));

vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", username: "Alper", role: "user", permissions: { "warehouse:receive": true } } }),
  hasWarehousePermission: (_user: unknown, permission: string) => permission === "warehouse:receive",
}));
vi.mock("../lib/api", () => ({
  ApiError: class ApiError extends Error { constructor(message: string, public status?: number, public code?: string) { super(message); } },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Hata",
  warehouseAdminApi: api,
}));

import { formatReceivingEvent, InboundPage, requestReceivingLocationWithRetry } from "./WarehouseAdminPages";

describe("Mal Kabul kullanıcı akışı", () => {
  beforeEach(() => {
    api.listReceivingSessions.mockReset().mockResolvedValue([]);
    api.getMyActiveReceivingPackage.mockReset().mockResolvedValue(null);
    api.getReceivingSession.mockReset();
    api.listMyReceivingPackages.mockReset();
  });
  it("manuel lokasyon öner butonu içermez ve planlı rafı otomatik yükler", () => {
    const source = InboundPage.toString();
    expect(source).not.toContain("Lokasyon öner");
    expect(source).toContain("Planlanan lokasyon yükleniyor");
    expect(source).toContain("Yerleştirilecek Raf");
    expect(source).toContain("Benim Yerleştirdiklerim");
    expect(source).toContain("warehouse:manage_receiving_sessions");
    expect(source).toContain("receivingBusinessErrors");
    expect(source).not.toContain("event.device_id");
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

  it("Benim Yerleştirdiklerim kartından salt-okunur görsel ve paket detayını açar", async () => {
    const session = {
      id: "session-1", lot_number: "DSDST-2609", receiving_state: "active", status: "RECEIVING",
      expected_package_count: 2, expected_unit_count: 10, placed_count: 1, lines: [], supplier_codes: ["SUP-1"], events: [],
      progress: { sku_count: 1, total_packages: 2, placed_packages: 1, remaining_packages: 1, percent: 50 },
    };
    const placed = {
      package_id: "package-1", package_code: "PKG-1", product_id: "product-1", sku: "PCI-R100-ELB",
      product_name: "Dirsek", supplier_no: "SUP-1", lot_number: "DSDST-2609", package_number: 1,
      total_packages: 2, quantity: 5, package_weight_kg: 2.5, image_path_snapshot: "/uploads/product.jpg",
      image_url: "/api/products/product-1/image", location_code: "A3-K2-P5", placed_at: "2026-09-15T15:42:00Z", placed_by_username: "Alper",
    };
    api.listReceivingSessions.mockResolvedValue([session]);
    api.getReceivingSession.mockResolvedValue(session);
    api.listMyReceivingPackages.mockResolvedValue([placed]);
    const user = userEvent.setup();
    render(createElement(InboundPage));
    expect(screen.queryByRole("heading", { name: "Yeni Mal Kabul Başlat" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /DSDST-2609/ }));
    await user.click(await screen.findByRole("button", { name: /PCI-R100-ELB/ }));
    expect(await screen.findByRole("dialog", { name: "Yerleştirilen paket detayı" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Dirsek" })).toHaveAttribute("src", "/api/products/product-1/image");
    expect(screen.getByText("PKG-1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /yerleştir/i })).not.toBeInTheDocument();
  });
});
