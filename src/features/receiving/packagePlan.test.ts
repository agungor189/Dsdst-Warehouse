import { describe, expect, it } from 'vitest';
import { preparePlannedReceipt } from './packagePlan';

describe('planned line receipt', () => {
  const plan = { version: 'v1', packages: [30,30,30,10].map((quantityBaseInt, i) => ({ id: `p${i}`, code: `PKG-${i}`, quantityBaseInt, mixed: false, sourceCartonId: `c${i}`, sourceGroupRef: 'g', sourceItemRef: 'i', grossWeightKgEstimate: null, sku: 'A', title: 'A', productType: 'component', size: '' })) };
  it('submits all four packages as one final line receipt and preserves package identity', () => {
    const counts = Object.fromEntries(plan.packages.map(p => [p.id, { quantity: String(p.quantityBaseInt), disposition: 'ACCEPTED', weightKg: '', splitConfirmed: false }]));
    const result = preparePlannedReceipt(plan, counts);
    expect(result.acceptedQuantityBaseInt).toBe(100);
    expect(result.packages.map(p => p.quantityBaseInt)).toEqual([30,30,30,10]);
    expect(preparePlannedReceipt(plan, counts)).toEqual(result);
  });
  it('mixed children require explicit split confirmation and independent measured weight', () => {
    const mixed = { ...plan, packages: [{ ...plan.packages[0], mixed: true }] };
    expect(() => preparePlannedReceipt(mixed, { p0: { quantity: '30', disposition: 'ACCEPTED', weightKg: '', splitConfirmed: false } })).toThrow();
  });
});
