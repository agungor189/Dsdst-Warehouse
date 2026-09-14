export function StatusBadge({ status }: { status: string }) {
  const isPicking = status === "Toplanıyor";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black ${isPicking ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
      {status}
    </span>
  );
}
