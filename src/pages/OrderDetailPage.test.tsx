import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { warehouseApi } from "../lib/api";
import { order, pickPlan } from "../test/fixtures";
import { OrderDetailPage } from "./OrderDetailPage";

describe("OrderDetailPage", () => {
  beforeEach(() => {
    vi.spyOn(warehouseApi, "getOrder").mockResolvedValue(order);
    vi.spyOn(warehouseApi, "getPickPlan").mockResolvedValue(pickPlan);
    vi.spyOn(warehouseApi, "startOrder").mockResolvedValue({ id: "order-1", order_code: "DS-1042", status: "Toplanıyor" });
  });

  it("detayı açar ve start çağrısından sonra pick ekranına yönlenir", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/orders/order-1"]}><Routes><Route path="/orders/:id" element={<OrderDetailPage/>}/><Route path="/orders/:id/pick" element={<div>Pick ekranı</div>}/></Routes></MemoryRouter>);
    expect(await screen.findByText("Raf bağlantı seti")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Toplamayı Başlat" }));
    expect(warehouseApi.startOrder).toHaveBeenCalledWith("order-1");
    expect(await screen.findByText("Pick ekranı")).toBeInTheDocument();
  });
});
