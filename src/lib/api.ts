import type {
  Pagination,
  PickPlan,
  AuthUser,
  WarehouseOrder,
  WarehouseOrderSummary,
} from "../types/warehouse";

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  pagination?: Pagination;
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
  async completeOrder(id: string) {
    return (await request<PickPlan["order"]>(`/orders/${encodeURIComponent(id)}/complete`, { method: "POST" })).data;
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

export const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
