import { describe, expect, it } from "vitest";
import { InboundPage } from "./WarehouseAdminPages";

describe("Mal Kabul kullanıcı akışı", () => {
  it("manuel lokasyon öner butonu içermez ve planlı rafı otomatik yükler", () => {
    const source = InboundPage.toString();
    expect(source).not.toContain("Lokasyon öner");
    expect(source).toContain("Planlanan lokasyon yükleniyor");
    expect(source).toContain("Yerleştirilecek Raf");
  });
});
