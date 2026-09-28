import { CheckCircle2, Clock3, PackageOpen, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { StatusBadge } from "../components/StatusBadge";
import { getErrorMessage, shipmentApi, warehouseApi } from "../lib/api";
import { platformLabel } from "../lib/format";
import type { PickSessionSummary, ShipmentListItem, WarehouseOrderSummary } from "../types/warehouse";

type StatusFilter = "Tümü" | "Hazırlanıyor" | "Toplanıyor";
type WorkItem = {
  id: string; orderNumber: string; customer: string;
  label: "Toplanacak" | "Toplandı" | "Paketlenecek" | "Paketlendi" | "Sevke hazır" | "Sevk edildi";
  completed: boolean; href: string; detail: string; order?: WarehouseOrderSummary;
};

const todayRange = () => {
  const from = new Date(); from.setHours(0,0,0,0);
  const to = new Date(from); to.setDate(to.getDate()+1);
  return { date_from:from.toISOString(), date_to:to.toISOString(), summary_from:from.toISOString(), summary_to:to.toISOString() };
};

const completedToday = (value:string) => {
  const timestamp=Date.parse(value); const from=new Date(); from.setHours(0,0,0,0); const to=new Date(from); to.setDate(to.getDate()+1);
  return Number.isFinite(timestamp)&&timestamp>=from.getTime()&&timestamp<to.getTime();
};

const shipmentWork = (shipment:ShipmentListItem):WorkItem => {
  const label = shipment.state === "PREPARING" ? "Paketlenecek"
    : shipment.state === "DISPATCHED" ? "Sevk edildi"
      : shipment.state === "LABEL_READY" ? "Sevke hazır" : "Paketlendi";
  return { id:`shipment:${shipment.id}`,orderNumber:shipment.orderNumber,customer:shipment.customerName||"Müşteri bilgisi yok",
    label,completed:shipment.state==="DISPATCHED",href:`/shipments?shipmentId=${encodeURIComponent(shipment.id)}`,
    detail:`${shipment.sourceChannel} · ${shipment.packageCount} paket` };
};

const pickedWork = (session:PickSessionSummary):WorkItem => ({ id:`pick:${session.id}`,orderNumber:session.order_code||session.external_order_id||session.pick_number,
  customer:session.completed_by.name,label:"Toplandı",completed:true,href:"/history",
  detail:`${session.total_physical_item_quantity} parça · ${new Date(session.completed_at).toLocaleTimeString("tr-TR",{hour:"2-digit",minute:"2-digit"})}` });

export function OrdersPage() {
  const [orders,setOrders]=useState<WarehouseOrderSummary[]>([]); const [shipments,setShipments]=useState<ShipmentListItem[]>([]);
  const [picked,setPicked]=useState<PickSessionSummary[]>([]); const [query,setQuery]=useState(""); const [status,setStatus]=useState<StatusFilter>("Tümü");
  const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const load=useCallback(async(showLoading=true)=>{if(showLoading)setLoading(true);setError("");try{const [orderResult,shipmentRows,history]=await Promise.all([
    warehouseApi.listOrders(1,100),shipmentApi.list("all","",200),warehouseApi.listPickHistory(todayRange(),1,100),
  ]);setOrders(orderResult.orders);setShipments(shipmentRows);setPicked(history.sessions)}catch(reason){setError(getErrorMessage(reason))}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);
  useEffect(()=>{const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void load(false)},30_000);return()=>window.clearInterval(timer)},[load]);

  const work=useMemo(()=>{
    const orderItems:WorkItem[]=orders.filter(order=>status==="Tümü"||order.status===status).map(order=>({id:`order:${order.id}`,
      orderNumber:order.order_code,customer:order.customer||"Müşteri bilgisi yok",label:"Toplanacak",completed:false,
      href:`/orders/${order.id}`,detail:`${platformLabel(order.platform)} · ${order.total_quantity} adet`,order}));
    const dailyShipments=shipments.filter(item=>item.state!=="DISPATCHED"||completedToday(item.updatedAt));
    const rows=[...orderItems,...picked.map(pickedWork),...dailyShipments.map(shipmentWork)]; const needle=query.trim().toLocaleLowerCase("tr");
    return needle?rows.filter(item=>`${item.orderNumber} ${item.customer} ${item.label}`.toLocaleLowerCase("tr").includes(needle)):rows;
  },[orders,picked,query,shipments,status]);
  const todo=work.filter(item=>!item.completed); const done=work.filter(item=>item.completed);

  return <div className="space-y-5 pt-4">
    <div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Günlük operasyon</p><h1 className="page-title">Bugünün işleri</h1><p className="mt-2 text-sm text-muted">Toplama, paketleme ve sevkiyat tek akışta.</p></div><button className="icon-button shrink-0" aria-label="Listeyi yenile" onClick={()=>void load(false)}><RefreshCw size={20}/></button></div>
    <section className="grid grid-cols-3 gap-2" aria-label="İş özeti"><div className="metric-card min-h-20 p-3"><span className="text-xs font-bold text-muted">Toplanacak</span><strong className="mt-2 text-2xl font-black">{orders.length}</strong></div><div className="metric-card min-h-20 p-3"><span className="text-xs font-bold text-muted">Paket / sevk</span><strong className="mt-2 text-2xl font-black">{shipments.filter(item=>item.state!=="DISPATCHED").length}</strong></div><div className="metric-card min-h-20 p-3"><span className="text-xs font-bold text-muted">Tamamlanan</span><strong className="mt-2 text-2xl font-black">{done.length}</strong></div></section>
    <div className="sticky top-0 z-20 -mx-4 space-y-3 bg-canvas/95 px-4 py-3 backdrop-blur"><label className="relative block"><Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={20}/><input className="field pl-12" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Sipariş kodu veya müşteri ara" aria-label="Sipariş ara"/></label><div className="flex gap-2 overflow-x-auto pb-1">{(["Tümü","Hazırlanıyor","Toplanıyor"] as const).map(item=><button key={item} className={`filter-chip ${status===item?"filter-chip-active":""}`} onClick={()=>setStatus(item)}>{item}</button>)}</div></div>
    {loading?<LoadingState label="Günlük işler getiriliyor"/>:error?<ErrorState message={error} retry={load}/>:<><WorkSection title="Tamamlanacak" items={todo}/><WorkSection title="Bugün tamamlanan" items={done} completed/></>}
  </div>;
}

