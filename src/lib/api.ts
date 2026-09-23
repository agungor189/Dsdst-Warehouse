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
  WarehousePlacementLayout,
  WarehousePlacementPreview,
  WarehouseReplenishmentTask,
  CatalogProductV1,
  CatalogUomRegistryV1,
  InventoryAvailabilityV1,
  InventoryFulfillmentV1,
  InventoryReservationV1,
  WarehouseExecutionPackage,
  WarehouseExecutionLocation,
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

const requestPdf = async (path: string, body: Record<string, unknown>): Promise<Blob> => {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/pdf", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Label Printer bağlantısı kurulamadı.", undefined, "NETWORK_ERROR");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string } | string };
    const detail = typeof error.error === "string" ? error.error : error.error?.message;
    throw new ApiError(detail || "Etiket önizlemesi oluşturulamadı.", response.status, typeof error.error === "object" ? error.error?.code : undefined);
  }
  return response.blob();
};

export type LabelTemplatePurpose = "goods_receipt" | "location" | "product_package" | "kit" | "shipping" | "custom";

export const labelApi = {
  async listTemplates(purpose?: LabelTemplatePurpose) {
    const query = purpose ? `?purpose=${encodeURIComponent(purpose)}` : "";
    const response = await request<{ templates?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(`/labels/templates${query}`);
    const data = response.data as { templates?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>;
    return Array.isArray(data) ? data : data?.templates || [];
  },
  preview(purpose: LabelTemplatePurpose, data: Record<string, unknown>) {
    return requestPdf("/labels/preview", { purpose, data });
  },
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

export const catalogApi = {
  async listProducts(catalogType?: CatalogProductV1["catalog_type"]) {
    const query = catalogType ? `?catalog_type=${encodeURIComponent(catalogType)}` : "";
    return (await request<CatalogProductV1[]>(`/catalog/v1/products${query}`)).data;
  },
  async getUoms() {
    return (await request<CatalogUomRegistryV1>("/catalog/v1/uoms")).data;
  },
};

const inventoryOperation = () => crypto.randomUUID();

export const inventoryApi = {
  async getAvailability(productId: string) {
    return (await request<InventoryAvailabilityV1>(`/inventory/v1/products/${encodeURIComponent(productId)}/availability`)).data;
  },
  async getFulfillment(reservationId: string) {
    return (await request<InventoryFulfillmentV1>(`/inventory/v1/reservations/${encodeURIComponent(reservationId)}/fulfillment`)).data;
  },
  async receive(input: { receiptId: string; costSnapshotId: string; receivedAt: string; location: { id: string; kind: "PICKING" | "RESERVE" } }) {
    return (await request<Record<string, unknown>>("/inventory/v1/receipts", {
      method: "POST", body: JSON.stringify({ ...input, idempotency_key: inventoryOperation() }),
    })).data;
  },
  async markPicked(reservationId: string, at?: string) {
    return (await request<InventoryReservationV1>(`/inventory/v1/reservations/${encodeURIComponent(reservationId)}/pick`, {
      method: "POST", body: JSON.stringify({ at, idempotency_key: inventoryOperation() }),
    })).data;
  },
  async markPacked(reservationId: string, at?: string) {
    return (await request<InventoryReservationV1>(`/inventory/v1/reservations/${encodeURIComponent(reservationId)}/pack`, {
      method: "POST", body: JSON.stringify({ at, idempotency_key: inventoryOperation() }),
    })).data;
  },
  async dispatch(reservationId: string, shipmentId: string, dispatchedAt: string, operationId = inventoryOperation()) {
    return (await request<InventoryReservationV1>(`/inventory/v1/reservations/${encodeURIComponent(reservationId)}/dispatch`, {
      method: "POST", body: JSON.stringify({ shipmentId, dispatchedAt, idempotency_key: operationId }),
    })).data;
  },
  async reportDiscrepancy(reservationId: string, lotId: string, locationId: string, reason: string) {
    return (await request<InventoryFulfillmentV1>(`/inventory/v1/reservations/${encodeURIComponent(reservationId)}/discrepancies`, {
      method: "POST", body: JSON.stringify({ lotId, locationId, reason, idempotency_key: inventoryOperation() }),
    })).data;
  },
};

export const returnsApi = {
  async listApproved() { return (await request<any[]>("/returns")).data; },
  async get(returnId: string) { return (await request<any>(`/returns/${encodeURIComponent(returnId)}`)).data; },
  async receive(returnId: string, lines: Array<{ returnLineId: string; quantityBaseInt: number; disposition: "SELLABLE" | "DAMAGED" | "MISSING_NOT_RECEIVED"; locationId?: string | null }>, operationId = crypto.randomUUID()) {
    return (await request<any>(`/returns/${encodeURIComponent(returnId)}/receipts`, {
      method: "POST", body: JSON.stringify({ lines, receivedAt: new Date().toISOString(), idempotency_key: operationId }),
    })).data;
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

const executionOperation = () => crypto.randomUUID();

export const warehouseExecutionApi = {
  async getPackage(packageIdOrCode: string) {
    return (await request<WarehouseExecutionPackage>(`/execution/packages/${encodeURIComponent(packageIdOrCode)}`)).data;
  },
  async suggestLocation(packageIdOrCode: string) {
    return (await request<WarehouseExecutionLocation>(`/execution/packages/${encodeURIComponent(packageIdOrCode)}/suggestion`)).data;
  },
  async identifyPackage(packageIdOrCode: string, labelIdentity: string, operationId = executionOperation()) {
    return (await request<WarehouseExecutionPackage>(`/execution/packages/${encodeURIComponent(packageIdOrCode)}/identity`, {
      method: "POST", body: JSON.stringify({ labelIdentity, idempotency_key: operationId }),
    })).data;
  },
  async placePackage(packageIdOrCode: string, destinationCode: string, operationId = executionOperation()) {
    return (await request<{ package: WarehouseExecutionPackage; destination: WarehouseExecutionLocation; onHandBaseInt: number }>(
      `/execution/packages/${encodeURIComponent(packageIdOrCode)}/place`, {
        method: "POST", body: JSON.stringify({ destinationCode, scannedDestinationCode: destinationCode, idempotency_key: operationId }),
      },
    )).data;
  },
  async movePackage(packageIdOrCode: string, destinationCode: string, operationId = executionOperation()) {
    return (await request<{ package: WarehouseExecutionPackage; destination: WarehouseExecutionLocation; onHandBaseInt: number }>(
      `/execution/packages/${encodeURIComponent(packageIdOrCode)}/move`, {
        method: "POST", body: JSON.stringify({ destinationCode, scannedDestinationCode: destinationCode, idempotency_key: operationId }),
      },
    )).data;
  },
  async recordCount(packageIdOrCode: string, observedQuantityBaseInt: number, reason: string, operationId = executionOperation()) {
    const countId = crypto.randomUUID();
    return (await request<{ id: string; packageId: string; expectedQuantityBaseInt: number; observedQuantityBaseInt: number; differenceBaseInt: number; status: "MATCHED" | "PENDING_APPROVAL" }>(
      "/execution/counts", {
        method: "POST",
        body: JSON.stringify({ countId, packageId: packageIdOrCode, observedQuantityBaseInt, reason, idempotency_key: operationId }),
      },
    )).data;
  },
  async receiveGoods(input: Record<string, unknown>, operationId = executionOperation()) {
    return (await request<{ id: string; status: string; acceptedQuantityBaseInt: number; damagedQuantityBaseInt: number; shortageQuantityBaseInt: number; excessQuantityBaseInt: number; packages: WarehouseExecutionPackage[] }>("/execution/receipts", {
      method: "POST", body: JSON.stringify({ ...input, idempotency_key: operationId }),
    })).data;
  },
  async approveExcess(input: { approvalId: string; costSnapshotId: string; maximumAcceptedQuantityBaseInt: number; reason: string }, operationId = executionOperation()) {
    return (await request<Record<string, unknown>>("/execution/receipts/excess-approvals", {
      method: "POST", body: JSON.stringify({ ...input, idempotency_key: operationId }),
    })).data;
  },
  async prepareReplenishment(productId: string, operationId = executionOperation()) {
    return (await request<Record<string, unknown>>("/execution/replenishments/prepare", {
      method: "POST", body: JSON.stringify({ productId, idempotency_key: operationId }),
    })).data;
  },
  async listReplenishmentTasks() {
    return (await request<WarehouseReplenishmentTask[]>("/execution/replenishments")).data;
  },
  async completeReplenishment(taskId: string, scannedSourcePackageCode: string, destinationCode: string, operationId = executionOperation()) {
    return (await request<{ id: string; state: "COMPLETED"; lotId: string; sourcePackageId: string }>(
      `/execution/replenishments/${encodeURIComponent(taskId)}/complete`, {
        method: "POST",
        body: JSON.stringify({ scannedSourcePackageCode, destinationCode, scannedDestinationCode: destinationCode, idempotency_key: operationId }),
      },
    )).data;
  },
};

export const warehouseAdminApi = {
  async getWarehouseMap() { return (await request<WarehouseMapSnapshot>("/admin/warehouse-map")).data; },
  async getPlacementLayout() { return (await request<WarehousePlacementLayout>("/admin/layouts/placement")).data; },
  async previewPlacementLayout(sourceFilename: string, csvText: string) {
    return post<WarehousePlacementPreview>("/admin/layouts/placement/preview", { source_filename: sourceFilename, csv_text: csvText });
  },
  async applyPlacementLayout(sourceFilename: string, csvText: string, previewHash: string, notes?: string) {
    return post<WarehousePlacementLayout>("/admin/layouts/placement/apply", { source_filename: sourceFilename, csv_text: csvText, preview_hash: previewHash, notes });
  },
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
  async startReceivingSession(lotNumber: string, supplierCode?: string) {
    return post<ReceivingSession>("/admin/receiving/sessions", { lot_number: lotNumber, supplier_code: supplierCode, device_id: warehouseDeviceId() });
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
  async queueLocationPrint(locationId: string) {
    return post<Record<string, unknown>>(`/admin/locations/${encodeURIComponent(locationId)}/print`, {
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
