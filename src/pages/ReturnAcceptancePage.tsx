import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { returnsApi } from "../lib/api";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";
import { Button, Card, EmptyState, Input, PageHeader, Select } from "../components/ui";

type Draft = { quantity: string; disposition: "SELLABLE" | "DAMAGED" | "MISSING_NOT_RECEIVED"; locationId: string };

export default function ReturnAcceptancePage() {
  const { user } = useAuth();
  const [returns, setReturns] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const allowed = hasWarehousePermission(user, "warehouse:accept_returns");
  const load = async () => { const rows = await returnsApi.listApproved(); setReturns(rows); if (!selectedId && rows[0]) setSelectedId(rows[0].id); };
  useEffect(() => { if (allowed) void load().catch((error) => setFeedback(error.message)); }, [allowed]);
  const filtered = useMemo(() => returns.filter((item) => JSON.stringify([item.id, item.saleId, ...item.lines.map((line: any) => [line.sku, line.title])]).toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR"))), [returns, search]);
  const selected = returns.find((item) => item.id === selectedId);
  if (!allowed) return <EmptyState className="mt-6" title="Yetki gerekli" description="warehouse:accept_returns yetkisi olmadan iade kabulü yapılamaz."/>;

  const submit = async () => {
    const lines = selected.lines.flatMap((line: any) => {
      const row = drafts[line.id]; const quantity = Number(row?.quantity || 0);
      return quantity > 0 ? [{ returnLineId: line.id, quantityBaseInt: quantity, disposition: row.disposition, locationId: row.disposition === "MISSING_NOT_RECEIVED" ? null : row.locationId.trim() }] : [];
    });
    if (!lines.length) { setFeedback("En az bir incelenen adet girin."); return; }
    setBusy(true); setFeedback("");
    try { await returnsApi.receive(selected.id, lines); setDrafts({}); await load(); setFeedback("Fiziksel iade Panel’e gönderildi."); }
    catch (error: any) { setFeedback(error.message); } finally { setBusy(false); }
  };

  return <div className="space-y-5 pt-4"><PageHeader eyebrow="V2-10" title="İade Kabul" description="Yalnız Panel tarafından onaylanmış iadeleri fiziksel olarak incele ve sınıflandır."/>
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]"><Card as="aside" className="rounded-3xl"><Input autoFocus placeholder="İade, sipariş veya SKU okut/ara" value={search} onChange={(event) => setSearch(event.target.value)}/><div className="mt-3 space-y-2">{filtered.map((item) => <Button variant="secondary" key={item.id} className={`h-auto w-full justify-start rounded-xl p-3 text-left ${item.id === selectedId ? "border-forest bg-canvas" : "border-line"}`} onClick={() => setSelectedId(item.id)}><span><b className="block text-sm">{item.saleId}</b><span className="text-xs text-muted">{item.inspection.remainingQuantityBaseInt} adet bekliyor · {item.id.slice(0, 8)}</span></span></Button>)}</div></Card>
      <Card as="main" padding="lg" className="rounded-3xl">{selected ? <><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-acid text-forest"><RotateCcw/></span><div><h2 className="text-xl font-black">{selected.saleId}</h2><p className="text-xs text-muted">{selected.commissionReversalState ? `Komisyon ${selected.commissionReversalState} · ` : ""}RETURN_LOSS ₺{(selected.returnLossTryMinor / 100).toFixed(2)}</p></div></div><div className="mt-5 space-y-3">{selected.lines.map((line: any) => {
        const row = drafts[line.id] || { quantity: "", disposition: "SELLABLE", locationId: "" };
        const inspected = Object.values(line.dispositions || {}).reduce((sum: number, value: any) => sum + Number(value), 0);
        const remaining = line.returnQuantityBaseInt - inspected;
        return <Card key={line.id}><b>{line.sku} · {line.title}</b><p className="text-xs text-muted">Onaylı {line.returnQuantityBaseInt} · Kalan {remaining} · Sebep {line.reasonCode}</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><Input type="number" min="0" max={remaining} placeholder="İncelenen adet" value={row.quantity} onChange={(event) => setDrafts((current) => ({ ...current, [line.id]: { ...row, quantity: event.target.value } }))}/><Select value={row.disposition} onChange={(event) => setDrafts((current) => ({ ...current, [line.id]: { ...row, disposition: event.target.value as Draft["disposition"] } }))}><option>SELLABLE</option><option>DAMAGED</option><option>MISSING_NOT_RECEIVED</option></Select>{row.disposition !== "MISSING_NOT_RECEIVED" && <Input placeholder={row.disposition === "DAMAGED" ? "Karantina lokasyonu okut" : "Geçerli lokasyon okut"} value={row.locationId} onChange={(event) => setDrafts((current) => ({ ...current, [line.id]: { ...row, locationId: event.target.value } }))}/>}</div></Card>;
      })}</div><Button loading={busy} onClick={() => void submit()} className="mt-5">Panel’e gönder</Button></> : <EmptyState title="Bekleyen iade seçin." className="border-0"/>}</Card></div>{feedback && <p role="status" className="rounded-2xl bg-canvas p-4 text-sm font-bold">{feedback}</p>}</div>;
}
