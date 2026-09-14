import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { warehouseApi } from "../lib/api";
import { order, pickPlan } from "../test/fixtures";
import { OrderDetailPage } from "./OrderDetailPage";

vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1", username: "Alper", role: "admin", must_change_password: false } }),
}));

describe("OrderDetailPage", () => {
  beforeEach(() => {
    vi.spyOn(warehouseApi, "getOrder").mockResolvedValue(order);
    vi.spyOn(warehouseApi, "getPickPlan").mockResolvedValue(pickPlan);
    vi.spyOn(warehouseApi, "startOrder").mockResolvedValue({ id: "order-1", order_code: "DS-1042", status: "Toplanıyor", picker: null });
  });

  it("detayı açar ve start çağrısından sonra pick ekranına yönlenir", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/orders/order-1"]}><Routes><Route path="/orders/:id" element={<OrderDetailPage/>}/><Route path="/orders/:id/pick" element={<div>Pick ekranı</div>}/></Routes></MemoryRouter>);
    expect(await screen.findByText("Raf bağlantı seti")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Toplamayı Başlat" }));
    expect(warehouseApi.startOrder).toHaveBeenCalledWith("order-1");
    expect(await screen.findByText("Pick ekranı")).toBeInTheDocument();
  });

  it("stok eksiği varsa toplamayı başlatmayı engeller", async () => {
    vi.mocked(warehouseApi.getPickPlan).mockResolvedValue({
      ...pickPlan,
      shortages: [{ product_id: "product-1", sku: "CS-R075-H2", required_quantity: 2, central_stock: 1, shortage_quantity: 1 }],
    });
    render(<MemoryRouter initialEntries={["/orders/order-1"]}><Routes><Route path="/orders/:id" element={<OrderDetailPage/>}/></Routes></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Toplamayı Başlat" })).toBeDisabled();
  });

  it("başka kullanıcıya kilitli siparişte açıklama gösterir", async () => {
    vi.mocked(warehouseApi.getOrder).mockResolvedValue({ ...order, status: "Toplanıyor", picker: { user_id: "user-2", name: "Ayşe", started_at: "2026-09-14" } });
    render(<MemoryRouter initialEntries={["/orders/order-1"]}><Routes><Route path="/orders/:id" element={<OrderDetailPage/>}/></Routes></MemoryRouter>);
    expect(await screen.findByText("Bu sipariş Ayşe tarafından toplanıyor.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toplamaya Devam Et" })).toBeDisabled();
  });
});
