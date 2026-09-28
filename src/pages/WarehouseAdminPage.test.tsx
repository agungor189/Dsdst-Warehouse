import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { shipmentApi } from "../lib/api";
import { WarehouseAdminPage } from "./WarehouseAdminPages";

vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u-1", username: "Alper", role: "admin", permissions: {} } }),
  hasWarehousePermission: () => true,
}));

describe("WarehouseAdminPage packaging settings", () => {
  beforeEach(() => {
    vi.spyOn(shipmentApi, "listPackagingTypes").mockResolvedValue([]);
    vi.spyOn(shipmentApi, "createPackagingType").mockResolvedValue({ id: "box-1", name: "Orta Koli", type: "BOX",
      lengthMm: 400, widthMm: 300, heightMm: 250, emptyWeightGrams: 190, active: true, updatedAt: "2026-09-28T08:00:00Z" });
  });

  it("Ayarlar içinde isim, ölçü ve boş ağırlıkla koli ekler", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><WarehouseAdminPage/></MemoryRouter>);
    await user.type(await screen.findByLabelText("Koli adı"), "Orta Koli");
    await user.type(screen.getByLabelText("Uzunluk (cm)"), "40");
    await user.type(screen.getByLabelText("Genişlik (cm)"), "30");
    await user.type(screen.getByLabelText("Yükseklik (cm)"), "25");
    await user.type(screen.getByLabelText("Boş koli ağırlığı (g)"), "190");
    await user.click(screen.getByRole("button", { name: "Koliyi Kaydet" }));
    await waitFor(() => expect(shipmentApi.createPackagingType).toHaveBeenCalledWith({
      name: "Orta Koli", lengthMm: 400, widthMm: 300, heightMm: 250, emptyWeightGrams: 190,
    }));
    expect(await screen.findByText("Orta Koli")).toBeInTheDocument();
  });
});
