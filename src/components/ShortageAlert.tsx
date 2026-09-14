import { AlertTriangle } from "lucide-react";
import type { PickShortage } from "../types/warehouse";

export function ShortageAlert({ shortages }: { shortages: PickShortage[] }) {
  if (!shortages.length) return null;
  return (
    <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4" role="alert">
      <div className="flex gap-3">
        <AlertTriangle className="shrink-0 text-amber-700" />
        <div><h2 className="font-black text-amber-950">Bu siparişte yetersiz stok var</h2><p className="mt-1 text-sm text-amber-800">Siparişi açabilirsiniz; tüm ürünler tamamlanmadan kapatılamaz.</p></div>
      </div>
      <div className="mt-4 space-y-2">
        {shortages.map((item) => (
          <div key={item.product_id} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl bg-white/80 p-3 text-sm">
            <strong>{item.sku}</strong><strong className="text-danger">{item.shortage_quantity} eksik</strong>
            <span className="text-muted">Gerekli {item.required_quantity}</span><span className="text-muted">Stok {item.central_stock}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
