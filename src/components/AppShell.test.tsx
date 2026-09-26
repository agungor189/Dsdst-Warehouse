import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

const auth = vi.hoisted(() => ({ logout: vi.fn<() => Promise<void>>(), allowPermissions: true }));

vi.mock("../features/auth/AuthContext", () => ({
  hasWarehousePermission: () => auth.allowPermissions,
  useAuth: () => ({
    user: { id: 1, username: "depo.operatoru", role: "admin", permissions: {} },
    logout: auth.logout,
  }),
}));

vi.mock("../hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));

describe("AppShell hesap menüsü", () => {
  beforeEach(() => {
    auth.allowPermissions = true;
    auth.logout.mockReset();
    auth.logout.mockResolvedValue();
  });

  it("üst düğmede ayarları gösterir ve çıkışı onay almadan yapmaz", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppShell><p>İçerik</p></AppShell></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Hesap menüsü" }));
    expect(screen.getByRole("menuitem", { name: "Ayarlar" })).toBeInTheDocument();
    expect(screen.getAllByText("depo.operatoru")).toHaveLength(2);
    expect(auth.logout).not.toHaveBeenCalled();

    await user.click(screen.getByRole("menuitem", { name: "Çıkış Yap" }));
    expect(screen.getByRole("dialog", { name: "Çıkış yapmak istiyor musun?" })).toBeInTheDocument();
    expect(auth.logout).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it("kullanıcı doğruladığında oturumu kapatır", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppShell><p>İçerik</p></AppShell></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Hesap menüsü" }));
    await user.click(screen.getByRole("menuitem", { name: "Çıkış Yap" }));
    await user.click(screen.getByRole("button", { name: "Evet, çıkış yap" }));

    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it("yetkisiz operasyon linklerini desktop ve mobil navigasyonda gizler", () => {
    auth.allowPermissions = false;
    render(<MemoryRouter><AppShell><p>İçerik</p></AppShell></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Mal Kabul" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sevkiyat" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Order Picking" })).toBeInTheDocument();
  });
});
