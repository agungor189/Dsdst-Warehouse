import { BarChart3, CheckCircle2, PackageCheck, Search, Truck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingState } from "../components/AsyncState";
import { getErrorMessage, shipmentApi, warehouseApi } from "../lib/api";
import type { PickHistorySummary, PickSessionStatus, ShipmentListItem, WarehouseOrderSummary } from "../types/warehouse";

type Period = "daily" | "weekly" | "monthly";
const emptySummary:PickHistorySummary={completed_pick_count:0,total_sale_product_quantity:0,total_physical_item_quantity:0,total_net_weight_g:0,by_user:[]};
const statusOptions:Array<[""|PickSessionStatus,string]>=[["","Tüm durumlar"],["PICKING","Toplanıyor"],["PICKED","Toplandı"],["PACKING","Paketleniyor"],["PACKED","Paketlendi"],["SHIPPED","Sevk edildi"]];

const periodRange=(period:Period)=>{const to=new Date();to.setHours(23,59,59,999);const from=new Date(to);from.setHours(0,0,0,0);if(period==="weekly")from.setDate(from.getDate()-6);if(period==="monthly")from.setDate(from.getDate()-29);return{from,to}};

export function AnalyticsPage(){
  const [period,setPeriod]=useState<Period>("daily");const [query,setQuery]=useState("");const [status,setStatus]=useState<""|PickSessionStatus>("");
  const [orders,setOrders]=useState<WarehouseOrderSummary[]>([]);const [shipments,setShipments]=useState<ShipmentListItem[]>([]);const [summary,setSummary]=useState(emptySummary);
  const [loading,setLoading]=useState(true);const [error,setError]=useState("");
  const range=useMemo(()=>periodRange(period),[period]);
  useEffect(()=>{let active=true;setLoading(true);setError("");const timer=window.setTimeout(()=>{void Promise.all([
    warehouseApi.listOrders(1,100),shipmentApi.list("all",query,500),warehouseApi.listPickHistory({date_from:range.from.toISOString(),date_to:range.to.toISOString(),summary_from:range.from.toISOString(),summary_to:range.to.toISOString(),order_number:query.trim()||undefined,status:status||undefined},1,100),
  ]).then(([orderResult,shipmentRows,history])=>{if(!active)return;setOrders(orderResult.orders);setShipments(shipmentRows);setSummary(history.summary)}).catch(reason=>{if(active)setError(getErrorMessage(reason))}).finally(()=>{if(active)setLoading(false)})},250);return()=>{active=false;window.clearTimeout(timer)}},[period,query,range.from,range.to,status]);
  const inRange=(value:string)=>{const timestamp=Date.parse(value);return Number.isFinite(timestamp)&&timestamp>=range.from.getTime()&&timestamp<=range.to.getTime()};
  const needle=query.trim().toLocaleLowerCase("tr");
  const visibleOrders=orders.filter(order=>inRange(order.created_at)&&(!needle||`${order.order_code} ${order.customer||""}`.toLocaleLowerCase("tr").includes(needle)));
  const visibleShipments=shipments.filter(item=>inRange(item.updatedAt));
  const packed=visibleShipments.filter(item=>["CARRIER_SELECTED","BOOKED","LABEL_READY","DISPATCHED"].includes(item.state)).length;
  const dispatched=visibleShipments.filter(item=>item.state==="DISPATCHED").length;
  return <div className="space-y-5 pt-4"><div><p className="eyebrow">Canlı operasyon özeti</p><h1 className="page-title">Operasyon analizi</h1><p className="mt-2 text-sm leading-6 text-muted">Panel kayıtlarından türetilen, seçili döneme ait küçük mobil rapor.</p></div>
    <div className="flex gap-2 overflow-x-auto">{([['daily','Günlük'],['weekly','Haftalık'],['monthly','Aylık']] as Array<[Period,string]>).map(([value,label])=><button key={value} className={`filter-chip ${period===value?"filter-chip-active":""}`} onClick={()=>setPeriod(value)}>{label}</button>)}</div>
    <section className="grid grid-cols-2 gap-3" aria-label="Operasyon raporu"><Metric icon={<CheckCircle2 size={18}/>} label="Toplanan" value={summary.completed_pick_count}/><Metric icon={<PackageCheck size={18}/>} label="Paketlenen" value={packed}/><Metric icon={<Truck size={18}/>} label="Sevk edilen" value={dispatched}/><Metric icon={<BarChart3 size={18}/>} label="Fiziksel parça" value={summary.total_physical_item_quantity}/></section>
    <section className="grid gap-3 rounded-2xl border border-line bg-white p-4"><label className="relative block"><Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={20}/><input className="field pl-12" aria-label="Sipariş ara" placeholder="Sipariş no veya müşteri ara" value={query} onChange={event=>setQuery(event.target.value)}/></label><label className="text-xs font-bold text-muted">Durum filtresi<select className="field mt-1" value={status} onChange={event=>setStatus(event.target.value as ""|PickSessionStatus)}>{statusOptions.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></section>
    {loading?<LoadingState label="Analiz hazırlanıyor"/>:error?<ErrorState message={error}/>:<section className="rounded-2xl border border-line bg-white p-4"><div className="flex items-center justify-between"><h2 className="font-black">Sipariş görünümü</h2><span className="text-xs font-bold text-muted">{visibleOrders.length+visibleShipments.length} kayıt</span></div><div className="mt-3 grid gap-2">{visibleOrders.slice(0,5).map(order=><div key={order.id} className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2 text-sm"><strong>{order.order_code}</strong><span className="text-muted">{order.status}</span></div>)}{visibleShipments.slice(0,5).map(item=><div key={item.id} className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2 text-sm"><strong>{item.orderNumber}</strong><span className="text-muted">{item.state==="DISPATCHED"?"Sevk edildi":item.state==="LABEL_READY"?"Sevke hazır":"Paketleme"}</span></div>)}{visibleOrders.length===0&&visibleShipments.length===0&&<p className="py-5 text-center text-sm font-bold text-muted">Bu filtrelerde kayıt yok.</p>}</div></section>}
  </div>;
}

function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:number}){return <div className="metric-card min-h-24"><span className="flex items-center gap-2 text-xs font-bold text-muted">{icon}{label}</span><strong className="mt-2 text-2xl font-black">{value}</strong></div>}
