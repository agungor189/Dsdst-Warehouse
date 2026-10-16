import type { ReceiptLabelSku } from "../../types/warehouse";

export interface ReceiptLabelSizeGroup { size: string; skus: ReceiptLabelSku[] }
export interface ReceiptLabelProfileGroup { profileType: string; sizes: ReceiptLabelSizeGroup[] }
export interface ReceiptLabelMaterialGroup { material: string; profileTypes: ReceiptLabelProfileGroup[] }

const collator = new Intl.Collator("tr", { numeric: true, sensitivity: "base" });
const shown = (value: string | null | undefined) => value?.trim() || "Belirtilmemiş";

export function groupReceiptLabelSkus(rows: ReceiptLabelSku[], query: string): ReceiptLabelMaterialGroup[] {
  const needle = query.trim().toLocaleLowerCase("tr-TR");
  const filtered = rows.filter((row) => !needle
    || row.sku.toLocaleLowerCase("tr-TR").includes(needle)
    || row.productTitle.toLocaleLowerCase("tr-TR").includes(needle));
  const materials = new Map<string, Map<string, Map<string, ReceiptLabelSku[]>>>();
  for (const row of filtered) {
    const material = shown(row.material);
    const profile = shown(row.profileType);
    const size = shown(row.size);
    if (!materials.has(material)) materials.set(material, new Map());
    const profiles = materials.get(material)!;
    if (!profiles.has(profile)) profiles.set(profile, new Map());
    const sizes = profiles.get(profile)!;
    if (!sizes.has(size)) sizes.set(size, []);
    sizes.get(size)!.push(row);
  }
  return [...materials.entries()].sort(([a], [b]) => collator.compare(a, b)).map(([material, profiles]) => ({
    material,
    profileTypes: [...profiles.entries()].sort(([a], [b]) => collator.compare(a, b)).map(([profileType, sizes]) => ({
      profileType,
      sizes: [...sizes.entries()].sort(([a], [b]) => collator.compare(a, b)).map(([size, skus]) => ({
        size,
        skus: skus.sort((a, b) => collator.compare(a.sku, b.sku)),
      })),
    })),
  }));
}
