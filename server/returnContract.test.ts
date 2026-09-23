import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("V2-10 return acceptance UI", () => {
  it("uses only the Panel return contract and exposes the three physical dispositions", () => {
    const page = readFileSync(resolve(process.cwd(), "src/pages/ReturnAcceptancePage.tsx"), "utf8");
    const api = readFileSync(resolve(process.cwd(), "src/lib/api.ts"), "utf8");
    expect(page).toContain("returnsApi.receive");
    expect(page).toContain("SELLABLE");
    expect(page).toContain("DAMAGED");
    expect(page).toContain("MISSING_NOT_RECEIVED");
    expect(page).toContain("Panel’e gönder");
    expect(api).toContain('request<any[]>("/returns")');
    expect(page).not.toMatch(/localStorage|indexedDB|central_stock/);
  });
});
