import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, warehouseApi } from "../lib/api";
import { pickPlan } from "../test/fixtures";
import { PickingPage } from "./PickingPage";

const renderPage = () => render(
  <MemoryRouter initialEntries={["/orders/order-1/pick"]}>
    <Routes>
      <Route path="/orders/:id/pick" element={<PickingPage/>}/>
      <Route path="/orders/:id/success" element={<div>Tüm bekleyen siparişler tamamlandı.</div>}/>
      <Route path="/orders/:id" element={<div>Sıradaki sipariş detayı</div>}/>
    </Routes>
  </MemoryRouter>,
);

describe("PickingPage", () => {
  beforeEach(() => {
    vi.spyOn(warehouseApi, "getPickPlan").mockResolvedValue(structuredClone(pickPlan));
    vi.spyOn(warehouseApi, "verifyPick").mockResolvedValue({ product_id: "product-1", match_type: "barcode", verified: true });
    vi.spyOn(warehouseApi, "completePickItem").mockResolvedValue({});
    vi.spyOn(warehouseApi, "completeOrder").mockResolvedValue({ ...pickPlan.order, status: "Toplandı" });
    vi.spyOn(warehouseApi, "listOrders").mockResolvedValue({ orders: [], pagination: { page: 1, limit: 1, total: 0, total_pages: 0 } });
  });

  it("tek alanda lokasyon, barkod veya SKU doğrulaması ister", async () => {
    renderPage();
    expect(await screen.findByLabelText("Lokasyon / Barkod / SKU okutun")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Lokasyondayım" })).not.toBeInTheDocument();
  });

  it("yanlış kodda sunucu mesajını gösterir ve adet aşamasına geçmez", async () => {
    vi.mocked(warehouseApi.verifyPick).mockRejectedValue(new ApiError("YANLIŞ ÜRÜN / YANLIŞ LOKASYON", 409, "PICK_CODE_MISMATCH"));
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText("Lokasyon / Barkod / SKU okutun"), "YANLIS{enter}");
    expect(await screen.findByText("YANLIŞ ÜRÜN / YANLIŞ LOKASYON")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Toplanan adet/)).not.toBeInTheDocument();
  });

  it("doğru koddan sonra eksik adedi reddeder ve sunucuya göndermez", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText("Lokasyon / Barkod / SKU okutun"), "A1-K2-P3{enter}");
    await user.type(await screen.findByLabelText(/Toplanan adet/), "1");
    await user.click(screen.getByRole("button", { name: "Adedi Onayla" }));
    expect(await screen.findByText(/Eksik adet/)).toBeInTheDocument();
    expect(warehouseApi.completePickItem).not.toHaveBeenCalled();
  });

  it("doğru kod ve tam adedi sunucuya kaydetmeden sonraki adıma geçmez", async () => {
    let resolveSave!: (value: Record<string, unknown>) => void;
    vi.mocked(warehouseApi.completePickItem).mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));
    const user = userEvent.setup();
    renderPage();
    await user.type(await screen.findByLabelText("Lokasyon / Barkod / SKU okutun"), "8690001{enter}");
    await user.type(await screen.findByLabelText(/Toplanan adet/), "2");
    await user.click(screen.getByRole("button", { name: "Adedi Onayla" }));
    expect(screen.getByText("Kaydediliyor...")).toBeInTheDocument();
    expect(warehouseApi.getPickPlan).toHaveBeenCalledTimes(1);
    resolveSave({});
    await waitFor(() => expect(warehouseApi.getPickPlan).toHaveBeenCalledTimes(2));
  });

  it("tamamlanmış planı kapatır ve kuyruk boşsa başarı ekranına gider", async () => {
    vi.mocked(warehouseApi.getPickPlan).mockResolvedValue({
      ...structuredClone(pickPlan),
      items: [{ ...structuredClone(pickPlan.items[0]), picked_quantity: 2, completed_at: "2026-09-14T10:00:00Z" }],
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Siparişi Tamamla" }));
    await waitFor(() => expect(warehouseApi.completeOrder).toHaveBeenCalledWith("order-1"));
    expect(warehouseApi.listOrders).toHaveBeenCalledWith(1, 1);
    expect(await screen.findByText("Tüm bekleyen siparişler tamamlandı.")).toBeInTheDocument();
  });

  it("sipariş tamamlanınca varsa sıradaki sipariş detayına gider", async () => {
    vi.mocked(warehouseApi.getPickPlan).mockResolvedValue({
      ...structuredClone(pickPlan),
      items: [{ ...structuredClone(pickPlan.items[0]), picked_quantity: 2, completed_at: "2026-09-14T10:00:00Z" }],
    });
    vi.mocked(warehouseApi.listOrders).mockResolvedValue({
      orders: [{ id: "order-2", order_code: "DS-1043", platform: null, customer: null, total_quantity: 1, status: "Hazırlanıyor", created_at: "2026-09-14", picker: null }],
      pagination: { page: 1, limit: 1, total: 1, total_pages: 1 },
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Siparişi Tamamla" }));
    expect(await screen.findByText("Sıradaki sipariş detayı")).toBeInTheDocument();
  });
});
