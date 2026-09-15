import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScanInput } from "./ScanInput";

const scanner = vi.hoisted(() => ({
  callback: null as null | ((result: { getText: () => string } | undefined, error: unknown, controls: { stop: () => void }) => void),
  stop: vi.fn(),
  startupError: null as Error | null,
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

describe("ScanInput kamera taraması", () => {
  beforeEach(() => {
    scanner.callback = null;
    scanner.startupError = null;
    scanner.stop.mockReset();
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
});
