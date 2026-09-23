import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reconciliationApi, type WarehouseReconciliationFinding } from "../lib/api";

export default function ReconciliationPage(){
  const [items,setItems]=useState<WarehouseReconciliationFinding[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  const load=async()=>{setLoading(true);setError("");try{setItems(await reconciliationApi.listStockFindings());}catch(value){setError(value instanceof Error?value.message:"Kontrol bulguları yüklenemedi.");}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  return <section className="space-y-5"><div className="flex items-center justify-between"><div><p className="eyebrow">SİSTEM KONTROLÜ</p><h1 className="page-title">Depo uyuşmazlıkları</h1><p className="text-sm text-muted">Yalnız stok ve depo kapsamındaki açık SKU bulguları gösterilir. Onarım ve onay işlemleri Panel'den yürütülür.</p></div><button className="secondary-button" onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?"animate-spin":""} size={18}/>Yenile</button></div>
    {error&&<div className="state-card border-danger/30 bg-red-50 text-danger">{error}</div>}
    {!loading&&items.length===0?<div className="state-card text-center font-bold text-muted">Açık depo uyuşmazlığı yok.</div>:<div className="grid gap-3">{items.map((item)=><article key={item.id} className="state-card"><div className="flex flex-wrap items-center gap-2"><AlertTriangle size={18} className={item.severity==='CRITICAL'?'text-danger':'text-warning'}/><b>{item.severity}</b><span className="status-badge">SKU: {item.affectedId}</span></div><h2 className="mt-3 font-black">{item.code}</h2><p className="mt-1 text-xs text-muted">Tekrar: {item.occurrences} · Onarım: {item.repairStatus}</p><div className="mt-4 grid gap-3 md:grid-cols-2"><pre className="overflow-auto rounded-xl bg-emerald-50 p-3 text-xs">{"Beklenen\n"}{JSON.stringify(item.expected,null,2)}</pre><pre className="overflow-auto rounded-xl bg-red-50 p-3 text-xs">{"Gerçek\n"}{JSON.stringify(item.actual,null,2)}</pre></div></article>)}</div>}
  </section>;
}
