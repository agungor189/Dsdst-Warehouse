import type { IScannerControls } from "@zxing/browser";
import { Camera, ScanBarcode, ScanLine, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function ScanInput({ onScan, busy }: { onScan: (code: string) => Promise<boolean>; busy: boolean }) {
  const [code, setCode] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => {
    if (!cameraOpen) return;
    let active = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    handledRef.current = false;
    setCameraReady(false);
    setCameraError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Bu cihaz veya tarayıcı kamera taramasını desteklemiyor. Manuel giriş kullanabilirsiniz.");
      return () => { document.body.style.overflow = previousOverflow; };
    }

    void import("@zxing/browser").then(async ({ BrowserMultiFormatReader }) => {
      if (!active || !videoRef.current) return;
      const reader = new BrowserMultiFormatReader();
      try {
        const controls = await reader.decodeFromConstraints({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        }, videoRef.current, (result, _error, scannerControls) => {
          if (!result || handledRef.current) return;
          const scannedCode = result.getText().trim();
          if (!scannedCode) return;
          handledRef.current = true;
          scannerControls.stop();
          setCode(scannedCode);
          setCameraOpen(false);
          navigator.vibrate?.(80);
          void onScanRef.current(scannedCode).then((success) => {
            if (success) setCode("");
            window.setTimeout(() => inputRef.current?.focus(), 0);
          });
        });
        if (!active) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setCameraReady(true);
      } catch (reason) {
        if (!active) return;
        const name = reason instanceof Error ? reason.name : "";
        setCameraError(name === "NotAllowedError"
          ? "Kamera izni verilmedi. Tarayıcı ayarlarından izni açabilir veya manuel giriş kullanabilirsiniz."
          : name === "NotFoundError"
            ? "Bu cihazda kullanılabilir kamera bulunamadı."
            : "Kamera başlatılamadı. Kamerayı kullanan başka bir uygulamayı kapatıp tekrar deneyin.");
      }
    }).catch(() => {
      if (active) setCameraError("Kamera tarayıcısı yüklenemedi. Bağlantıyı kontrol edip tekrar deneyin.");
    });

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
      document.body.style.overflow = previousOverflow;
    };
  }, [cameraOpen]);

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
      <label htmlFor="scan-code" className="block text-sm font-black">Lokasyon / Barkod / SKU okutun</label>
      <div className="relative"><ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-moss" size={25}/><input ref={inputRef} id="scan-code" className="field min-h-16 pl-14 text-lg font-black uppercase" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" placeholder="Lokasyon, barkod veya SKU" disabled={busy}/></div>
      <div className="grid grid-cols-2 gap-3">
        <button className="secondary-button min-h-14" disabled={busy} type="button" onClick={() => setCameraOpen(true)}><Camera size={21}/> Kamera ile Tara</button>
        <button className="primary-button w-full" disabled={!code.trim() || busy} type="submit">{busy ? "Kontrol ediliyor..." : "Doğrula"}</button>
      </div>
      {cameraOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-forest text-white" role="dialog" aria-modal="true" aria-label="Kamera ile kod tara">
          <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <div><p className="text-xs font-black uppercase tracking-[0.18em] text-acid">Kamera taraması</p><h2 className="mt-1 text-xl font-black">Lokasyon veya SKU okutun</h2></div>
            <button className="grid size-11 place-items-center rounded-xl bg-white/10" type="button" aria-label="Kamerayı kapat" onClick={() => setCameraOpen(false)}><X size={23}/></button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" autoPlay muted playsInline aria-label="Kamera görüntüsü"/>
            {!cameraError && (
              <div className="pointer-events-none absolute inset-x-[9%] top-1/2 aspect-[1.65/1] -translate-y-1/2 rounded-[2rem] border-2 border-acid shadow-[0_0_0_999px_rgba(0,0,0,0.38)]">
                <span className="absolute -left-0.5 -top-0.5 size-9 rounded-tl-[2rem] border-l-4 border-t-4 border-acid"/>
                <span className="absolute -right-0.5 -top-0.5 size-9 rounded-tr-[2rem] border-r-4 border-t-4 border-acid"/>
                <span className="absolute -bottom-0.5 -left-0.5 size-9 rounded-bl-[2rem] border-b-4 border-l-4 border-acid"/>
                <span className="absolute -bottom-0.5 -right-0.5 size-9 rounded-br-[2rem] border-b-4 border-r-4 border-acid"/>
                {cameraReady && <span className="absolute left-5 right-5 top-1/2 h-0.5 animate-pulse bg-acid shadow-[0_0_14px_#e8ff72]"/>}
              </div>
            )}
            {!cameraReady && !cameraError && <div className="absolute rounded-2xl bg-black/65 px-5 py-4 text-center"><ScanLine className="mx-auto mb-2 animate-pulse text-acid"/><p className="font-black">Kamera hazırlanıyor...</p></div>}
            {cameraError && <div className="mx-5 max-w-sm rounded-2xl bg-white p-5 text-center text-ink"><TriangleAlert className="mx-auto text-danger" size={34}/><p className="mt-3 font-black">Kamera açılamadı</p><p className="mt-2 text-sm leading-6 text-muted">{cameraError}</p><button className="secondary-button mt-4 w-full" type="button" onClick={() => setCameraOpen(false)}>Manuel girişe dön</button></div>}
          </div>
          <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-center text-sm text-white/70">Kodu çerçevenin içine hizalayın. QR ve yaygın barkod türleri desteklenir.</div>
        </div>
      )}
    </form>
  );
}
