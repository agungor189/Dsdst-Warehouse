import {
  Boxes, ClipboardCheck, FileUp, MapPin, Move, PackageCheck, Printer, RefreshCw, Scale, Settings2,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ScanInput } from "../features/picking/ScanInput";
import { hasWarehousePermission, useAuth } from "../features/auth/AuthContext";
import { getErrorMessage, warehouseAdminApi } from "../lib/api";
import type { ImportPreview, InboundBatch, WarehouseLocation, WarehousePackage, WarehousePermission } from "../types/warehouse";

const permissionLabels: Record<WarehousePermission, string> = {
  "warehouse:receive": "Mal Kabul",
  "warehouse:print_labels": "Etiketleme",
  "warehouse:place_packages": "Yerleştirme",
  "warehouse:move_stock": "Ürün Taşıma",
  "warehouse:manage_locations": "Lokasyonlar",
  "warehouse:count_stock": "Stok Sayımı",
  "warehouse:edit_label_templates": "Etiket Şablonları",
};

function PageIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="pt-4"><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1><p className="mt-2 text-sm leading-6 text-muted">{description}</p></div>;
}

function Notice({ message, error = false }: { message: string; error?: boolean }) {
  return <p role={error ? "alert" : "status"} className={`rounded-2xl p-4 text-sm font-bold ${error ? "bg-red-50 text-danger" : "bg-emerald-50 text-success"}`}>{message}</p>;
}

export function PermissionPage({ permission, children }: { permission: WarehousePermission; children: ReactNode }) {
  const { user } = useAuth();
  if (!hasWarehousePermission(user, permission)) {
    return <div className="state-card mt-6 text-center"><Settings2 size={34}/><h1 className="text-xl font-black">Yetki gerekli</h1><p className="text-sm text-muted">Bu ekran için <b>{permission}</b> yetkisi gerekli.</p></div>;
  }
  return children;
}

const adminCards: Array<{ to: string; permission: WarehousePermission; title: string; description: string; icon: typeof Boxes }> = [
  { to: "/admin/inbound", permission: "warehouse:receive", title: "Mal Kabul", description: "Parti oluştur, dosyayı önizle ve paketleri hazırla", icon: FileUp },
  { to: "/admin/labeling", permission: "warehouse:print_labels", title: "Etiketleme", description: "Tedarikçi koduyla sıradaki paketi ayır ve bas", icon: Printer },
  { to: "/admin/placement", permission: "warehouse:place_packages", title: "Yerleştirme", description: "Paket ve lokasyonu sırayla okut", icon: PackageCheck },
  { to: "/admin/move", permission: "warehouse:move_stock", title: "Ürün Taşıma", description: "Paketin lokasyonunu güvenle değiştir", icon: Move },
  { to: "/admin/locations", permission: "warehouse:manage_locations", title: "Lokasyonlar", description: "Kapasite ve dolulukları yönet", icon: MapPin },
  { to: "/admin/count", permission: "warehouse:count_stock", title: "Stok Sayımı", description: "Paket bakiyesini say ve senkronize et", icon: Scale },
  { to: "/admin/prints", permission: "warehouse:print_labels", title: "Baskı Geçmişi", description: "Kuyruk, hata ve deneme sayılarını izle", icon: ClipboardCheck },
  { to: "/admin/templates", permission: "warehouse:edit_label_templates", title: "Etiket Şablonları", description: "Merkezi Label Printer JSON şablonunu sürümle", icon: Settings2 },
];

export function WarehouseAdminPage() {
  const { user } = useAuth();
  const visible = adminCards.filter((card) => hasWarehousePermission(user, card.permission));
  return <div className="space-y-5"><PageIntro eyebrow="Warehouse Admin" title="Depo operasyonları" description="Mal kabulden paket bazlı stok ve yerleştirmeye kadar kontrollü operasyon ekranları."/>
    <div className="grid gap-3 sm:grid-cols-2">{visible.map((card) => <Link key={card.to} to={card.to} className="rounded-2xl border border-line bg-white p-5 shadow-sm transition active:scale-[.99]"><card.icon className="text-moss"/><h2 className="mt-4 font-black">{card.title}</h2><p className="mt-1 text-sm leading-5 text-muted">{card.description}</p></Link>)}</div>
    {!visible.length && <Notice error message="Bu kullanıcıya henüz Warehouse Admin yetkisi verilmemiş."/>}
  </div>;
}

