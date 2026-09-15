import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { warehouseApi } from "../lib/api";
import type { PickSessionDetail, PickSessionSummary } from "../types/warehouse";
import { PickHistoryPage } from "./PickHistoryPage";

const session: PickSessionSummary = {
  id: "pick-1",
  pick_number: "PICK-000124",
  order_id: "order-1",
  order_code: "DS-1042",
  external_order_id: null,
  status: "PICKED",
  started_by: { user_id: "user-1", name: "Alper" },
  completed_by: { user_id: "user-1", name: "Alper" },
  started_at: "2026-09-15T10:00:00Z",
  completed_at: "2026-09-15T10:32:00Z",
  total_product_types: 1,
  total_sale_product_quantity: 2,
  total_physical_item_quantity: 18,
  total_net_weight_g: 9600,
  note: "Kırılabilir",
  created_at: "2026-09-15T10:32:00Z",
  updated_at: "2026-09-15T10:32:00Z",
};

const detail: PickSessionDetail = {
  ...session,
  items: [{
    id: "item-1",
    product_id: "kit-1",
    sku_snapshot: "KIT-001",
    product_name_snapshot: "Raf kiti",
    product_type_snapshot: "assembly",
    ordered_quantity: 2,
    picked_quantity: 2,
    unit_weight_g_snapshot: 4800,
    total_weight_g: 9600,
    total_component_quantity: 18,
    components: [{
      component_product_id: "elb",
      component_sku_snapshot: "ELB",
      component_name_snapshot: "Dirsek",
      quantity_per_product: 4,
      picked_product_quantity: 2,
      total_component_quantity: 8,
      unit_weight_g_snapshot: 320,
      total_weight_g: 2560,
    }],
  }],
};

describe("PickHistoryPage", () => {
  beforeEach(() => {
    vi.spyOn(warehouseApi, "listPickHistory").mockResolvedValue({
      sessions: [session],
      pagination: { page: 1, limit: 100, total: 1, total_pages: 1 },
      summary: {
        completed_pick_count: 1,
        total_sale_product_quantity: 2,
        total_physical_item_quantity: 18,
        total_net_weight_g: 9600,
        by_user: [{ user_id: "user-1", name: "Alper", completed_pick_count: 1, total_physical_item_quantity: 18 }],
      },
      users: [{ user_id: "user-1", name: "Alper" }],
    });
    vi.spyOn(warehouseApi, "getPickHistory").mockResolvedValue(detail);
  });

  it("günlük özet ve tamamlanan toplama kartını gösterir", async () => {
    render(<MemoryRouter><PickHistoryPage/></MemoryRouter>);
    expect(await screen.findByText(/PICK-000124/)).toBeInTheDocument();
    expect(screen.getAllByText("18").length).toBeGreaterThan(0);
    expect(screen.getAllByText("9,6 kg").length).toBeGreaterThan(0);
    expect(screen.getByText("Bugün ekip özeti")).toBeInTheDocument();
    expect(screen.getAllByText("Alper").length).toBeGreaterThan(0);
  });

  it("kayda dokununca değişmez BOM içeriğini detayda açar", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><PickHistoryPage/></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /PICK-000124/ }));
    expect(await screen.findByRole("dialog", { name: "Toplama detayı" })).toBeInTheDocument();
    expect(await screen.findByText("KIT-001")).toBeInTheDocument();
    expect(screen.getByText("ELB")).toBeInTheDocument();
    expect(screen.getByText("Kit başına 4")).toBeInTheDocument();
    expect(screen.getByText("Kırılabilir")).toBeInTheDocument();
  });

  it("Dün filtresi seçilince yeni tarih aralığıyla yükler", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><PickHistoryPage/></MemoryRouter>);
    await screen.findByText(/PICK-000124/);
    const firstFilters = vi.mocked(warehouseApi.listPickHistory).mock.calls.at(-1)?.[0];
    await user.click(screen.getByRole("button", { name: "Dün" }));
    await waitFor(() => expect(warehouseApi.listPickHistory).toHaveBeenCalledTimes(2));
    const secondFilters = vi.mocked(warehouseApi.listPickHistory).mock.calls.at(-1)?.[0];
    expect(secondFilters?.date_from).not.toBe(firstFilters?.date_from);
    expect(secondFilters?.date_to).toBe(firstFilters?.date_from);
  });
});
