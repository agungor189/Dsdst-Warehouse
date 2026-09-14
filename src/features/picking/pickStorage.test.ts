import { describe, expect, it } from "vitest";
import { createPickSession, loadPickSession, savePickSession } from "./pickStorage";

describe("pick session storage", () => {
  it("pick progress sayfa yenilemesinden sonra localStorage'dan geri gelir", () => {
    const session = {
      ...createPickSession("order-1", "DS-1042"),
      activePickIndex: 1,
      pickedQuantities: { "product-1": 2 },
    };
    savePickSession(session);
    expect(loadPickSession()).toEqual(session);
  });
});