function WorkSection({title,items,completed=false}:{title:string;items:WorkItem[];completed?:boolean}) {
  return <section className="space-y-3"><div className="flex items-center gap-2">{completed?<CheckCircle2 size={19} className="text-success"/>:<Clock3 size={19} className="text-moss"/>}<h2 className="text-lg font-black">{title}</h2><span className="ml-auto rounded-full bg-white px-2.5 py-1 text-xs font-black text-muted">{items.length}</span></div>{items.map(item=><Link key={item.id} to={item.href} className="block rounded-2xl border border-line bg-white p-4 shadow-sm transition active:scale-[.99]"><div className="flex items-start justify-between gap-3"><div><p className="text-lg font-black tracking-tight">{item.orderNumber}</p><p className="mt-1 text-sm font-semibold text-muted">{item.customer}</p></div>{item.order?<StatusBadge status={item.order.status}/>:<span className={`rounded-full px-2.5 py-1 text-xs font-black ${completed?"bg-emerald-100 text-emerald-800":"bg-blue-50 text-moss"}`}>{item.label}</span>}</div><div className="mt-3 flex items-center justify-between border-t border-line pt-3"><span className="text-xs font-bold text-muted">{item.detail}</span><strong className="text-xs text-moss" aria-hidden="true">›</strong></div></Link>)}{!items.length&&<div className="state-card min-h-32"><PackageOpen size={30} className="text-muted"/><p className="font-black">Bu bölümde iş yok</p></div>}</section>;
}
