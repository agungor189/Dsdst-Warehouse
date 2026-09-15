import { describe, expect, it } from "vitest";
import { matchOcrSupplierCode, normalizeSupplierCodeForOcr } from "./ocrMatching";

describe("Supplier No OCR eşleştirme", () => {
  it("ayraç ve boşluk OCR farklarını gerçek aktif lot koduna eşler", () => {
    expect(normalizeSupplierCodeForOcr("CS25 Round 6 25")).toBe("CS25ROUND625");
    expect(matchOcrSupplierCode("CS25 Round 6 25", ["H16", "CS25-Round 6*25"])).toMatchObject({
      kind: "match", value: "CS25-Round 6*25",
    });
  });

  it("birbirine yakın iki kodu otomatik seçmez", () => {
    const result = matchOcrSupplierCode("A01-B34", ["A012-B34", "A011-B34"]);
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous") {
      expect(result.options.map(({ value }) => value)).toEqual(["A011-B34", "A012-B34"]);
    }
  });

  it("zayıf OCR sonucunu kör şekilde kabul etmez", () => {
    expect(matchOcrSupplierCode("etiket okunamadı", ["H16", "A012-B34"]).kind).toBe("none");
  });
});
