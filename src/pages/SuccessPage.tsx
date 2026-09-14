import { Check, ClipboardList, Home } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

export function SuccessPage() {
  const location = useLocation();
  const orderCode = (location.state as { orderCode?: string } | null)?.orderCode;
  const allWaitingComplete = (location.state as { allWaitingComplete?: boolean } | null)?.allWaitingComplete;
  return (
    <div className="grid min-h-[75dvh] place-items-center py-8 text-center">
      <div className="w-full">
        <div className="mx-auto grid size-28 place-items-center rounded-full bg-success text-white shadow-xl shadow-success/20"><Check size={58} strokeWidth={3}/></div>
        <p className="mt-8 text-xs font-black uppercase tracking-[0.2em] text-moss">{orderCode || "Sipariş"}</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">Sipariş Toplandı</h1>
        <p className="mx-auto mt-3 max-w-xs text-muted">{allWaitingComplete ? "Tüm bekleyen siparişler tamamlandı." : "Sipariş panelde “Toplandı” durumuna geçirildi."}</p>
        <div className="mt-8 space-y-3"><Link to="/orders" className="primary-button w-full"><ClipboardList/> Sıradaki Sipariş</Link><Link to="/" className="secondary-button w-full"><Home/> Ana Sayfa</Link></div>
      </div>
    </div>
  );
}
