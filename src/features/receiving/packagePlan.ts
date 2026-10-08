import type { PlannedReceiptPackage } from '../../types/warehouse';
export type PackageObservation = { quantity: string; disposition: string; weightKg: string; splitConfirmed: boolean };
export function preparePlannedReceipt(plan: { version: string; packages: PlannedReceiptPackage[] }, observations: Record<string, PackageObservation>) {
  const packages = plan.packages.flatMap(p => {
    const o = observations[p.id];
    if (!o || !/^\d+$/.test(o.quantity) || !Number.isSafeInteger(Number(o.quantity))) throw new Error(`${p.code}: gerçek sayımı girin.`);
    const quantityBaseInt = Number(o.quantity);
    if (quantityBaseInt === 0) return [];
    if (!['ACCEPTED','DAMAGED'].includes(o.disposition)) throw new Error(`${p.code}: durum seçin.`);
    if (o.weightKg && !/^\d+(\.\d{1,3})?$/.test(o.weightKg)) throw new Error(`${p.code}: ağırlık en fazla üç ondalık kg olmalı.`);
    const weightGrams = o.weightKg ? Math.round(Number(o.weightKg) * 1000) : undefined;
    if (p.mixed && (!o.splitConfirmed || !weightGrams)) throw new Error(`${p.code}: kaynak koliyi ayırıp bu paketi tartın.`);
    return [{ id: p.id, code: p.code, quantityBaseInt, targetQuantityBaseInt: p.quantityBaseInt, disposition: o.disposition, weightGrams, splitConfirmed: o.splitConfirmed }];
  });
  return { planVersion: plan.version, packages, acceptedQuantityBaseInt: packages.filter(p => p.disposition === 'ACCEPTED').reduce((n,p) => n+p.quantityBaseInt,0), damagedQuantityBaseInt: packages.filter(p => p.disposition === 'DAMAGED').reduce((n,p) => n+p.quantityBaseInt,0) };
}
