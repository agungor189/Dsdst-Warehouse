import type { WarehouseMapPackage } from "../../types/warehouse";

export const rackCodeFromLocation = (code: string) => code.split("-K")[0];

export function searchWarehousePackages(packages: WarehouseMapPackage[], query: string) {
  const value = query.trim().toLocaleLowerCase("tr-TR");
  if (!value) return [];
  return packages.filter((pkg) => [
    pkg.sku, pkg.supplier_no, pkg.product_name, pkg.package_code, pkg.lot_number, pkg.location_code,
  ].some((field) => String(field || "").toLocaleLowerCase("tr-TR").includes(value)));
}
