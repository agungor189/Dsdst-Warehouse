import { describe, expect, it } from "vitest";
import { parseDelimitedText } from "./WarehouseAdminPages";

describe("Warehouse CSV okuyucu", () => {
  it("noktalı virgül ve tırnaklı alanları veri yazmadan ayrıştırır", () => {
    expect(parseDelimitedText('SKU;Urun_adi;Paket Sayısı\nSKU-1;"Dirsek, 90°";4\n')).toEqual([
      { SKU: "SKU-1", Urun_adi: "Dirsek, 90°", "Paket Sayısı": "4" },
    ]);
  });
});
