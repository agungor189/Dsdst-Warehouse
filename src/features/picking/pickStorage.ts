import type { PickSession } from "../../types/warehouse";

export const PICK_SESSION_KEY = "dsdst-warehouse:active-pick";

export const loadPickSession = (): PickSession | null => {
  try {
    const value = localStorage.getItem(PICK_SESSION_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as PickSession;
    return parsed?.orderId && parsed?.startedAt ? parsed : null;
  } catch {
    return null;
  }
};

export const savePickSession = (session: PickSession) => {
  localStorage.setItem(PICK_SESSION_KEY, JSON.stringify(session));
};

export const clearPickSession = () => localStorage.removeItem(PICK_SESSION_KEY);

export const createPickSession = (orderId: string, orderCode: string): PickSession => ({
  orderId,
  orderCode,
  activePickIndex: 0,
  pickedQuantities: {},
  startedAt: new Date().toISOString(),
  phase: "location",
  verifiedSku: null,
});