export function parseDelimitedText(source: string): Array<Record<string, string>> {
  const firstLine = source.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? ";" : ",";
  const records: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && quoted && source[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { row.push(value.trim()); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(value.trim()); value = "";
      if (row.some(Boolean)) records.push(row);
      row = [];
    } else value += char;
  }
  row.push(value.trim());
  if (row.some(Boolean)) records.push(row);
  const headers = records.shift()?.map((header) => header.trim()) || [];
  return records.map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] || ""])));
}

export function InboundPage() {
  const [batches, setBatches] = useState<InboundBatch[]>([]);
  const [selected, setSelected] = useState<InboundBatch | null>(null);
  const [supplierCode, setSupplierCode] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = () => warehouseAdminApi.listBatches().then(setBatches).catch((reason) => setError(getErrorMessage(reason)));
  useEffect(() => { void reload(); }, []);
  const create = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { const batch = await warehouseAdminApi.createBatch({ supplier_code: supplierCode, supplier_name: supplierName }); setSelected(batch); setSupplierCode(""); setSupplierName(""); setMessage(`${batch.batch_number} oluşturuldu.`); reload(); }
    catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const readFile = async (file?: File) => {
    if (!file) return;
    const parsed = parseDelimitedText(await file.text());
    setRows(parsed); setPreview(null); setMessage(`${parsed.length} veri satırı okundu; henüz veritabanına yazılmadı.`);
  };
  const runPreview = async () => {
    if (!selected) return; setBusy(true); setError("");
    try { setPreview(await warehouseAdminApi.previewImport(selected.id, rows)); }
    catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!selected || !preview?.valid) return; setBusy(true); setError("");
    try { const updated = await warehouseAdminApi.applyImport(selected.id, rows, preview.preview_hash); setSelected(updated); setPreview(null); setRows([]); setMessage(`${updated.expected_package_count} fiziksel paket oluşturuldu.`); reload(); }
    catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); }
  };
  return <PermissionPage permission="warehouse:receive"><div className="space-y-5"><PageIntro eyebrow="Mal Kabul" title="Giriş partileri" description="Dosya önce sadece doğrulanır. Onay verdiğinizde ürün satırları ve fiziksel paketler tek transaction içinde oluşur."/>
    {message && <Notice message={message}/>} {error && <Notice error message={error}/>}
    <form onSubmit={create} className="space-y-3 rounded-2xl border border-line bg-white p-4"><h2 className="font-black">Yeni parti</h2><input className="field" value={supplierCode} onChange={(event) => setSupplierCode(event.target.value)} placeholder="Tedarikçi kodu" required/><input className="field" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Tedarikçi adı (opsiyonel)"/><button className="primary-button w-full" disabled={busy}>Parti oluştur</button></form>
    <section className="rounded-2xl border border-line bg-white p-4"><h2 className="font-black">Partiler</h2><div className="mt-3 space-y-2">{batches.map((batch) => <button key={batch.id} onClick={() => { setSelected(batch); setPreview(null); setRows([]); }} className={`w-full rounded-xl border p-3 text-left ${selected?.id === batch.id ? "border-moss bg-emerald-50" : "border-line"}`}><span className="font-black">{batch.batch_number}</span><span className="float-right text-xs font-black text-moss">{batch.status}</span><p className="mt-1 text-xs text-muted">{batch.supplier_code} · {batch.package_count ?? batch.expected_package_count} paket · {batch.placed_count || 0} yerleşti</p></button>)}</div></section>
    {selected?.status === "DRAFT" && <section className="space-y-3 rounded-2xl border border-line bg-white p-4"><h2 className="font-black">CSV / master içe aktarımı</h2><p className="text-xs leading-5 text-muted">Desteklenen alanlar: SKU veya tedarikçi kodu, paket sayısı, paket içi adet, toplam adet ve lot. Virgül/noktalı virgül ve tırnaklı alanlar desteklenir.</p><input className="field" type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event.target.files?.[0])}/><button className="secondary-button w-full" disabled={!rows.length || busy} onClick={() => void runPreview()}>Kuru çalıştır / önizle</button>{preview && <div className="rounded-xl bg-canvas p-3 text-sm"><b>{preview.totals.lines} satır · {preview.totals.packages} paket · {preview.totals.units} adet</b>{preview.errors.map((item) => <p key={`${item.source_row}-${item.code}`} className="mt-2 text-danger">Satır {item.source_row}: {item.message}</p>)}{preview.valid && <button className="primary-button mt-4 w-full" onClick={() => void apply()}>Onayla ve paketleri oluştur</button>}</div>}</section>}
  </div></PermissionPage>;
}

