import { describe, expect, it } from "vitest";
import { locationLabelData, packageLabelData } from "./labels";
import type { WarehousePackage } from "../types/warehouse";

describe("Warehouse → Label Printer veri eşlemesi", () => {
  it("mal kabul paketini Label Printer dinamik alanlarına taşır", () => {
    const data = packageLabelData({
      id: "p1", batch_id: "b1", product_id: "product-1", supplier_code: "SUP-1",
      package_code: "PKG-1", status: "CLAIMED", batch_number: "B1", sku_snapshot: "PCI-R100-ELB",
      product_name_snapshot: "90° Dirsek", lot_number: "LOT-2026-09", package_number: 1,
      total_packages: 4, planned_quantity: 75, remaining_quantity: 75, location_code: null,
      material_snapshot: "Alüminyum", size_snapshot: "1 inch", unit_weight_g_snapshot: 127.3,
      package_weight_kg_snapshot: 9.55, claim_token: "token", claim_expires_at: null, claim_lease_seconds: 90,
    } satisfies WarehousePackage);
    expect(data).toMatchObject({
      SKU: "PCI-R100-ELB", Malzeme: "Alüminyum", Olcu: "1 inch", Urun_adi: "90° Dirsek",
      Stok_sayisi: 300, Toplam_paket: 4, Paket_ici_adet: 75, Urun_agirligi: "127.3 g",
      Kutu_agirligi: "9.55 kg", Parti_Lot: "LOT-2026-09", Paket_no: "1 / 4",
    });
  });

  it("lokasyon etiketinde tek veri kaynağı Warehouse kodudur", () => {
    expect(locationLabelData("A1-K1-P1")).toEqual({ Lokasyon: "A1-K1-P1" });
  });
});
