export type OrderStatus = "Hazırlanıyor" | "Toplanıyor" | "Toplandı" | string;

export interface WarehouseOrderSummary {
  id: string;
  order_code: string;
  platform: string | null;
  customer: string | null;
  total_quantity: number;
  status: OrderStatus;
  created_at: string;
}

export interface SaleItem {
  id: string;
  product_id: string | null;
  product_name: string | null;
  sku: string | null;
  barcode: string | null;
  warehouse_location: string | null;
  product_type: "simple" | "component" | "assembly";
  quantity: number;
  weight: number;
}

export interface WarehouseOrder {
  id: string;
  order_code: string;
  external_order_id: string | null;
  platform: string | null;
  customer: { name: string | null; phone: string | null; address: string | null };
  shipping: { company: string | null; tracking_number: string | null };
  status: OrderStatus;
  total_quantity: number;
  total_weight: number;
  created_at: string;
  updated_at: string;
  items: SaleItem[];
}

export interface PickItem {
  product_id: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  warehouse_location: string | null;
  required_quantity: number;
  central_stock: number;
  product_type: string;
  parent_assembly_sku: string | null;
  parent_assembly_skus: string[];
}

export interface PickShortage {
  product_id: string;
  sku: string;
  required_quantity: number;
  central_stock: number;
  shortage_quantity: number;
}

export interface PickPlan {
  order: { id: string; order_code: string; status: OrderStatus };
  items: PickItem[];
  shortages: PickShortage[];
  unresolved_items: Array<Record<string, unknown>>;
}

export interface ScannedProduct {
  product_id: string;
  sku: string;
  barcode: string | null;
  name: string | null;
  warehouse_location: string | null;
  central_stock: number;
  product_type: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PickSession {
  orderId: string;
  orderCode: string;
  activePickIndex: number;
  pickedQuantities: Record<string, number>;
  startedAt: string;
  phase: "location" | "product" | "quantity";
  verifiedSku: string | null;
}
