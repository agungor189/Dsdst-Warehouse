import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { warehouseApi } from "../lib/api";
import { orderSummary } from "../test/fixtures";
import type { WarehouseOrderSummary } from "../types/warehouse";
import { HomePage } from "./HomePage";

vi.mock("../features/auth/AuthContext", () => ({
  hasWarehousePermission: (_user: unknown, permission: string) => permission === "warehouse:pick_orders",
  useAuth: () => ({
    user: { id: "user-1", username: "Alper Güngör", role: "operator", permissions: { "warehouse:pick_orders": true } },
  }),
}));

const normalOrder = { ...orderSummary, item_count: 2, has_assembly: false } as WarehouseOrderSummary;
const assemblyOrder = {
  ...orderSummary,
  id: "order-2",
  order_code: "DS-1043",
  customer: "Merve Aksoy",
  item_count: 3,
  has_assembly: true,
} as WarehouseOrderSummary;

describe("HomePage mobile foundation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(warehouseApi, "listOrders").mockResolvedValue({
      orders: [normalOrder, assemblyOrder],
      pagination: { page: 1, limit: 100, total: 2, total_pages: 1 },
    });
  });

  it("bekleyen toplama sayısını gerçek pagination toplamından gösterir ve Mal Kabul sunmaz", async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    expect(await screen.findByText("Depoda 2 işlem bekliyor.")).toBeInTheDocument();
    expect(screen.getByTestId("picking-order-count")).toHaveTextContent("2");
    expect(screen.queryByText("Mal Kabul")).not.toBeInTheDocument();
  });

  it("toplama kuyruğunu bottom sheet olarak açar, canonical rozetleri gösterir ve kapatır", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    await screen.findByText("Depoda 2 işlem bekliyor.");

    await user.click(screen.getByRole("button", { name: /Toplama kuyruğunu aç/i }));
    const dialog = screen.getByRole("dialog", { name: "Toplanacak Siparişler" });
    expect(within(dialog).getByText("2 sipariş")).toBeInTheDocument();
    expect(within(dialog).getByText("2 ürün toplanacak")).toBeInTheDocument();
    expect(within(dialog).getByText("3 ürün toplanacak")).toBeInTheDocument();
    expect(within(dialog).getByText("ASSEMBLY")).toBeInTheDocument();
    expect(within(dialog).queryByText("KIT")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Kapat" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("yalnızca canonical published-kit işareti olan siparişte KIT rozeti gösterir", async () => {
    const kitOrder = {
      ...normalOrder,
      id: "order-kit",
      order_code: "DS-KIT",
      customer: "Kit Müşterisi",
      has_kit: true,
    };
    vi.spyOn(warehouseApi, "listOrders").mockResolvedValueOnce({
      orders: [normalOrder, kitOrder],
      pagination: { page: 1, limit: 100, total: 2, total_pages: 1 },
    });
    const user = userEvent.setup();
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    await screen.findByText("Depoda 2 işlem bekliyor.");
    await user.click(screen.getByRole("button", { name: /Toplama kuyruğunu aç/i }));

    const normalRow = screen.getByRole("link", { name: /DS-1042/ });
    const kitRow = screen.getByRole("link", { name: /DS-KIT/ });
    expect(within(normalRow).queryByText("KIT")).not.toBeInTheDocument();
    expect(within(normalRow).queryByText("ASSEMBLY")).not.toBeInTheDocument();
    expect(within(kitRow).getByText("KIT")).toBeInTheDocument();
  });

  it("API hatasını erişilebilir durumda gösterir", async () => {
    vi.spyOn(warehouseApi, "listOrders").mockRejectedValueOnce(new Error("Panel erişilemiyor"));
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Panel erişilemiyor");
  });
});
