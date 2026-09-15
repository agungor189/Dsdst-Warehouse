import { describe, expect, it } from "vitest";
import type { WarehouseMapPackage } from "../../types/warehouse";
import { rackCodeFromLocation, searchWarehousePackages } from "./model";

const pkg = (overrides: Partial<WarehouseMapPackage> = {}): WarehouseMapPackage => ({
  id: "p1", package_code: "PKG-001", status: "PLACED", package_number: 1, total_packages: 4,
  quantity: 25, placed_at: null, placed_by: "Alper", location_code: "A3-K2-P5", sku: "PCI-R100-ELB",
  product_name: "Dirsek", supplier_no: "SUP-44", lot_number: "LOT-9", weight: 2,
  width_mm: null, depth_mm: null, height_mm: null, image_url: null, ...overrides,
});

describe("warehouse map model", () => {
  it.each(["PCI-R100", "sup-44", "dirsek", "PKG-001", "lot-9", "A3-K2-P5"])("%s ile doğru paketi bulur", (query) => {
    expect(searchWarehousePackages([pkg()], query).map((item) => item.id)).toEqual(["p1"]);
  });
  it("canonical location kodundan rackCode üretir", () => expect(rackCodeFromLocation("A3-K2-P5")).toBe("A3"));
});
