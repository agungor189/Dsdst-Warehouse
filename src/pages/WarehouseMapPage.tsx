import { Canvas, type ThreeEvent, useThree } from "@react-three/fiber";
import { Grid, Html, OrbitControls, Text } from "@react-three/drei";
import { Box, ChevronRight, MapPin, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { PermissionPage } from "./WarehouseAdminPages";
import { getErrorMessage, warehouseAdminApi } from "../lib/api";
import type { WarehouseLayoutObject, WarehouseMapLocation, WarehouseMapPackage, WarehouseMapSnapshot } from "../types/warehouse";
import { rackCodeFromLocation, searchWarehousePackages } from "../features/warehouse-map/model";

type ViewMode = "perspective" | "iso" | "top";

function rackLocationPosition(rack: WarehouseLayoutObject, code: string) {
  const match = code.match(/-K(\d+)-P(\d+)$/);
  const shelf = Number(match?.[1] || 1);
  const position = Number(match?.[2] || 1);
  const shelves = Math.max(1, rack.shelfCount || 1);
  const positions = Math.max(1, rack.positionsPerShelf || 1);
  return new THREE.Vector3(
    -rack.width / 2 + (position - 0.5) * rack.width / positions,
    (shelf - 0.5) * rack.height / shelves,
    0,
  );
}

function CameraController({ mode, focus, fitKey, layout }: { mode: ViewMode; focus: string | null; fitKey: number; layout: WarehouseMapSnapshot["warehouse"] }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { target?: THREE.Vector3; update?: () => void } | null;
  useEffect(() => {
    if (!layout) return;
    const { width, length, height } = layout.layout.warehouse;
    const size = Math.max(width, length, height);
    if (mode === "top") camera.position.set(0, size * 1.8, 0.01);
    else if (mode === "iso") camera.position.set(size * 0.85, size * 0.75, size * 0.85);
    else camera.position.set(size * 0.75, size * 0.6, size * 1.1);
    controls?.target?.set(0, 0, 0); controls?.update?.(); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
  }, [camera, controls, fitKey, layout, mode]);
  useEffect(() => {
    if (!focus || !layout) return;
    const rackCode = rackCodeFromLocation(focus);
    const rack = layout.layout.objects.find((object) => object.type === "rack" && object.rackCode === rackCode);
    if (!rack) return;
    const x = rack.x + rack.width / 2 - layout.layout.warehouse.width / 2;
    const z = rack.z + rack.depth / 2 - layout.layout.warehouse.length / 2;
    const target = new THREE.Vector3(x, rack.height * 0.5, z);
    camera.position.set(x + 2.7, rack.height + 1.5, z + 2.7);
    controls?.target?.copy(target); controls?.update?.(); camera.lookAt(target); camera.updateProjectionMatrix();
  }, [camera, controls, focus, layout]);
  return null;
}

function Rack({ rack, warehouse, locations, onLocation, onRack, heatmap }: { rack: WarehouseLayoutObject; warehouse: { width: number; length: number }; locations: WarehouseMapLocation[]; onLocation: (location: WarehouseMapLocation) => void; onRack: (rack: WarehouseLayoutObject) => void; heatmap: boolean }) {
  const shelves = Math.max(1, rack.shelfCount || 1);
  const positions = Math.max(1, rack.positionsPerShelf || 1);
  const cells = locations.filter((location) => location.rack_code === rack.rackCode);
  const x = rack.x + rack.width / 2 - warehouse.width / 2;
  const z = rack.z + rack.depth / 2 - warehouse.length / 2;
  return <group position={[x, 0, z]} rotation={[0, rack.rotation, 0]}>
    <mesh position={[0, rack.height / 2, 0]} onClick={(event) => { event.stopPropagation(); onRack(rack); }}><boxGeometry args={[rack.width, rack.height, rack.depth]}/><meshStandardMaterial color="#52605c" transparent opacity={0.18}/></mesh>
    {Array.from({ length: shelves + 1 }, (_, index) => <mesh key={`s-${index}`} position={[0, index * rack.height / shelves, 0]}><boxGeometry args={[rack.width + .05, .035, rack.depth + .04]}/><meshStandardMaterial color="#64746f"/></mesh>)}
    {Array.from({ length: positions + 1 }, (_, index) => <mesh key={`p-${index}`} position={[-rack.width / 2 + index * rack.width / positions, rack.height / 2, 0]}><boxGeometry args={[.025, rack.height, rack.depth + .04]}/><meshStandardMaterial color="#64746f"/></mesh>)}
    {cells.map((location) => {
      const pos = rackLocationPosition(rack, location.code);
      const usage = location.capacity ? (location.occupied + location.reserved) / location.capacity : 0;
      const color = location.reserved > 0 ? "#a855f7" : usage >= 1 ? "#dc4c3f" : usage > 0 ? "#e4a11b" : "#2e8b70";
      return <mesh key={location.id} position={pos} onClick={(event) => { event.stopPropagation(); onLocation(location); }}>
        <boxGeometry args={[rack.width / positions * .88, rack.height / shelves * .84, rack.depth * .82]}/>
        <meshStandardMaterial color={heatmap ? color : "#e9f1ed"} transparent opacity={heatmap ? .48 : .08}/>
      </mesh>;
    })}
    <Text position={[0, rack.height + .22, 0]} fontSize={.22} color="#d8ffe9" outlineWidth={.01} outlineColor="#081713">{rack.rackCode}</Text>
  </group>;
}

function Packages({ snapshot, selectedIds, onPackage }: { snapshot: WarehouseMapSnapshot; selectedIds: Set<string>; onPackage: (pkg: WarehouseMapPackage) => void }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const packages = snapshot.packages;
  const racks = useMemo(() => new Map(snapshot.warehouse?.layout.objects.filter((object) => object.type === "rack").map((rack) => [rack.rackCode!, rack]) || []), [snapshot.warehouse]);
  useEffect(() => {
    if (!mesh.current || !snapshot.warehouse) return;
    const temp = new THREE.Object3D();
    packages.forEach((pkg, index) => {
      const rack = racks.get(rackCodeFromLocation(pkg.location_code));
      if (!rack) { temp.scale.setScalar(0); temp.updateMatrix(); mesh.current!.setMatrixAt(index, temp.matrix); return; }
      const local = rackLocationPosition(rack, pkg.location_code);
      const rotated = local.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rack.rotation);
      temp.position.set(
        rack.x + rack.width / 2 - snapshot.warehouse!.layout.warehouse.width / 2 + rotated.x,
        local.y,
        rack.z + rack.depth / 2 - snapshot.warehouse!.layout.warehouse.length / 2 + rotated.z,
      );
      temp.rotation.set(0, rack.rotation, 0);
      temp.scale.set(Math.min(.34, Math.max(.12, Number(pkg.width_mm || 360) / 1000)), Math.min(.28, Math.max(.1, Number(pkg.height_mm || 250) / 1000)), Math.min(.3, Math.max(.1, Number(pkg.depth_mm || 250) / 1000)));
      temp.updateMatrix(); mesh.current!.setMatrixAt(index, temp.matrix);
      mesh.current!.setColorAt(index, new THREE.Color(selectedIds.has(pkg.id) ? "#f7dd63" : "#6ee7b7"));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
  }, [packages, racks, selectedIds, snapshot.warehouse]);
  const click = (event: ThreeEvent<MouseEvent>) => { event.stopPropagation(); if (event.instanceId !== undefined && packages[event.instanceId]) onPackage(packages[event.instanceId]); };
  return <instancedMesh ref={mesh} args={[undefined, undefined, packages.length]} onClick={click} castShadow><boxGeometry args={[1, 1, 1]}/><meshStandardMaterial roughness={.55}/></instancedMesh>;
}

function WarehouseScene({ snapshot, mode, focus, fitKey, heatmap, selectedIds, onPackage, onLocation, onRack }: { snapshot: WarehouseMapSnapshot; mode: ViewMode; focus: string | null; fitKey: number; heatmap: boolean; selectedIds: Set<string>; onPackage: (pkg: WarehouseMapPackage) => void; onLocation: (location: WarehouseMapLocation) => void; onRack: (rack: WarehouseLayoutObject) => void }) {
  const layout = snapshot.warehouse!;
  const { width, length } = layout.layout.warehouse;
  return <Canvas shadows camera={{ position: [8, 7, 10], fov: 45 }}>
    <color attach="background" args={["#081713"]}/><ambientLight intensity={1.1}/><directionalLight position={[8, 12, 8]} intensity={1.4} castShadow/>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.04, 0]} receiveShadow><planeGeometry args={[width, length]}/><meshStandardMaterial color="#152a24"/></mesh>
    <Grid args={[width, length]} cellSize={.5} cellColor="#29453c" sectionColor="#3c6b5c" fadeDistance={25}/>
    <CameraController mode={mode} focus={focus} fitKey={fitKey} layout={layout}/>
    {layout.layout.objects.map((object) => object.type === "rack"
      ? <Rack key={object.id} rack={object} warehouse={layout.layout.warehouse} locations={snapshot.locations} onLocation={onLocation} onRack={onRack} heatmap={heatmap}/>
      : <mesh key={object.id} position={[object.x + object.width / 2 - width / 2, object.height / 2, object.z + object.depth / 2 - length / 2]} rotation={[0, object.rotation, 0]}><boxGeometry args={[object.width, object.height, object.depth]}/><meshStandardMaterial color={object.type === "door" ? "#9bd9ff" : object.color || "#71817b"} transparent opacity={object.type === "door" ? .5 : 1}/></mesh>)}
    <Packages snapshot={snapshot} selectedIds={selectedIds} onPackage={onPackage}/>
    <OrbitControls makeDefault enableDamping enableRotate={mode !== "top"} maxPolarAngle={Math.PI / 2 - .03}/>
  </Canvas>;
}

