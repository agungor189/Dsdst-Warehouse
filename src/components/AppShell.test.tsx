import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

const auth = vi.hoisted(() => ({
  logout: vi.fn<() => Promise<void>>(),
  permissions: new Set<string>(["warehouse:pick_orders", "warehouse:receive"]),
}));

vi.mock("../features/auth/AuthContext", () => ({
  hasWarehousePermission: (_user: unknown, permission: string) => auth.permissions.has(permission),
  useAuth: () => ({
    user: { id: 1, username: "depo.operatoru", role: "admin", permissions: {} },
    logout: auth.logout,
  }),
}));

vi.mock("../hooks/useOnlineStatus", () => ({ useOnlineStatus: () => true }));

describe("AppShell hesap menüsü", () => {
  beforeEach(() => {
    auth.logout.mockReset();
    auth.logout.mockResolvedValue();
    auth.permissions = new Set(["warehouse:pick_orders", "warehouse:receive"]);
  });

  it("mobil persistent navigation yalnızca yeni dört hedefi gösterir", () => {
    render(<MemoryRouter><AppShell><p>İçerik</p></AppShell></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "Mobil ana navigasyon" });
    expect(within(nav).getByText("Ana Sayfa")).toBeInTheDocument();
    expect(within(nav).getByText("İşler")).toBeInTheDocument();
    expect(within(nav).getByText("Tara")).toBeInTheDocument();
    expect(within(nav).getByText("Daha Fazla")).toBeInTheDocument();
    expect(within(nav).queryByText("Mal Kabul")).not.toBeInTheDocument();
  });

  it("drawer yetkiye göre Mal Kabul gösterir ve çıkışı onay almadan yapmaz", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppShell><p>İçerik</p></AppShell></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Daha Fazla" }));
    const drawer = screen.getByRole("dialog", { name: "Daha Fazla" });
    expect(within(drawer).getByText("Mal Kabul")).toBeInTheDocument();
    expect(auth.logout).not.toHaveBeenCalled();

    await user.click(within(drawer).getByRole("button", { name: "Çıkış Yap" }));
    expect(screen.getByRole("dialog", { name: "Çıkış yapmak istiyor musun?" })).toBeInTheDocument();
    expect(auth.logout).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it("kullanıcı doğruladığında oturumu kapatır", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppShell><p>İçerik</p></AppShell></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Daha Fazla" }));
    await user.click(screen.getByRole("button", { name: "Çıkış Yap" }));
    await user.click(screen.getByRole("button", { name: "Evet, çıkış yap" }));

    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it("yetkisiz drawer hedefini göstermez", async () => {
    auth.permissions = new Set(["warehouse:pick_orders"]);
    const user = userEvent.setup();
    render(<MemoryRouter><AppShell><p>İçerik</p></AppShell></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Daha Fazla" }));
    expect(screen.queryByText("Mal Kabul")).not.toBeInTheDocument();
  });
});
