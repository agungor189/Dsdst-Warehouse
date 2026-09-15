import type {
  Pagination,
  PickPlan,
  AuthUser,
  WarehouseOrder,
  WarehouseOrderSummary,
  PickHistoryFilters,
  PickHistorySummary,
  PickSessionDetail,
  PickSessionSummary,
  PickSessionUser,
  InboundBatch,
  WarehousePackage,
  WarehouseLocation,
  ImportPreview,
  ReceivingPlacedPackage,
  WarehouseMapSnapshot,
  WarehousePackageListItem,
} from "../types/warehouse";
import type { ReceivingLot, ReceivingSession } from "../types/warehouse";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  pagination?: Pagination;
  summary?: PickHistorySummary;
  filters?: { users: PickSessionUser[] };
  idempotent?: boolean;
  error?: { code?: string; message?: string };
}

const FRIENDLY_STATUS_MESSAGES: Record<number, string> = {
  401: "Oturum geçersiz veya süresi dolmuş.",
  403: "Bu işlem için yetkiniz yok.",
  404: "İstenen sipariş veya ürün bulunamadı.",
  409: "Sipariş durumu değişti. Listeyi yenileyip tekrar deneyin.",
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const request = async <T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> => {
  if (init.method && init.method !== "GET" && !navigator.onLine) {
    throw new ApiError("Panel bağlantısı yok. Çevrimdışıyken işlem yapılamaz.", undefined, "OFFLINE");
  }

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("Panel bağlantısı yok. Ağ bağlantısını kontrol edin.", undefined, "NETWORK_ERROR");
  }

  const body = (await response.json().catch(() => ({}))) as Partial<ApiEnvelope<T>>;
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login" && path !== "/auth/me") {
      window.dispatchEvent(new Event("warehouse:unauthorized"));
    }
    throw new ApiError(
      body.error?.message || FRIENDLY_STATUS_MESSAGES[response.status] || "İşlem tamamlanamadı.",
      response.status,
      body.error?.code,
    );
  }
  return body as ApiEnvelope<T>;
};