function PackageCard({ pkg }: { pkg: WarehousePackage }) {
  return <div className="rounded-2xl border border-line bg-white p-5"><span className="text-xs font-black uppercase text-moss">{pkg.status}</span><h2 className="mt-1 text-2xl font-black">{pkg.package_code}</h2><p className="mt-2 font-bold">{pkg.product_name_snapshot}</p><p className="mt-1 text-sm text-muted">{pkg.sku_snapshot} · Paket {pkg.package_number}/{pkg.total_packages} · {pkg.planned_quantity} adet</p>{pkg.location_code && <p className="mt-2 font-black text-moss">{pkg.location_code}</p>}</div>;
}

export function LabelingPage() {
  const [pkg, setPkg] = useState<WarehousePackage | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const claim = async (code: string) => { setBusy(true); setError(""); try { setPkg(await warehouseAdminApi.claimNext(code)); setMessage(""); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  const print = async () => { if (!pkg) return; setBusy(true); setError(""); try { const result = await warehouseAdminApi.queuePrint(pkg.id, pkg.claim_token); setPkg(result.package); setMessage(`${pkg.package_code} baskı kuyruğuna eklendi.`); } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); } };
  return <PermissionPage permission="warehouse:print_labels"><div className="space-y-5"><PageIntro eyebrow="Etiketleme" title="Sıradaki paketi ayır" description="Tedarikçi kodu paketi kısa süreli ayırır. Barkod/QR PDF’i kuyrukta hazırlanıp CUPS yazıcısına gönderilir."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>}<ScanInput busy={busy} onScan={claim} label="Tedarikçi kodunu okutun" placeholder="Tedarikçi kodu" cameraTitle="Tedarikçi kodunu okutun"/>{pkg && <><PackageCard pkg={pkg}/><button className="primary-button w-full" disabled={busy} onClick={() => void print()}><Printer/>Etiketi kuyruğa gönder</button></>}</div></PermissionPage>;
}

