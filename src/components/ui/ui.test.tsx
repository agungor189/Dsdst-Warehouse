import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button, ConfirmDialog, Input, Modal, Select } from ".";

describe("ortak Warehouse UI", () => {
  it("form kontrollerinin label, disabled ve loading davranışını korur", () => {
    render(<><Input label="Paket kodu" disabled/><Select label="Durum" disabled><option>Açık</option></Select><Button loading loadingText="Kaydediliyor">Kaydet</Button></>);
    expect(screen.getByLabelText("Paket kodu")).toBeDisabled();
    expect(screen.getByLabelText("Durum")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Kaydediliyor" })).toBeDisabled();
  });

  it("modalı Escape ve backdrop ile kapatır", () => {
    const onClose = vi.fn();
    const { container, rerender } = render(<Modal open onClose={onClose} title="Paket detayı"><p>İçerik</p></Modal>);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(<Modal open onClose={onClose} title="Paket detayı"><p>İçerik</p></Modal>);
    fireEvent.mouseDown(container.firstElementChild!);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("confirm dialog onay callback'ini yalnız explicit aksiyonda çağır", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ConfirmDialog open onClose={() => undefined} onConfirm={onConfirm} title="Paketi iptal et" destructive confirmLabel="İptal et"/>);
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "İptal et" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
