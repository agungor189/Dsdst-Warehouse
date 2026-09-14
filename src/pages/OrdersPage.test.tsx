import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { warehouseApi } from "../lib/api";
import { orderSummary } from "../test/fixtures";
import { OrdersPage } from "./OrdersPage";

describe("OrdersPage", () => {
  beforeEach(() => {
    vi.spyOn(warehouseApi, "listOrders").mockResolvedValue({ orders: [orderSummary], pagination: { page: 1, limit: 25, total: 1, total_pages: 1 } });
  });

  it("sipariş listesini kartlarda gösterir", async () => {
    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    expect(await screen.findByText("DS-1042")).toBeInTheDocument();
    expect(screen.getByText("Ayşe Yılmaz")).toBeInTheDocument();
    expect(screen.getAllByText("Hazırlanıyor")).toHaveLength(2);
  });
});
