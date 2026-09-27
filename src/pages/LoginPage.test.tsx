import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";

vi.mock("../features/auth/AuthContext", () => ({
  useAuth: () => ({ login: vi.fn() }),
}));

vi.mock("../lib/apiStatus", () => ({ useApiStatus: () => "connected" }));

describe("LoginPage keyboard behavior", () => {
  it("sayfa açıldığında kullanıcı alanına otomatik focus vermez", () => {
    render(<LoginPage/>);
    expect(screen.getByLabelText("Kullanıcı adı veya e-posta")).not.toHaveFocus();
  });
});