export default function WarehouseMapPage() {
  const [snapshot, setSnapshot] = useState<WarehouseMapSnapshot | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<ViewMode>("perspective");
  const [heatmap, setHeatmap] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedPackage, setSelectedPackage] = useState<WarehouseMapPackage | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<WarehouseMapLocation | null>(null);
  const [selectedRack, setSelectedRack] = useState<WarehouseLayoutObject | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const load = async () => { try { setSnapshot(await warehouseAdminApi.getWarehouseMap()); setUpdatedAt(new Date()); setError(""); } catch (reason) { setError(getErrorMessage(reason)); } };
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 8_000); return () => window.clearInterval(timer); }, []);
  const results = useMemo(() => {
    if (!snapshot) return [];
    return searchWarehousePackages(snapshot.packages, query).slice(0, 50);
  }, [query, snapshot]);
  const locationResults = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!snapshot || !needle) return [];
    return snapshot.locations.filter((location) => location.code.toLocaleLowerCase("tr-TR").includes(needle)).slice(0, 20);
  }, [query, snapshot]);
  const selectedIds = useMemo(() => new Set(results.map((pkg) => pkg.id).concat(selectedPackage?.id || [])), [results, selectedPackage]);
  const selectPackage = (pkg: WarehouseMapPackage) => { setSelectedPackage(pkg); setSelectedLocation(null); setSelectedRack(null); setFocus(pkg.location_code); };
  const selectLocation = (location: WarehouseMapLocation) => { setSelectedLocation(location); setSelectedPackage(null); setSelectedRack(null); setFocus(location.code); };
  const selectRack = (rack: WarehouseLayoutObject) => { setSelectedRack(rack); setSelectedPackage(null); setSelectedLocation(null); setFocus(`${rack.rackCode}-K1-P1`); };
  return <PermissionPage permission="warehouse:view_map"><div className="warehouse-map-page">
    <header className="map-toolbar"><div><p className="eyebrow">Depo Haritası</p><h1 className="text-2xl font-black">Canlı depo görünümü</h1></div><div className="flex flex-wrap gap-2">{(["perspective", "iso", "top"] as ViewMode[]).map((value) => <button className={`secondary-button ${mode === value ? "!bg-forest !text-white" : ""}`} key={value} onClick={() => setMode(value)}>{value === "perspective" ? "Perspektif" : value === "iso" ? "İzometrik" : "Üstten"}</button>)}<button className="secondary-button" onClick={() => { setFocus(null); setFitKey((value) => value + 1); }}>Depoya Sığdır</button><button className={`secondary-button ${heatmap ? "!bg-forest !text-white" : ""}`} onClick={() => setHeatmap((value) => !value)}>Doluluk</button><button className="secondary-button" onClick={() => void load()}><RefreshCw size={17}/> Yenile</button></div></header>
    <div className="map-search"><Search size={19}/><input aria-label="Depoda ara" placeholder="SKU, Supplier No, ürün, paket, lot veya lokasyon ara" value={query} onChange={(event) => setQuery(event.target.value)}/>{query && <button aria-label="Aramayı temizle" onClick={() => setQuery("")}><X size={18}/></button>}</div>
    {query && <div className="map-results"><strong>{locationResults.length} lokasyon, {results.length} paket bulundu</strong>{locationResults.slice(0, 5).map((location) => <button key={location.id} onClick={() => selectLocation(location)}><span><b>{location.code}</b><small>{location.occupied} dolu · {location.reserved} rezerve</small></span><span>Lokasyon <ChevronRight size={16}/></span></button>)}{results.slice(0, 8).map((pkg) => <button key={pkg.id} onClick={() => selectPackage(pkg)}><span><b>{pkg.sku}</b><small>{pkg.package_code}</small></span><span>{pkg.location_code}<ChevronRight size={16}/></span></button>)}</div>}
    {error && <div className="map-error">Depo verileri yüklenemedi. {error}</div>}
    {!error && snapshot && !snapshot.warehouse && <div className="map-empty">Depo planı henüz tanımlanmamış.</div>}
    {snapshot?.warehouse && <div className="map-canvas"><WarehouseScene snapshot={snapshot} mode={mode} focus={focus} fitKey={fitKey} heatmap={heatmap} selectedIds={selectedIds} onPackage={selectPackage} onLocation={selectLocation} onRack={selectRack}/><div className="map-status">Son güncelleme {updatedAt?.toLocaleTimeString("tr-TR") || "—"}</div></div>}
    {(selectedPackage || selectedLocation || selectedRack) && <aside className="detail-drawer"><button className="icon-button ml-auto" aria-label="Detayı kapat" onClick={() => { setSelectedPackage(null); setSelectedLocation(null); setSelectedRack(null); }}><X/></button>{selectedPackage ? <><div className="detail-icon"><Box/></div><p className="eyebrow">Paket Detayı</p><h2>{selectedPackage.sku}</h2>{selectedPackage.image_url && <img src={selectedPackage.image_url} alt=""/>}<dl>{[["Ürün", selectedPackage.product_name],["Supplier No",selectedPackage.supplier_no],["Lot",selectedPackage.lot_number],["Package Code",selectedPackage.package_code],["Paket",`${selectedPackage.package_number}/${selectedPackage.total_packages}`],["Adet",selectedPackage.quantity],["Ağırlık",`${selectedPackage.weight || 0} kg`],["Kutu",`${selectedPackage.width_mm || 360} × ${selectedPackage.depth_mm || 250} × ${selectedPackage.height_mm || 250} mm`],["Lokasyon",selectedPackage.location_code],["Yerleştirilme",selectedPackage.placed_at ? new Date(selectedPackage.placed_at).toLocaleString("tr-TR") : null],["Yerleştiren",selectedPackage.placed_by],["Durum",selectedPackage.status]].map(([k,v]) => <div key={String(k)}><dt>{k}</dt><dd>{v || "—"}</dd></div>)}</dl><a className="primary-button mt-5 w-full" href="/admin/move">Ürünü Taşı</a></> : selectedLocation ? <><div className="detail-icon"><MapPin/></div><p className="eyebrow">Lokasyon Detayı</p><h2>{selectedLocation.code}</h2><dl>{[["Kapasite",selectedLocation.capacity],["Dolu",selectedLocation.occupied],["Rezerve",selectedLocation.reserved],["Boş",selectedLocation.available]].map(([k,v]) => <div key={String(k)}><dt>{k}</dt><dd>{v}</dd></div>)}</dl><h3 className="mt-6 font-black">Paketler</h3><div className="mt-2 space-y-2">{snapshot?.packages.filter((pkg) => pkg.location_code === selectedLocation.code).map((pkg) => <button className="w-full rounded-xl border border-line p-3 text-left" key={pkg.id} onClick={() => selectPackage(pkg)}><b>{pkg.sku}</b> {pkg.package_number}/{pkg.total_packages}</button>)}</div></> : selectedRack ? (() => { const locations = snapshot?.locations.filter((location) => location.rack_code === selectedRack.rackCode) || []; const packages = snapshot?.packages.filter((pkg) => rackCodeFromLocation(pkg.location_code) === selectedRack.rackCode) || []; const full = locations.filter((location) => location.available === 0).length; const empty = locations.filter((location) => location.occupied + location.reserved === 0).length; const partial = locations.length - full - empty; const capacity = locations.reduce((sum, location) => sum + location.capacity, 0); const used = locations.reduce((sum, location) => sum + location.occupied + location.reserved, 0); return <><div className="detail-icon"><MapPin/></div><p className="eyebrow">Raf Detayı</p><h2>{selectedRack.name}</h2><dl>{[["Raf kodu",selectedRack.rackCode],["Lokasyon",locations.length],["Dolu",full],["Kısmi",partial],["Boş",empty],["Toplam paket",packages.length],["Doluluk",capacity ? `%${Math.round(used / capacity * 100)}` : "%0"]].map(([k,v]) => <div key={String(k)}><dt>{k}</dt><dd>{v}</dd></div>)}</dl></>; })() : null}</aside>}
    {snapshot && <details className="data-quality"><summary>Veri Kontrolü</summary><div className="grid gap-3 pt-3 sm:grid-cols-2">{[["Layout'ta olup DB'de olmayan",snapshot.data_quality.layout_only_locations],["Haritada bulunmayan",snapshot.data_quality.map_missing_locations],["Tekrarlanan rackCode",snapshot.data_quality.duplicate_rack_codes],["Geçersiz lokasyon kodu",snapshot.data_quality.invalid_location_codes]].map(([label,values]) => <div key={String(label)}><b>{String(label)}</b><p>{(values as string[]).slice(0, 20).join(", ") || "Yok"}</p></div>)}</div></details>}
  </div></PermissionPage>;
}
