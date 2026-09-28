import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shipmentApi, warehouseApi } from "../lib/api";
import { AnalyticsPage } from "./AnalyticsPage";

describe("AnalyticsPage", () => {
  beforeEach(() => {
    vi.spyOn(warehouseApi, "listOrders").mockResolvedValue({ orders: [], pagination: { page: 1, limit: 100, total: 0, total_pages: 0 } });
    vi.spyOn(warehouseApi, "listPickHistory").mockResolvedValue({ sessions: [], pagination: { page: 1, limit: 100, total: 0, total_pages: 0 }, summary: {
      completed_pick_count: 4, total_sale_product_quantity: 8, total_physical_item_quantity: 12, total_net_weight_g: 2400, by_user: [],
    }, users: [] });
    vi.spyOn(shipmentApi, "list").mockResolvedValue([]);
  });

  it("günlük, haftalık ve aylık dönemlerle sipariş arama ve küçük operasyon raporu sunar", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AnalyticsPage/></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Operasyon analizi" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Günlük" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Haftalık" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aylık" })).toBeInTheDocument();
    expect(screen.getByLabelText("Sipariş ara")).toBeInTheDocument();
    expect(await screen.findByText("4")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Haftalık" }));
    await waitFor(() => expect(warehouseApi.listPickHistory).toHaveBeenCalledTimes(2));
  });
});
