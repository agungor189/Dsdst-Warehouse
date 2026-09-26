import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { reconciliationApi, type WarehouseReconciliationFinding } from "../lib/api";
import { Badge, Button, Card, EmptyState, LoadingState, PageHeader } from "../components/ui";

export default function ReconciliationPage(){
  const [items,setItems]=useState<WarehouseReconciliationFinding[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  const load=async()=>{setLoading(true);setError("");try{setItems(await reconciliationApi.listStockFindings());}catch(value){setError(value instanceof Error?value.message:"Kontrol bulguları yüklenemedi.");}finally{setLoading(false);}};
  useEffect(()=>{void load();},[]);
  return <section className="space-y-5"><PageHeader eyebrow="SİSTEM KONTROLÜ" title="Depo uyuşmazlıkları" description="Yalnız stok ve depo kapsamındaki açık SKU bulguları gösterilir. Onarım ve onay işlemleri Panel'den yürütülür." actions={<Button variant="secondary" onClick={()=>void load()} loading={loading}><RefreshCw size={18}/>Yenile</Button>}/>
    {error&&<EmptyState className="border-danger/30 bg-red-50 text-danger" title={error}/>}
    {loading?<LoadingState label="Depo uyuşmazlıkları kontrol ediliyor"/>:items.length===0?<EmptyState title="Açık depo uyuşmazlığı yok."/>:<div className="grid gap-3">{items.map((item)=><Card as="article" key={item.id}><div className="flex flex-wrap items-center gap-2"><AlertTriangle size={18} className={item.severity==='CRITICAL'?'text-danger':'text-warning'}/><b>{item.severity}</b><Badge>SKU: {item.affectedId}</Badge></div><h2 className="mt-3 font-black">{item.code}</h2><p className="mt-1 text-xs text-muted">Tekrar: {item.occurrences} · Onarım: {item.repairStatus}</p><div className="mt-4 grid gap-3 md:grid-cols-2"><pre className="overflow-auto rounded-xl bg-emerald-50 p-3 text-xs">{"Beklenen\n"}{JSON.stringify(item.expected,null,2)}</pre><pre className="overflow-auto rounded-xl bg-red-50 p-3 text-xs">{"Gerçek\n"}{JSON.stringify(item.actual,null,2)}</pre></div></Card>)}</div>}
  </section>;
}
