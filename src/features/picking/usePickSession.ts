import { useCallback, useState } from "react";
import type { PickSession } from "../../types/warehouse";
import { clearPickSession, loadPickSession, savePickSession } from "./pickStorage";

export function usePickSession() {
  const [session, setSessionState] = useState<PickSession | null>(() => loadPickSession());

  const setSession = useCallback((next: PickSession | null | ((current: PickSession | null) => PickSession | null)) => {
    setSessionState((current) => {
      const value = typeof next === "function" ? next(current) : next;
      if (value) savePickSession(value);
      else clearPickSession();
      return value;
    });
  }, []);

  return { session, setSession };
}