function TwoStepPackagePage({ mode }: { mode: "place" | "move" }) {
  const permission = mode === "place" ? "warehouse:place_packages" : "warehouse:move_stock";
  const [pkg, setPkg] = useState<WarehousePackage | null>(null); const [suggestion, setSuggestion] = useState<WarehouseLocation | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const scanPackage = async (code: string) => { setBusy(true); setError(""); try { setPkg(await warehouseAdminApi.getPackage(code)); if (mode === "place") warehouseAdminApi.suggestLocation().then(setSuggestion).catch(() => setSuggestion(null)); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  const scanLocation = async (code: string) => { if (!pkg) return false; setBusy(true); setError(""); try { const result = mode === "place" ? await warehouseAdminApi.placePackage(pkg.package_code, code) : await warehouseAdminApi.movePackage(pkg.package_code, code); setMessage(`${result.package.package_code} → ${result.package.location_code}`); setPkg(null); setSuggestion(null); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  return <PermissionPage permission={permission}><div className="space-y-5"><PageIntro eyebrow={mode === "place" ? "Yerleştirme" : "Ürün Taşıma"} title={mode === "place" ? "Paket → lokasyon" : "Paketi taşı"} description="İşlem sırası sabittir: önce benzersiz paket kodu, sonra hedef lokasyon kodu okutulur."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>} {!pkg ? <ScanInput busy={busy} onScan={scanPackage} label="1. Paket kodunu okutun" placeholder="PKG-…" cameraTitle="Paket kodunu okutun"/> : <><PackageCard pkg={pkg}/>{suggestion && <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-success">Önerilen lokasyon: {suggestion.code} · {suggestion.available_capacity} boş kapasite</p>}<ScanInput busy={busy} onScan={scanLocation} label="2. Hedef lokasyonu okutun" placeholder="A1-K1-P1" cameraTitle="Hedef lokasyonu okutun"/></>}</div></PermissionPage>;
}

export const PlacementPage = () => <TwoStepPackagePage mode="place"/>;
export const MoveStockPage = () => <TwoStepPackagePage mode="move"/>;

export function LocationsPage() {
  const [locations, setLocations] = useState<WarehouseLocation[]>([]); const [code, setCode] = useState(""); const [capacity, setCapacity] = useState("1"); const [error, setError] = useState("");
  const reload = () => warehouseAdminApi.listLocations().then(setLocations).catch((reason) => setError(getErrorMessage(reason)));
  useEffect(() => { void reload(); }, []);
  const create = async (event: FormEvent) => { event.preventDefault(); setError(""); try { await warehouseAdminApi.createLocation({ code, package_capacity: Number(capacity) }); setCode(""); setCapacity("1"); reload(); } catch (reason) { setError(getErrorMessage(reason)); } };
  return <PermissionPage permission="warehouse:manage_locations"><div className="space-y-5"><PageIntro eyebrow="Lokasyonlar" title="Kapasite yönetimi" description="Yerleştirme önerisi en düşük doluluk ve kod sırasına göre deterministik olarak seçilir."/>{error && <Notice error message={error}/>}<form onSubmit={create} className="grid grid-cols-[1fr_90px] gap-3 rounded-2xl border border-line bg-white p-4"><input className="field uppercase" value={code} onChange={(event) => setCode(event.target.value)} placeholder="A1-K1-P1" required/><input className="field" type="number" min="1" value={capacity} onChange={(event) => setCapacity(event.target.value)}/><button className="primary-button col-span-2">Lokasyon ekle</button></form><div className="space-y-2">{locations.map((location) => <div className="rounded-2xl border border-line bg-white p-4" key={location.id}><b>{location.code}</b><span className="float-right font-black text-moss">{location.occupied_packages}/{location.package_capacity}</span><div className="mt-3 h-2 overflow-hidden rounded bg-line"><span className="block h-full bg-moss" style={{ width: `${Math.min(100, location.occupied_packages / location.package_capacity * 100)}%` }}/></div></div>)}</div></div></PermissionPage>;
}

export function StockCountPage() {
  const [pkg, setPkg] = useState<WarehousePackage | null>(null); const [quantity, setQuantity] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const scan = async (code: string) => { setBusy(true); setError(""); try { const found = await warehouseAdminApi.getPackage(code); setPkg(found); setQuantity(String(found.remaining_quantity)); return true; } catch (reason) { setError(getErrorMessage(reason)); return false; } finally { setBusy(false); } };
  const submit = async () => { if (!pkg) return; setBusy(true); try { const result = await warehouseAdminApi.countPackage(pkg.package_code, Number(quantity)); setMessage(`${result.package.package_code}: ${result.package.remaining_quantity} adet kaydedildi.`); setPkg(null); } catch (reason) { setError(getErrorMessage(reason)); } finally { setBusy(false); } };
  return <PermissionPage permission="warehouse:count_stock"><div className="space-y-5"><PageIntro eyebrow="Stok Sayımı" title="Paket bakiyesini say" description="Fark, paket hareketi ve merkez stok hareketi olarak aynı işlemde kaydedilir."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>} {!pkg ? <ScanInput busy={busy} onScan={scan} label="Paket kodunu okutun" placeholder="PKG-…" cameraTitle="Sayılacak paketi okutun"/> : <><PackageCard pkg={pkg}/><input className="field text-xl font-black" type="number" min="0" value={quantity} onChange={(event) => setQuantity(event.target.value)}/><button className="primary-button w-full" disabled={busy} onClick={() => void submit()}>Sayımı kaydet</button></>}</div></PermissionPage>;
}

export function PrintJobsPage() {
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]); const [error, setError] = useState("");
  const reload = () => warehouseAdminApi.listPrintJobs().then(setJobs).catch((reason) => setError(getErrorMessage(reason)));
  useEffect(() => { void reload(); }, []);
  const reprint = async (job: Record<string, unknown>) => { try { await warehouseAdminApi.queuePrint(String(job.package_id)); await reload(); } catch (reason) { setError(getErrorMessage(reason)); } };
  return <PermissionPage permission="warehouse:print_labels"><div className="space-y-5"><PageIntro eyebrow="Baskı Geçmişi" title="Etiket kuyruğu" description="Her yeniden baskı aynı paket kodunu korur; yeni, izlenebilir bir baskı işi oluşturur."/><button className="secondary-button w-full" onClick={reload}><RefreshCw/>Yenile</button>{error && <Notice error message={error}/>}<div className="space-y-2">{jobs.map((job) => <div key={String(job.id)} className="rounded-2xl border border-line bg-white p-4"><b>{String(job.package_code)}</b><span className={`float-right text-xs font-black ${job.status === "FAILED" ? "text-danger" : "text-moss"}`}>{String(job.status)}</span><p className="mt-1 text-xs text-muted">{String(job.sku_snapshot)} · deneme {String(job.attempts)}/{String(job.max_attempts)}</p>{Boolean(job.error_message) && <p className="mt-2 text-xs text-danger">{String(job.error_message)}</p>}{["PRINT_FAILED", "LABELED", "PLACED", "OPEN", "EMPTY"].includes(String(job.package_status)) && <button className="secondary-button mt-3 w-full" onClick={() => void reprint(job)}><Printer size={17}/>Aynı paketi yeniden bas</button>}</div>)}</div></div></PermissionPage>;
}

export function LabelTemplatesPage() {
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]); const [selected, setSelected] = useState<Record<string, unknown> | null>(null); const [json, setJson] = useState(""); const [name, setName] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const reload = async () => { try { const data = await warehouseAdminApi.listTemplates(); setTemplates(data); if (!selected && data[0]) { setSelected(data[0]); setName(String(data[0].name || "")); setJson(JSON.stringify(data[0].template, null, 2)); } } catch (reason) { setError(getErrorMessage(reason)); } };
  useEffect(() => { void reload(); }, []);
  const choose = (template: Record<string, unknown>) => { setSelected(template); setName(String(template.name || "")); setJson(JSON.stringify(template.template, null, 2)); setMessage(""); setError(""); };
  const save = async () => { try { const template = JSON.parse(json); await warehouseAdminApi.saveTemplate({ id: selected?.id, name, template, is_default: selected?.is_default === 1 }); setMessage("Şablon yeni sürüm olarak kaydedildi."); await reload(); } catch (reason) { setError(reason instanceof SyntaxError ? "JSON biçimi geçersiz." : getErrorMessage(reason)); } };
  return <PermissionPage permission="warehouse:edit_label_templates"><div className="space-y-5"><PageIntro eyebrow="Etiket Şablonları" title="Merkezi JSON şablonu" description="Label Printer tasarım JSON'u değişmeden Panel veritabanında sürümlenir; baskı işleri seçilen snapshot'ı kullanır."/>{message && <Notice message={message}/>} {error && <Notice error message={error}/>}<div className="flex gap-2 overflow-x-auto">{templates.map((template) => <button key={String(template.id)} className="filter-chip" onClick={() => choose(template)}>{String(template.name)}</button>)}</div><input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Şablon adı"/><textarea className="field min-h-96 font-mono text-xs" spellCheck={false} value={json} onChange={(event) => setJson(event.target.value)}/><button className="primary-button w-full" onClick={() => void save()}>Şablonu kaydet</button></div></PermissionPage>;
}

export { permissionLabels };
