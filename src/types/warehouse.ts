export type OrderStatus = "Hazırlanıyor" | "Toplanıyor" | "Toplandı" | string;

export interface AuthUser {
  id: string;
  username: string;
  role: string;
  permissions: Record<string, unknown>;
  must_change_password: boolean;
}

export type WarehousePermission =
  | "warehouse:receive"
  | "warehouse:manage_receiving_sessions"
  | "warehouse:print_labels"
  | "warehouse:place_packages"
  | "warehouse:move_stock"
  | "warehouse:manage_locations"
  | "warehouse:count_stock"
  | "warehouse:edit_label_templates";

export interface InboundBatch {
  id: string;
  batch_number: string;
  supplier_code: string;
  supplier_name: string | null;
  status: "DRAFT" | "READY" | "RECEIVING" | "PLACING" | "COMPLETED" | "CANCELLED";
  expected_package_count: number;
  expected_unit_count: number;
  package_count?: number;
  placed_count?: number;
  labeled_count?: number;
  print_failed_count?: number;
  created_at: string;
  lines?: Array<Record<string, unknown>>;
  package_status_counts?: Array<{ status: string; count: number }>;
}

export interface ReceivingLine {
  id: string;
  sku_snapshot: string;
  product_name_snapshot: string;
  supplier_code: string;
  name_tr_snapshot: string | null;
  name_en_snapshot: string | null;
  material_snapshot: string | null;
  size_snapshot: string | null;
  image_path_snapshot: string | null;
  expected_package_count: number;
  completed_packages: number;
  total_units: number;
  received_quantity: number;
  units_per_package: number;
  package_weight_kg_snapshot: number;
  planned_location_snapshot: string | null;
  reserve_locations_snapshot: string | null;
}

export interface ReceivingSession extends Omit<InboundBatch, "lines"> {
  lot_number: string;
  receiving_state: "active" | "paused" | "completed" | "cancelled";
  started_at: string;
  completed_at: string | null;
  started_by_name?: string | null;
  sku_count?: number;
  total_weight_kg?: number;
  actor_names?: string | null;
  resumed?: boolean;
  lines: ReceivingLine[];
  supplier_codes?: string[];
  active_packages?: WarehousePackage[];
  events?: Array<Record<string, unknown>>;
  progress: {
    sku_count: number;
    total_packages: number;
    placed_packages: number;
    remaining_packages: number;
    percent: number;
  };
}

export interface ReceivingLot {
  lot_number: string;
  lines: Array<Record<string, unknown>>;
  totals: { sku_count: number; package_count: number; unit_count: number; weight_kg: number };
}

export interface WarehousePackage {
  id: string;
  batch_id: string;
  product_id: string;
  supplier_code: string;
  package_code: string;
  status: string;
  batch_number: string;
  sku_snapshot: string;
  product_name_snapshot: string;
  lot_number: string | null;
  package_number: number;
  total_packages: number;
  planned_quantity: number;
  remaining_quantity: number;
  location_code: string | null;
  recommended_location_code?: string | null;
  supplier_no_snapshot?: string | null;
  name_tr_snapshot?: string | null;
  name_en_snapshot?: string | null;
  material_snapshot?: string | null;
  size_snapshot?: string | null;
  unit_weight_g_snapshot?: number;
  package_weight_kg_snapshot?: number;
  image_path_snapshot?: string | null;
  claim_token: string | null;
  claim_expires_at: string | null;
  claim_lease_seconds: number;
  receiving_device_id?: string | null;
  receiving_work_started_at?: string | null;
  receiving_last_activity_at?: string | null;
  receiving_location_reserved_at?: string | null;
  placed_by_username?: string | null;
}

export interface ReceivingPlacedPackage {
  package_id: string;
  package_code: string;
  product_id: string;
  sku: string;
  product_name: string;
  supplier_no: string | null;
  lot_number: string;
  package_number: number;
  total_packages: number;
  quantity: number;
  package_weight_kg: number;
  image_path_snapshot: string | null;
  image_url: string;
  location_code: string;
  placed_at: string;
  placed_by_username: string;
}

export interface WarehouseLocation {
  id: string;
  code: string;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  shelf: string | null;
  bin: string | null;
  package_capacity: number;
  occupied_packages: number;
  available_capacity: number;
  active: number;
  planned_location?: string;
  using_reserve?: boolean;
  reserved_packages?: number;
}

export interface ImportPreview {
  valid: boolean;
  rows: Array<Record<string, unknown>>;
  errors: Array<{ source_row: number; code: string; message: string }>;
  totals: { lines: number; packages: number; units: number };
  preview_hash: string;
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
  available_stock?: number;
  package_tracking?: boolean;
  package_allocations?: Array<{
    package_id: string;
    package_code: string;
    package_number: number;
    total_packages: number;
    location_code: string | null;
    available_quantity: number;
    pick_quantity: number;
  }>;
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

export type PickSessionStatus = "WAITING" | "PICKING" | "PICKED" | "PACKING" | "PACKED" | "SHIPPED" | "CANCELLED";

export interface PickSessionUser {
  user_id: string;
  name: string;
}

export interface PickSessionSummary {
  id: string;
  pick_number: string;
  order_id: string;
  order_code: string | null;
  external_order_id: string | null;
  status: PickSessionStatus;
  started_by: PickSessionUser;
  completed_by: PickSessionUser;
  started_at: string;
  completed_at: string;
  total_product_types: number;
  total_sale_product_quantity: number;
  total_physical_item_quantity: number;
  total_net_weight_g: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface PickSessionComponent {
  component_product_id: string | null;
  component_sku_snapshot: string;
  component_name_snapshot: string;
  quantity_per_product: number;
  picked_product_quantity: number;
  total_component_quantity: number;
  unit_weight_g_snapshot: number;
  total_weight_g: number;
}

export interface PickSessionItem {
  id: string;
  product_id: string | null;
  sku_snapshot: string;
  product_name_snapshot: string;
  product_type_snapshot: string;
  ordered_quantity: number;
  picked_quantity: number;
  unit_weight_g_snapshot: number;
  total_weight_g: number;
  total_component_quantity: number;
  components: PickSessionComponent[];
}

export interface PickSessionDetail extends PickSessionSummary {
  items: PickSessionItem[];
}

export interface PickHistorySummary {
  completed_pick_count: number;
  total_sale_product_quantity: number;
  total_physical_item_quantity: number;
  total_net_weight_g: number;
  by_user: Array<PickSessionUser & {
    completed_pick_count: number;
    total_physical_item_quantity: number;
  }>;
}

export interface PickHistoryFilters {
  date_from?: string;
  date_to?: string;
  summary_from: string;
  summary_to: string;
  picker_user_id?: string;
  sku?: string;
  product_name?: string;
  order_number?: string;
  status?: PickSessionStatus;
}
