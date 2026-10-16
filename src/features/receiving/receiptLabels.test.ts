import { describe, expect, it } from "vitest";
import { groupReceiptLabelSkus } from "./receiptLabels";

const rows = [
  { productId: "p3", sku: "AL-R10", productTitle: "Alüminyum 10", material: "Alüminyum", profileType: "Yuvarlak", size: "10 mm", totalPackageCount: 1, printedCount: 0, nextPackageNumber: 1, packages: [] },
  { productId: "p1", sku: "ST-S40", productTitle: "Çelik 40", material: "Çelik", profileType: "Kare", size: "40 mm", totalPackageCount: 2, printedCount: 1, nextPackageNumber: 2, packages: [] },
  { productId: "p2", sku: "AL-R20", productTitle: "Alüminyum 20", material: "Alüminyum", profileType: "Yuvarlak", size: "20 mm", totalPackageCount: 4, printedCount: 0, nextPackageNumber: 1, packages: [] },
];

describe("masaüstü Mal Kabul etiket görünümü", () => {
  it("Malzeme → Profil Tipi → Ölçü hiyerarşisini ve SKU sırasını deterministik kurar", () => {
    const groups = groupReceiptLabelSkus(rows as any, "");
    expect(groups.map((group) => group.material)).toEqual(["Alüminyum", "Çelik"]);
    expect(groups[0].profileTypes[0].sizes.map((group) => group.size)).toEqual(["10 mm", "20 mm"]);
    expect(groups[0].profileTypes[0].sizes.flatMap((group) => group.skus.map((item) => item.sku))).toEqual(["AL-R10", "AL-R20"]);
  });

  it("SKU aramasında doğrudan eşleşen kaydı tek başına bırakır", () => {
    const groups = groupReceiptLabelSkus(rows as any, "st-s40");
    expect(groups.flatMap((material) => material.profileTypes).flatMap((profile) => profile.sizes).flatMap((size) => size.skus).map((item) => item.sku))
      .toEqual(["ST-S40"]);
  });
});
