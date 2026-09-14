import { ScanBarcode } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ScanInput({ onScan, busy }: { onScan: (code: string) => Promise<boolean>; busy: boolean }) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = code.trim();
    if (!value || busy) return;
    const success = await onScan(value);
    if (success) setCode("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="scan-code" className="block text-sm font-black">Barkod veya SKU okutun</label>
      <div className="relative"><ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-moss" size={25}/><input ref={inputRef} id="scan-code" className="field min-h-16 pl-14 text-lg font-black uppercase" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" placeholder="Okutun veya yazın" disabled={busy}/></div>
      <button className="primary-button w-full" disabled={!code.trim() || busy} type="submit">{busy ? "Kontrol ediliyor..." : "Ürünü Kontrol Et"}</button>
    </form>
  );
}
