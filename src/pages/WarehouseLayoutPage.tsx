import { AlertTriangle, CheckCircle2, Layers3, MapPin, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";
import { getErrorMessage, warehouseAdminApi } from "../lib/api";
import type { WarehousePlacementAssignment, WarehousePlacementLayout, WarehousePlacementPreview } from "../types/warehouse";
import { PermissionPage } from "./WarehouseAdminPages";

type CellAssignment = { assignment: WarehousePlacementAssignment; role: "PICK" | "RESERVE" };

export default function WarehouseLayoutPage() {
  const { user } = useAuth();
  const canManage = hasWarehousePermission(user, "warehouse:manage_locations");
  const [layout, setLayout] = useState<WarehousePlacementLayout | null>(null);
  const [preview, setPreview] = useState<WarehousePlacementPreview | null>(null);
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [selectedRack, setSelectedRack] = useState("");
  const [selected, setSelected] = useState<WarehousePlacementAssignment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const next = await warehouseAdminApi.getPlacementLayout();
      setLayout(next);
      setSelectedRack((current) => current || next.racks[0]?.rack_code || "");
      setError("");
    } catch (reason) { setError(getErrorMessage(reason)); }
  };
  useEffect(() => { void load(); }, []);

  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of layout?.assignments || []) counts.set(assignment.pick_group, (counts.get(assignment.pick_group) || 0) + 1);
    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right, "tr"));
  }, [layout]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return (layout?.assignments || []).filter((assignment) => {
      if (group && assignment.pick_group !== group) return false;
      if (!needle) return true;
      return [assignment.sku, assignment.product_name, assignment.supplier_no, assignment.pick_face_location,
        ...assignment.reserve_locations.map((location) => location.code)]
        .some((value) => String(value || "").toLocaleLowerCase("tr-TR").includes(needle));
    });
  }, [group, layout, query]);
  const cells = useMemo(() => {
    const result = new Map<string, CellAssignment[]>();
    const add = (code: string, value: CellAssignment) => result.set(code, [...(result.get(code) || []), value]);
    for (const assignment of filtered) {
      add(assignment.pick_face_location, { assignment, role: "PICK" });
      assignment.reserve_locations.forEach((location) => add(location.code, { assignment, role: "RESERVE" }));
    }
    return result;
  }, [filtered]);
  const rack = layout?.racks.find((item) => item.rack_code === selectedRack) || layout?.racks[0];

  const chooseFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError(""); setMessage(""); setPreview(null);
    try {
      const text = await file.text();
      setCsv({ name: file.name, text });
      setPreview(await warehouseAdminApi.previewPlacementLayout(file.name, text));
    } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!csv || !preview?.valid) return;
    setBusy(true); setError("");
    try {
      const next = await warehouseAdminApi.applyPlacementLayout(csv.name, csv.text, preview.preview_hash, notes);
      setLayout(next); setPreview(null); setCsv(null); setNotes(""); setMessage(`Layout v${next.active?.layout_version} aktif edildi. Fiziksel stok değişmedi.`);
    } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };

  return <PermissionPage permission="warehouse:view_map"><div className="space-y-5 pt-4">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Depo</p><h1 className="page-title">Depo Yerleşimi</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted">Ürün masterından bağımsız pick-face ve rezerv planı. Bu ekran stok oluşturmaz; gerçek stok yalnız Mal Kabul yerleştirmesiyle oluşur.</p></div>{canManage && <label className="primary-button cursor-pointer"><Upload size={18}/>{busy ? "Analiz ediliyor…" : "Yerleşim Dosyası Yükle"}<input className="sr-only" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => void chooseFile(event.target.files?.[0])}/></label>}</header>
    {message && <p className="rounded-2xl bg-emerald-50 p-4 font-bold text-success">{message}</p>}{error && <p role="alert" className="rounded-2xl bg-red-50 p-4 font-bold text-danger">{error}</p>}
    {preview && <section className="rounded-3xl border border-line bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Yerleşim Dosyası</p><h2 className="text-xl font-black">{preview.source_filename}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-black ${preview.valid ? "bg-emerald-100 text-success" : "bg-red-100 text-danger"}`}>{preview.valid ? "Uygulanabilir" : "Kritik hata var"}</span></div><div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">{[["SKU okundu",preview.summary.rows_read],["SKU eşleşti",preview.summary.matched_skus],["Bilinmeyen",preview.summary.unknown_skus],["Geçersiz lokasyon",preview.summary.invalid_locations],["Pick-face çakışması",preview.summary.pick_face_conflicts],["Uyarı",preview.summary.warnings]].map(([label,value]) => <div className="rounded-xl bg-canvas p-3" key={label}><small className="block font-bold text-muted">{label}</small><b className="text-xl">{value}</b></div>)}</div>{preview.issues.length > 0 && <details className="mt-4 rounded-xl border border-line p-3" open={!preview.valid}><summary className="cursor-pointer font-black">Detayları Gör ({preview.issues.length})</summary><div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{preview.issues.map((issue, index) => <p className={`flex gap-2 rounded-lg p-2 text-sm ${issue.severity === "error" ? "bg-red-50 text-danger" : "bg-amber-50 text-amber-900"}`} key={`${issue.code}-${issue.source_row}-${index}`}>{issue.severity === "error" ? <AlertTriangle size={17}/> : <AlertTriangle size={17}/>}<span>{issue.source_row ? `Satır ${issue.source_row}: ` : ""}{issue.message}</span></p>)}</div></details>}<textarea className="field mt-4 min-h-20" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Versiyon notu (opsiyonel)"/><div className="mt-4 flex justify-end gap-2"><button className="secondary-button" onClick={() => { setPreview(null); setCsv(null); }}>İptal</button><button className="primary-button" disabled={!preview.valid || busy} onClick={() => void apply()}><CheckCircle2 size={18}/>Yerleşimi Uygula</button></div></section>}
    <div className="rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-950 lg:hidden">Depo Yerleşimi yönetimi desktop ekranlarda kullanılabilir. Mobil Mal Kabul ve tarama akışı değişmeden devam eder.</div>
    <div className="hidden min-h-[680px] grid-cols-[280px_minmax(0,1fr)_320px] gap-4 lg:grid">
      <aside className="space-y-4 rounded-3xl border border-line bg-white p-4"><label className="relative block"><Search className="absolute left-3 top-3.5 text-muted" size={18}/><input className="field pl-10" placeholder="SKU, ürün, supplier, lokasyon" value={query} onChange={(event) => setQuery(event.target.value)}/></label><div><p className="eyebrow">Raflar</p><div className="mt-2 grid grid-cols-3 gap-2">{layout?.racks.map((item) => <button onClick={() => setSelectedRack(item.rack_code)} className={`rounded-xl border p-2 text-sm font-black ${rack?.rack_code === item.rack_code ? "border-forest bg-forest text-white" : "border-line"}`} key={item.rack_code}>{item.rack_code}{item.status === "RESTRICTED" && <small className="mt-1 block text-[9px] text-amber-500">KISITLI</small>}</button>)}</div></div><div><p className="eyebrow">Yerleşim Grupları</p><button className={`mt-2 w-full rounded-xl p-2 text-left text-sm font-bold ${!group ? "bg-canvas" : ""}`} onClick={() => setGroup("")}>Tüm gruplar · {layout?.assignments.length || 0}</button><div className="mt-1 max-h-80 space-y-1 overflow-y-auto">{groups.map(([name,count]) => <button className={`w-full rounded-xl p-2 text-left text-xs ${group === name ? "bg-forest font-bold text-white" : "hover:bg-canvas"}`} onClick={() => setGroup(name)} key={name}>{name}<b className="float-right">{count}</b></button>)}</div></div></aside>
      <main className="rounded-3xl border border-line bg-white p-5"><div className="flex items-start justify-between"><div><p className="eyebrow">Raf Board</p><h2 className="text-3xl font-black">{rack?.rack_code || "Raf yok"}</h2></div>{rack?.status === "RESTRICTED" && <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-black text-danger">Kısıtlı erişim / Son çare</span>}</div>{rack && <div className="mt-6 space-y-4">{Array.from({ length: rack.shelf_count }, (_, index) => rack.shelf_count - index).map((shelf) => <div key={shelf}><p className="mb-2 text-xs font-black uppercase tracking-wider text-muted">Kat {shelf}</p><div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${rack.positions_per_shelf}, minmax(76px, 1fr))` }}>{Array.from({ length: rack.positions_per_shelf }, (_, positionIndex) => { const code = `${rack.rack_code}-K${shelf}-P${positionIndex + 1}`; const entries = cells.get(code) || []; const first = entries[0]; const restricted = rack.status === "RESTRICTED" || rack.status === "DISABLED"; return <button key={code} onClick={() => first && setSelected(first.assignment)} className={`min-h-24 rounded-xl border p-2 text-left transition ${restricted ? "border-red-300 bg-red-50" : first?.role === "PICK" ? "border-emerald-400 bg-emerald-50" : first?.role === "RESERVE" ? "border-blue-300 bg-blue-50" : "border-line bg-slate-50"}`}><small className="block text-[10px] font-black text-muted">P{positionIndex + 1} · {restricted ? "KISITLI" : first?.role || "BOŞ"}</small>{first && <><b className="mt-2 block break-words text-xs">{first.assignment.sku}</b>{entries.length > 1 && <span className="text-[10px] font-bold text-muted">+{entries.length - 1} SKU</span>}</>}</button>; })}</div></div>)}</div>}<div className="mt-6 flex flex-wrap gap-4 text-xs font-bold"><span className="text-success">■ PICK FACE</span><span className="text-blue-600">■ RESERVE</span><span className="text-slate-500">■ BOŞ</span><span className="text-danger">■ KISITLI</span></div></main>
      <aside className="rounded-3xl border border-line bg-white p-5"><p className="eyebrow">Detay</p>{selected ? <div className="mt-3 space-y-4"><div><h2 className="text-2xl font-black">{selected.sku}</h2><p className="text-sm text-muted">{selected.product_name}</p></div><dl className="space-y-3 text-sm">{[["Supplier No",selected.supplier_no],["Materyal",selected.material],["Profil tipi",selected.profile_type],["Ölçü",selected.size],["Pick group",selected.pick_group],["Pick-face",selected.pick_face_location],["Reserve",selected.reserve_locations.map((item) => item.code).join(", ") || "—"]].map(([label,value]) => <div key={String(label)}><dt className="text-xs font-bold text-muted">{label}</dt><dd className="font-black">{value || "—"}</dd></div>)}</dl></div> : group ? <div className="mt-3"><Layers3 className="text-moss"/><h2 className="mt-3 text-xl font-black">{group}</h2><p className="mt-2 text-sm text-muted">{filtered.length} SKU</p><p className="mt-1 text-sm">Pick-face rafları: {[...new Set(filtered.map((item) => item.pick_face_location.split("-K")[0]))].join(", ") || "—"}</p></div> : <p className="mt-3 text-sm text-muted">Detay görmek için board üzerinde bir SKU veya soldan bir grup seçin.</p>}<details className="mt-8 border-t border-line pt-4"><summary className="cursor-pointer font-black">Layout Geçmişi</summary><div className="mt-3 space-y-2">{layout?.history.map((item) => <div className="rounded-xl bg-canvas p-3 text-xs" key={item.id}><b>Layout v{item.layout_version}</b><span className="float-right font-black text-moss">{item.status}</span><p className="mt-1 text-muted">{item.sku_count} SKU · {new Date(item.created_at).toLocaleString("tr-TR")}</p><p className="truncate text-muted">{item.source_filename || "Fiziksel plan"}</p></div>)}</div></details></aside>
    </div>
  </div></PermissionPage>;
}
