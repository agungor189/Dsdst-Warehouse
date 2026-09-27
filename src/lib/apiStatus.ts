import { useEffect, useSyncExternalStore } from "react";

export type ApiConnectionStatus = "checking" | "connected" | "disconnected";

let status: ApiConnectionStatus = typeof navigator !== "undefined" && !navigator.onLine
  ? "disconnected"
  : "checking";
const listeners = new Set<() => void>();

function publish(next: ApiConnectionStatus) {
  if (status === next) return;
  status = next;
  listeners.forEach((listener) => listener());
}

export const reportApiResponse = (httpStatus: number) => publish(httpStatus >= 500 ? "disconnected" : "connected");
export const reportApiUnavailable = () => publish("disconnected");
export const reportNetworkOnline = () => publish("checking");

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useApiStatus() {
  useEffect(() => {
    const offline = () => reportApiUnavailable();
    const online = () => reportNetworkOnline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, []);
  return useSyncExternalStore(subscribe, () => status, () => "checking");
}
