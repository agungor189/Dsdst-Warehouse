import type { IScannerControls } from "@zxing/browser";
import { Camera, LoaderCircle, ScanBarcode, ScanLine, ScanText, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { matchOcrSupplierCode } from "../receiving/ocrMatching";

export function ScanInput({
  onScan,
  busy,
  label = "Lokasyon / Barkod / SKU okutun",
  placeholder = "Lokasyon, barkod veya SKU",
  cameraTitle = "Lokasyon veya SKU okutun",
  mode = "barcode",
  ocrCandidates = [],
}: {
  onScan: (code: string) => Promise<boolean>;
  busy: boolean;
  label?: string;
  placeholder?: string;
  cameraTitle?: string;
  mode?: "barcode" | "both";
  ocrCandidates?: string[];
}) {
  const [code, setCode] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrReady, setOcrReady] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrOptions, setOcrOptions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const ocrVideoRef = useRef<HTMLVideoElement>(null);
  const ocrStreamRef = useRef<MediaStream | null>(null);
  const ocrWorkerRef = useRef<{ terminate: () => Promise<unknown> } | null>(null);
  const ocrOpenRef = useRef(false);
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);
  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);
  useEffect(() => { ocrOpenRef.current = ocrOpen; }, [ocrOpen]);

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
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks?.().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      document.body.style.overflow = previousOverflow;
    };
  }, [cameraOpen]);

  useEffect(() => {
    if (!ocrOpen) return;
    let active = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setOcrReady(false); setOcrBusy(false); setOcrError(""); setOcrOptions([]);
    if (!navigator.mediaDevices?.getUserMedia) {
      setOcrError("Bu cihaz kamera ile yazı okumayı desteklemiyor. Manuel giriş kullanabilirsiniz.");
      return () => { document.body.style.overflow = previousOverflow; };
    }
    void navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    }).then(async (stream) => {
      if (!active) { stream.getTracks().forEach((track) => track.stop()); return; }
      ocrStreamRef.current = stream;
      if (ocrVideoRef.current) {
        ocrVideoRef.current.srcObject = stream;
        await ocrVideoRef.current.play().catch(() => undefined);
      }
      if (active) setOcrReady(true);
    }).catch((reason) => {
      if (!active) return;
      const name = reason instanceof Error ? reason.name : "";
      setOcrError(name === "NotAllowedError" ? "Kamera izni verilmedi. Manuel giriş kullanabilirsiniz." : "OCR kamerası başlatılamadı.");
    });
    return () => {
      active = false;
      ocrStreamRef.current?.getTracks().forEach((track) => track.stop());
      ocrStreamRef.current = null;
      if (ocrVideoRef.current) ocrVideoRef.current.srcObject = null;
      const worker = ocrWorkerRef.current;
      ocrWorkerRef.current = null;
      if (worker) void worker.terminate();
      document.body.style.overflow = previousOverflow;
    };
  }, [ocrOpen]);

  const acceptOcrCode = async (value: string) => {
    setCode(value); setOcrOpen(false); navigator.vibrate?.(80);
    const success = await onScanRef.current(value);
    if (success) setCode("");
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const captureOcr = async () => {
    const video = ocrVideoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || ocrBusy) {
      setOcrError("Kamera görüntüsü henüz hazır değil."); return;
    }
    setOcrBusy(true); setOcrError(""); setOcrOptions([]);
    const sourceWidth = Math.round(video.videoWidth * 0.86);
    const sourceHeight = Math.min(Math.round(video.videoHeight * 0.28), Math.round(sourceWidth / 3.6));
    const sourceX = Math.round((video.videoWidth - sourceWidth) / 2);
    const sourceY = Math.round((video.videoHeight - sourceHeight) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = 1600; canvas.height = 440;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) { setOcrBusy(false); setOcrError("Görüntü işlenemedi."); return; }
    context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < pixels.data.length; index += 4) {
      const gray = pixels.data[index] * 0.299 + pixels.data[index + 1] * 0.587 + pixels.data[index + 2] * 0.114;
      const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.65 + 128));
      const value = contrasted > 155 ? 255 : 0;
      pixels.data[index] = value; pixels.data[index + 1] = value; pixels.data[index + 2] = value;
    }
    context.putImageData(pixels, 0, 0);
    try {
      const { createWorker, PSM } = await import("tesseract.js");
      const worker = await createWorker("eng");
      if (!ocrOpenRef.current) { await worker.terminate(); return; }
      ocrWorkerRef.current = worker;
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-* /",
      });
      const result = await worker.recognize(canvas);
      await worker.terminate(); ocrWorkerRef.current = null;
      const extracted = result.data.text.trim();
      const match = matchOcrSupplierCode(extracted, ocrCandidates);
      if (match.kind === "match") { await acceptOcrCode(match.value); return; }
      if (match.kind === "ambiguous") {
        setCode(extracted); setOcrOptions(match.options.map((option) => option.value));
        setOcrError("Hangisini okudunuz? Yanlış ürün otomatik seçilmedi.");
      } else {
        setCode(extracted); setOcrError(extracted ? `“${extracted}” aktif partide güvenle eşleştirilemedi.` : "Yazı okunamadı. Çerçeveyi koda yaklaştırıp tekrar deneyin.");
      }
    } catch {
      setOcrError("OCR motoru yüklenemedi veya yazı okunamadı. Tekrar deneyin ya da manuel giriş kullanın.");
    } finally { setOcrBusy(false); }
  };

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
      <label htmlFor="scan-code" className="block text-sm font-black">{label}</label>
      <div className="relative"><ScanBarcode className="absolute left-4 top-1/2 -translate-y-1/2 text-moss" size={25}/><input ref={inputRef} id="scan-code" className="field min-h-16 pl-14 text-lg font-black uppercase" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" placeholder={placeholder} disabled={busy}/></div>
      <div className="grid grid-cols-2 gap-3">
        <button className="secondary-button min-h-14" disabled={busy} type="button" onClick={() => setCameraOpen(true)}><Camera size={21}/> Kamera ile Tara</button>
        {mode === "both" && <button className="secondary-button min-h-14" disabled={busy} type="button" onClick={() => setOcrOpen(true)}><ScanText size={21}/>Kamera ile Yazıyı Tara</button>}
        <button className={`primary-button w-full ${mode === "both" ? "col-span-2" : ""}`} disabled={!code.trim() || busy} type="submit">{busy ? "Kontrol ediliyor..." : "Doğrula"}</button>
      </div>
      {cameraOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-forest text-white" role="dialog" aria-modal="true" aria-label="Kamera ile kod tara">
          <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <div><p className="text-xs font-black uppercase tracking-[0.18em] text-acid">Kamera taraması</p><h2 className="mt-1 text-xl font-black">{cameraTitle}</h2></div>
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
      {ocrOpen && (
        <div className="fixed inset-0 z-[75] flex flex-col bg-forest text-white" role="dialog" aria-modal="true" aria-label="Kamera ile tedarikçi no yazısını tara">
          <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-acid">Yerel OCR</p><h2 className="mt-1 text-xl font-black">Tedarikçi No yazısını çerçeveye alın</h2></div><button className="grid size-11 place-items-center rounded-xl bg-white/10" type="button" aria-label="OCR kamerasını kapat" onClick={() => setOcrOpen(false)}><X size={23}/></button></div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black"><video ref={ocrVideoRef} className="h-full w-full object-cover" autoPlay muted playsInline aria-label="OCR kamera görüntüsü"/>{!ocrError || ocrReady ? <div className="pointer-events-none absolute inset-x-[7%] top-1/2 aspect-[3.6/1] -translate-y-1/2 rounded-2xl border-4 border-acid shadow-[0_0_0_999px_rgba(0,0,0,0.48)]"><span className="absolute inset-x-6 top-1/2 h-0.5 bg-acid/80"/></div> : null}{!ocrReady && !ocrError && <div className="absolute rounded-2xl bg-black/70 px-5 py-4 text-center"><ScanText className="mx-auto mb-2 animate-pulse text-acid"/><p className="font-black">OCR kamerası hazırlanıyor…</p></div>}</div>
          <div className="space-y-3 bg-forest px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">{ocrError && <p role="alert" className="rounded-xl bg-white p-3 text-sm font-bold text-ink">{ocrError}</p>}{ocrOptions.length > 0 && <div className="grid gap-2"><p className="font-black">Hangisini okudunuz?</p>{ocrOptions.map((option) => <button key={option} type="button" className="secondary-button w-full" onClick={() => void acceptOcrCode(option)}>{option}</button>)}</div>}<button type="button" className="primary-button min-h-14 w-full" disabled={!ocrReady || ocrBusy} onClick={() => void captureOcr()}>{ocrBusy ? <><LoaderCircle className="animate-spin"/>Yazı okunuyor…</> : <><ScanText/>Yazıyı Oku</>}</button><p className="text-center text-xs text-white/65">Görüntünün yalnız çerçeve içindeki bölümü cihazınızda işlenir.</p></div>
        </div>
      )}
    </form>
  );
}
