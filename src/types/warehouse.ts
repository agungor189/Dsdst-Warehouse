export type OrderStatus = "Hazırlanıyor" | "Toplanıyor" | "Toplandı" | string;

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  must_change_password: boolean;
}

export interface WarehousePicker {
  user_id: string;
  name: string;
  started_at: string | null;
  completed_at?: string | null;
}

export interface WarehouseOrderSummary {
  id: string;
  order_code: string;
  platform: string | null;
  customer: string | null;
  total_quantity: number;
  status: OrderStatus;
  created_at: string;
  picker: WarehousePicker | null;
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
  picker: WarehousePicker | null;
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
  image_url: string | null;
  picked_quantity: number;
  verified_code_type: "sku" | "barcode" | "location" | null;
  completed_at: string | null;
}

export interface PickShortage {
  product_id: string;
  sku: string;
  required_quantity: number;
  central_stock: number;
  shortage_quantity: number;
}

export interface PickPlan {
  order: { id: string; order_code: string; status: OrderStatus; picker: WarehousePicker | null };
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
