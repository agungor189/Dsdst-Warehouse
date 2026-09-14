import type { PickPlan, WarehouseOrder, WarehouseOrderSummary } from "../types/warehouse";

export const orderSummary: WarehouseOrderSummary = {
  id: "order-1",
  order_code: "DS-1042",
  platform: "Trendyol",
  customer: "Ayşe Yılmaz",
  total_quantity: 2,
  status: "Hazırlanıyor",
  created_at: "2026-09-14T08:00:00.000Z",
  picker: null,
};

export const order: WarehouseOrder = {
  id: "order-1",
  order_code: "DS-1042",
  external_order_id: null,
  platform: "Trendyol",
  customer: { name: "Ayşe Yılmaz", phone: null, address: null },
  shipping: { company: null, tracking_number: null },
  status: "Hazırlanıyor",
  total_quantity: 2,
  total_weight: 0,
  created_at: "2026-09-14T08:00:00.000Z",
  updated_at: "2026-09-14T08:00:00.000Z",
  picker: null,
  items: [{
    id: "sale-item-1",
    product_id: "product-1",
    product_name: "Raf bağlantı seti",
    sku: "CS-R075-H2",
    barcode: "8690001",
    warehouse_location: "A1-K2-P3",
    product_type: "simple",
    quantity: 2,
    weight: 0,
  }],
};

export const pickPlan: PickPlan = {
  order: { id: "order-1", order_code: "DS-1042", status: "Hazırlanıyor", picker: null },
  items: [{
    product_id: "product-1",
    sku: "CS-R075-H2",
    barcode: "8690001",
    name: "Raf bağlantı seti",
    warehouse_location: "A1-K2-P3",
    required_quantity: 2,
    central_stock: 12,
    product_type: "simple",
    parent_assembly_sku: null,
    parent_assembly_skus: [],
    image_url: null,
    picked_quantity: 0,
    verified_code_type: null,
    completed_at: null,
  }],
  shortages: [],
  unresolved_items: [],
};
