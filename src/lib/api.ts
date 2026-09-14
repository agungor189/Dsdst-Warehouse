import type {
  Pagination,
  PickPlan,
  ScannedProduct,
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
  401: "API anahtarı eksik veya geçersiz.",
  403: "Bu işlem için Warehouse API yetkisi yok.",
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
    throw new ApiError(
      FRIENDLY_STATUS_MESSAGES[response.status] || body.error?.message || "İşlem tamamlanamadı.",
      response.status,
      body.error?.code,
    );
  }
  return body as ApiEnvelope<T>;
};

export const warehouseApi = {
  async listOrders(page = 1, limit = 25) {
    const result = await request<WarehouseOrderSummary[]>(`/orders?page=${page}&limit=${limit}`);
    return { orders: result.data, pagination: result.pagination! };
  },
  async getOrder(id: string) {
    return (await request<WarehouseOrder>(`/orders/${encodeURIComponent(id)}`)).data;
  },
  async getPickPlan(id: string) {
    return (await request<PickPlan>(`/orders/${encodeURIComponent(id)}/pick-plan`)).data;
  },
  async scan(code: string) {
    return (await request<ScannedProduct>(`/scan/${encodeURIComponent(code.trim())}`)).data;
  },
  async startOrder(id: string) {
    return (await request<PickPlan["order"]>(`/orders/${encodeURIComponent(id)}/start`, { method: "POST" })).data;
  },
  async completeOrder(id: string) {
    return (await request<PickPlan["order"]>(`/orders/${encodeURIComponent(id)}/complete`, { method: "POST" })).data;
  },
};

export const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Beklenmeyen bir hata oluştu.";
