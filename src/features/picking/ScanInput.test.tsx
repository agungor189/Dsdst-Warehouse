import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScanInput } from "./ScanInput";

const scanner = vi.hoisted(() => ({
  callback: null as null | ((result: { getText: () => string } | undefined, error: unknown, controls: { stop: () => void }) => void),
  stop: vi.fn(),
  startupError: null as Error | null,
}));
const ocr = vi.hoisted(() => ({
  text: "CS25 Round 6 25",
  recognize: vi.fn(),
  terminate: vi.fn().mockResolvedValue(undefined),
  setParameters: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class {
    decodeFromConstraints(
      _constraints: MediaStreamConstraints,
      _video: HTMLVideoElement,
      callback: typeof scanner.callback,
    ) {
      if (scanner.startupError) return Promise.reject(scanner.startupError);
      scanner.callback = callback;
      return Promise.resolve({ stop: scanner.stop });
    }
  },
}));
vi.mock("tesseract.js", () => ({
  PSM: { SINGLE_LINE: "7" },
  createWorker: vi.fn(async () => ({ recognize: ocr.recognize, terminate: ocr.terminate, setParameters: ocr.setParameters })),
}));

describe("ScanInput kamera taraması", () => {
  beforeEach(() => {
    scanner.callback = null;
    scanner.startupError = null;
    scanner.stop.mockReset();
    ocr.text = "CS25 Round 6 25";
    ocr.recognize.mockReset().mockImplementation(async () => ({ data: { text: ocr.text } }));
    ocr.terminate.mockClear();
    ocr.setParameters.mockClear();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
  });

  it("kameradan okunan lokasyon veya SKU değerini mevcut doğrulamaya gönderir", async () => {
    const onScan = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ScanInput onScan={onScan} busy={false}/>);

    await user.click(screen.getByRole("button", { name: "Kamera ile Tara" }));
    expect(await screen.findByRole("dialog", { name: "Kamera ile kod tara" })).toBeInTheDocument();
    await waitFor(() => expect(scanner.callback).not.toBeNull());
    await act(async () => {
      scanner.callback?.({ getText: () => "A1-K2-P3" }, undefined, { stop: scanner.stop });
      await Promise.resolve();
    });

    expect(onScan).toHaveBeenCalledWith("A1-K2-P3");
    expect(scanner.stop).toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Kamera ile kod tara" })).not.toBeInTheDocument();
  });

  it("kamera izni reddedilirse manuel giriş seçeneğini korur", async () => {
    const permissionError = new Error("denied");
    permissionError.name = "NotAllowedError";
    scanner.startupError = permissionError;
    const user = userEvent.setup();
    render(<ScanInput onScan={vi.fn().mockResolvedValue(false)} busy={false}/>);

    await user.click(screen.getByRole("button", { name: "Kamera ile Tara" }));
    expect(await screen.findByText("Kamera izni verilmedi. Tarayıcı ayarlarından izni açabilir veya manuel giriş kullanabilirsiniz.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Manuel girişe dön" }));
    expect(screen.getByLabelText("Lokasyon / Barkod / SKU okutun")).toBeInTheDocument();
  });

  it("Supplier No OCR sonucunu gerçek aktif lot koduna çevirip input doğrulamasına gönderir", async () => {
    const track = { stop: vi.fn() };
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [track] });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    const onScan = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ScanInput mode="both" ocrCandidates={["H16", "CS25-Round 6*25"]} onScan={onScan} busy={false}/>);
    await user.click(screen.getByRole("button", { name: "Kamera ile Yazıyı Tara" }));
    const video = await screen.findByLabelText("OCR kamera görüntüsü");
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1920 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 1080 });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Yazıyı Oku" }));
    await waitFor(() => expect(onScan).toHaveBeenCalledWith("CS25-Round 6*25"));
    expect(track.stop).toHaveBeenCalled();
    expect(ocr.terminate).toHaveBeenCalled();
  });

  it("belirsiz OCR sonucunda yanlış ürünü claim etmez ve kullanıcıya seçenek gösterir", async () => {
    ocr.text = "A01-B34";
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) } });
    const onScan = vi.fn().mockResolvedValue(true);
    const user = userEvent.setup();
    render(<ScanInput mode="both" ocrCandidates={["A012-B34", "A011-B34"]} onScan={onScan} busy={false}/>);
    await user.click(screen.getByRole("button", { name: "Kamera ile Yazıyı Tara" }));
    const video = await screen.findByLabelText("OCR kamera görüntüsü");
    Object.defineProperty(video, "videoWidth", { configurable: true, value: 1920 });
    Object.defineProperty(video, "videoHeight", { configurable: true, value: 1080 });
    await user.click(await screen.findByRole("button", { name: "Yazıyı Oku" }));
    expect(await screen.findByText("Hangisini okudunuz? Yanlış ürün otomatik seçilmedi.")).toBeInTheDocument();
    expect(onScan).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Lokasyon / Barkod / SKU okutun")).toHaveValue("A01-B34");
    expect(screen.getByRole("button", { name: "A011-B34" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A012-B34" })).toBeInTheDocument();
  });

  it("barcode modunda OCR butonu göstermez", () => {
    render(<ScanInput mode="barcode" onScan={vi.fn().mockResolvedValue(true)} busy={false}/>);
    expect(screen.queryByRole("button", { name: "Kamera ile Yazıyı Tara" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kamera ile Tara" })).toBeInTheDocument();
  });

  it("OCR kamerası kapatılınca tüm media tracklerini durdurur", async () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => tracks }) } });
    const user = userEvent.setup();
    render(<ScanInput mode="both" ocrCandidates={["H16"]} onScan={vi.fn().mockResolvedValue(true)} busy={false}/>);
    await user.click(screen.getByRole("button", { name: "Kamera ile Yazıyı Tara" }));
    await screen.findByRole("dialog", { name: "Kamera ile tedarikçi no yazısını tara" });
    await user.click(screen.getByRole("button", { name: "OCR kamerasını kapat" }));
    await waitFor(() => tracks.forEach((track) => expect(track.stop).toHaveBeenCalledTimes(1)));
  });

  it("mobil ekran akıştan ayrılırsa OCR kamera stream'ini temizler", async () => {
    const track = { stop: vi.fn() };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [track] }) } });
    const user = userEvent.setup();
    const view = render(<ScanInput mode="both" ocrCandidates={["H16"]} onScan={vi.fn().mockResolvedValue(true)} busy={false}/>);
    await user.click(screen.getByRole("button", { name: "Kamera ile Yazıyı Tara" }));
    await screen.findByRole("dialog", { name: "Kamera ile tedarikçi no yazısını tara" });
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    view.unmount();
    await waitFor(() => expect(track.stop).toHaveBeenCalledTimes(1));
  });
});