export const warehouseApi = {
  async listOrders(page = 1, limit = 100) {
    const result = await request<WarehouseOrderSummary[]>(`/orders?page=${page}&limit=${limit}`);
    return { orders: result.data, pagination: result.pagination! };
  },
  async getOrder(id: string) {
    return (await request<WarehouseOrder>(`/orders/${encodeURIComponent(id)}`)).data;
  },
  async getPickPlan(id: string) {
    return (await request<PickPlan>(`/orders/${encodeURIComponent(id)}/pick-plan`)).data;
  },
  async startOrder(id: string) {
    return (await request<PickPlan["order"]>(`/orders/${encodeURIComponent(id)}/start`, { method: "POST" })).data;
  },
  async verifyPick(id: string, productId: string, code: string) {
    return (await request<{ product_id: string; match_type: "sku" | "barcode" | "location"; verified: boolean }>(
      `/orders/${encodeURIComponent(id)}/verify-pick`,
      { method: "POST", body: JSON.stringify({ product_id: productId, code }) },
    )).data;
  },
  async completePickItem(id: string, productId: string, pickedQuantity: number) {
    return (await request<Record<string, unknown>>(
      `/orders/${encodeURIComponent(id)}/pick-items/${encodeURIComponent(productId)}/complete`,
      { method: "POST", body: JSON.stringify({ picked_quantity: pickedQuantity }) },
    )).data;
  },
  async completeOrder(id: string, note?: string) {
    return (await request<PickPlan["order"]>(`/orders/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      body: JSON.stringify({ note: note?.trim() || undefined }),
    })).data;
  },
  async listPickHistory(filters: PickHistoryFilters, page = 1, limit = 100) {
    const query = new URLSearchParams({ page: String(page), limit: String(limit) });
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(key, value);
    }
    const result = await request<PickSessionSummary[]>(`/pick-history?${query.toString()}`);
    return {
      sessions: result.data,
      pagination: result.pagination!,
      summary: result.summary!,
      users: result.filters?.users || [],
    };
  },
  async getPickHistory(id: string) {
    return (await request<PickSessionDetail>(`/pick-history/${encodeURIComponent(id)}`)).data;
  },
};

export const authApi = {
  async login(username: string, password: string) {
    return (await request<AuthUser>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    })).data;
  },
  async me() {
    return (await request<AuthUser>("/auth/me")).data;
  },
  async logout() {
    await request<null>("/auth/logout", { method: "POST" });
  },
};

const post = async <T>(path: string, body: Record<string, unknown>) =>
  (await request<T>(path, { method: "POST", body: JSON.stringify(body) })).data;

const warehouseDeviceId = () => {
  const key = "dsdst-warehouse-device-id";
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  sessionStorage.setItem(key, created);
  return created;
};

export const warehouseAdminApi = {
  async getWarehouseMap() { return (await request<WarehouseMapSnapshot>("/admin/warehouse-map")).data; },
  async listPackages(filters: { page?: number; limit?: number; query?: string; status?: string; location?: string; lot?: string; date_from?: string; date_to?: string } = {}) {
    const query = new URLSearchParams({ page: String(filters.page || 1), limit: String(filters.limit || 25) });
    for (const key of ["query", "status", "location", "lot", "date_from", "date_to"] as const) if (filters[key]) query.set(key, filters[key]!);
    const result = await request<WarehousePackageListItem[]>(`/admin/packages?${query}`);
    return { packages: result.data, pagination: result.pagination! };
  },
  async listMovements() { return (await request<Array<Record<string, unknown>>>("/admin/movements")).data; },
  async listUserActivity() { return (await request<Array<Record<string, unknown>>>("/admin/user-activity")).data; },
  async listBatches() { return (await request<InboundBatch[]>("/admin/batches")).data; },
  async getBatch(id: string) { return (await request<InboundBatch>(`/admin/batches/${encodeURIComponent(id)}`)).data; },
  async createBatch(input: { supplier_code: string; supplier_name?: string; source_filename?: string }) {
    return post<InboundBatch>("/admin/batches", input);
  },
  async previewImport(id: string, rows: Array<Record<string, unknown>>) {
    return post<ImportPreview>(`/admin/batches/${encodeURIComponent(id)}/import/preview`, { rows });
  },
  async applyImport(id: string, rows: Array<Record<string, unknown>>, previewHash: string) {
    return post<InboundBatch>(`/admin/batches/${encodeURIComponent(id)}/import/apply`, { rows, preview_hash: previewHash });
  },
  async getLot(lotNumber: string) {
    return (await request<ReceivingLot>(`/admin/receiving/lots/${encodeURIComponent(lotNumber)}`)).data;
  },
  async listReceivingSessions() {
    return (await request<ReceivingSession[]>("/admin/receiving/sessions")).data;
  },
  async getMyActiveReceivingPackage(sessionId?: string) {
    const path = sessionId
      ? `/admin/receiving/sessions/${encodeURIComponent(sessionId)}/my-active-package`
      : "/admin/receiving/my-active-package";
    return (await request<WarehousePackage | null>(path)).data;
  },
  async listMyReceivingPackages(sessionId: string) {
    return (await request<ReceivingPlacedPackage[]>(`/admin/receiving/sessions/${encodeURIComponent(sessionId)}/my-packages`)).data;
  },
  async startReceivingSession(lotNumber: string) {
    return post<ReceivingSession>("/admin/receiving/sessions", { lot_number: lotNumber, device_id: warehouseDeviceId() });
  },
  async getReceivingSession(id: string) {
    return (await request<ReceivingSession>(`/admin/receiving/sessions/${encodeURIComponent(id)}`)).data;
  },
  async setReceivingState(id: string, state: "active" | "paused" | "cancelled") {
    return post<ReceivingSession>(`/admin/receiving/sessions/${encodeURIComponent(id)}/state`, { state, device_id: warehouseDeviceId() });
  },
  async completeReceivingSession(id: string, forceReason?: string) {
    return post<ReceivingSession>(`/admin/receiving/sessions/${encodeURIComponent(id)}/complete`, { force_reason: forceReason, device_id: warehouseDeviceId() });
  },
  async claimNext(supplierCode: string, sessionId?: string) {
    return post<WarehousePackage>("/admin/packages/claim-next", { supplier_code: supplierCode, session_id: sessionId, device_id: warehouseDeviceId() });
  },
  async getPackage(code: string) {
    return (await request<WarehousePackage>(`/admin/packages/by-code/${encodeURIComponent(code)}`)).data;
  },
  async queuePrint(packageId: string, claimToken?: string | null) {
    return post<{ package: WarehousePackage; job: Record<string, unknown>; idempotent: boolean }>(`/admin/packages/${encodeURIComponent(packageId)}/print`, {
      claim_token: claimToken || undefined,
      idempotency_key: crypto.randomUUID(),
      device_id: warehouseDeviceId(),
    });
  },
  async releaseReceivingPackage(packageId: string) {
    return post<WarehousePackage>(`/admin/packages/${encodeURIComponent(packageId)}/release-receiving`, { device_id: warehouseDeviceId() });
  },
  async listPrintJobs() { return (await request<Array<Record<string, unknown>>>("/admin/print-jobs?limit=200")).data; },
  async listLocations() { return (await request<WarehouseLocation[]>("/admin/locations")).data; },
  async suggestLocation(packageId?: string) { return (await request<WarehouseLocation>(`/admin/locations/suggestion${packageId ? `?package_id=${encodeURIComponent(packageId)}` : ""}`)).data; },
  async getReceivingLocation(packageId: string) { return (await request<WarehouseLocation>(`/admin/packages/${encodeURIComponent(packageId)}/receiving-location`)).data; },
  async createLocation(input: Record<string, unknown>) { return post<WarehouseLocation>("/admin/locations", input); },
  async placePackage(packageCode: string, locationCode: string, overrideReason?: string) {
    return post<{ package: WarehousePackage }>("/admin/placements", { package_code: packageCode, location_code: locationCode, override_reason: overrideReason, device_id: warehouseDeviceId(), idempotency_key: crypto.randomUUID() });
  },
  async movePackage(packageCode: string, locationCode: string) {
    return post<{ package: WarehousePackage }>("/admin/moves", { package_code: packageCode, location_code: locationCode, idempotency_key: crypto.randomUUID() });
  },
  async countPackage(packageCode: string, countedQuantity: number, note?: string) {
    return post<{ package: WarehousePackage }>("/admin/stock-counts", { package_code: packageCode, counted_quantity: countedQuantity, note, idempotency_key: crypto.randomUUID() });
  },
  async listTemplates() { return (await request<Array<Record<string, unknown>>>("/admin/label-templates")).data; },
  async saveTemplate(input: Record<string, unknown>) { return post<Record<string, unknown>>("/admin/label-templates", input); },
};

export const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
