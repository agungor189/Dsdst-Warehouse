import type { WarehousePackage } from "../types/warehouse";

export function packageLabelData(pkg: WarehousePackage): Record<string, unknown> {
  return {
    Package_code: pkg.package_code,
    SKU: pkg.sku_snapshot,
    Urun_kodu: pkg.supplier_no_snapshot || pkg.supplier_code,
    Supplier_no: pkg.supplier_no_snapshot || pkg.supplier_code,
    Malzeme: pkg.material_snapshot || "",
    Tip: pkg.form_snapshot || pkg.series_snapshot || "",
    Olcu: pkg.size_snapshot || "",
    Urun_adi: pkg.product_name_snapshot,
    Stok_sayisi: pkg.planned_quantity * pkg.total_packages,
    Toplam_paket: pkg.total_packages,
    Paket_ici_adet: pkg.planned_quantity,
    Urun_agirligi: pkg.unit_weight_g_snapshot ? `${pkg.unit_weight_g_snapshot} g` : "",
    Kutu_agirligi: pkg.package_weight_kg_snapshot ? `${pkg.package_weight_kg_snapshot} kg` : "",
    Parti_Lot: pkg.lot_number || "",
    Paket_no: `${pkg.package_number} / ${pkg.total_packages}`,
    Lokasyon: pkg.location_code || pkg.recommended_location_code || "",
  };
}

export function locationLabelData(code: string): Record<string, unknown> {
  return { Lokasyon: code };
}

export function openPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
