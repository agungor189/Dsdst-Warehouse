import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { warehouseApi } from "../lib/api";
import { pickPlan } from "../test/fixtures";
import { PickingPage } from "./PickingPage";

const renderPage = () => render(
  <MemoryRouter initialEntries={["/orders/order-1/pick"]}>
    <Routes>
      <Route path="/orders/:id/pick" element={<PickingPage/>}/>
      <Route path="/orders/:id/success" element={<div>Sipariş Toplandı</div>}/>
    </Routes>
  </MemoryRouter>,
);

describe("PickingPage", () => {
  beforeEach(() => {
    vi.spyOn(warehouseApi, "getPickPlan").mockResolvedValue(pickPlan);
    vi.spyOn(warehouseApi, "completeOrder").mockResolvedValue({ id: "order-1", order_code: "DS-1042", status: "Toplandı" });
  });

  it("yanlış SKU'da hata verir ve sonraki adıma geçmez", async () => {
    vi.spyOn(warehouseApi, "scan").mockResolvedValue({ product_id: "wrong", sku: "YANLIS-SKU", barcode: null, name: "Yanlış", warehouse_location: null, central_stock: 1, product_type: "simple" });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Lokasyondayım" }));
    await user.type(screen.getByLabelText("Barkod veya SKU okutun"), "YANLIS-SKU{enter}");
    expect(await screen.findByText(/YANLIŞ ÜRÜN/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Toplanan adet")).not.toBeInTheDocument();
  });

  it("doğru SKU, adet ve complete akışını tamamlar; erken complete çağırmaz", async () => {
    vi.spyOn(warehouseApi, "scan").mockResolvedValue({ product_id: "product-1", sku: "CS-R075-H2", barcode: "8690001", name: "Raf bağlantı seti", warehouse_location: "A1-K2-P3", central_stock: 12, product_type: "simple" });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Lokasyondayım" }));
    await user.type(screen.getByLabelText("Barkod veya SKU okutun"), "8690001{enter}");
    expect(await screen.findByText("Ürün doğrulandı")).toBeInTheDocument();
    expect(warehouseApi.completeOrder).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Toplanan adet"), "2");
    await user.click(screen.getByRole("button", { name: "Adedi Onayla" }));
    expect(await screen.findByText("Ürünler hazır")).toBeInTheDocument();
    expect(warehouseApi.completeOrder).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Siparişi Tamamla" }));
    await waitFor(() => expect(warehouseApi.completeOrder).toHaveBeenCalledWith("order-1"));
    expect(await screen.findByText("Sipariş Toplandı")).toBeInTheDocument();
  });
});
