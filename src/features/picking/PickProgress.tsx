export function PickProgress({ current, total }: { current: number; total: number }) {
  const percent = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs font-black"><span>İLERLEME</span><span>{current}/{total} · %{percent}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-acid transition-all" style={{ width: `${percent}%` }} /></div>
    </div>
  );
}
