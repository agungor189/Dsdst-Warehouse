// @vitest-environment node
import express, { type RequestHandler } from "express";
import type { Server } from "node:http";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWarehouseApp } from "./app.js";

const SECRET = "warehouse-secret-that-must-never-leak";
const SESSION = "test-panel-jwt";
const sessionCookie = `warehouse_session=${SESSION}`;
const servers: Server[] = [];

const startPanel = async (handler: RequestHandler) => {
  const panel = express();
  panel.use(express.json());
  panel.use(handler);
  const server = panel.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test paneli başlatılamadı");
  return `http://127.0.0.1:${address.port}`;
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  )));
});

describe("Warehouse BFF", () => {
  it("frontend /api çağrısını whitelist üzerinden panel API'ye iletir ve x-api-key ekler", async () => {
    const received: { key?: string; authorization?: string; path?: string; query?: unknown } = {};
    const panelUrl = await startPanel((req, res) => {
      received.key = req.header("x-api-key");
      received.authorization = req.header("authorization");
      received.path = req.path;
      received.query = req.query;
      res.json({ success: true, data: [{ id: "order-1" }], pagination: { total: 1 } });
    });
    const app = createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET });

    const response = await request(app).get("/api/orders?page=2&limit=500&ignored=unsafe").set("Cookie", sessionCookie);

    expect(response.status).toBe(200);
    expect(received).toEqual({
      key: SECRET,
      authorization: `Bearer ${SESSION}`,
      path: "/api/warehouse/v1/orders",
      query: { page: "2", limit: "100" },
    });
  });

  it("eksik server API key için gizli bilgi içermeyen 503 döner", async () => {
    const response = await request(createWarehouseApp({ panelApiBaseUrl: "http://panel.test" }))
      .get("/api/orders").set("Cookie", sessionCookie);

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("BFF_NOT_CONFIGURED");
    expect(JSON.stringify(response.body)).not.toContain("x-api-key");
  });

  it("yanlış server API key için panelin 401 yanıtını aktarır", async () => {
    const panelUrl = await startPanel((_req, res) =>
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid API key" } }));
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: "wrong-key" }))
      .get("/api/orders").set("Cookie", sessionCookie);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });

  it.each([401, 403, 404, 409])("panelin %i durumunu ve JSON yanıtını frontend'e aktarır", async (status) => {
    const panelUrl = await startPanel((_req, res) =>
      res.status(status).json({ success: false, error: { code: `STATUS_${status}`, message: "Panel cevabı" } }));
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .get("/api/orders/order-1").set("Cookie", sessionCookie);

    expect(response.status).toBe(status);
    expect(response.body).toEqual({ success: false, error: { code: `STATUS_${status}`, message: "Panel cevabı" } });
  });

  it("API key'i upstream response içinden redakte eder ve loglamaz", async () => {
    const logger = { error: vi.fn() };
    const panelUrl = await startPanel((_req, res) => res.status(403).json({
      success: false,
      error: { code: "FORBIDDEN", message: `Rejected credential ${SECRET}` },
      "x-api-key": SECRET,
    }));
    const response = await request(createWarehouseApp({
      panelApiBaseUrl: panelUrl,
      warehouseApiKey: SECRET,
      logger,
    })).get("/api/orders").set("Cookie", sessionCookie);

    expect(JSON.stringify(response.body)).not.toContain(SECRET);
    expect(response.body["x-api-key"]).toBe("[REDACTED]");
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(SECRET);
  });

  it("whitelist dışındaki /api yollarını panel API'ye iletmez", async () => {
    const panelRequest = vi.fn((_req, res) => res.json({ ok: true }));
    const panelUrl = await startPanel(panelRequest);
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .get("/api/admin/users");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("BFF_ROUTE_NOT_FOUND");
    expect(panelRequest).not.toHaveBeenCalled();
  });

  it("panel timeout'unu güvenli 504 yanıtına dönüştürür", async () => {
    const panelUrl = await startPanel(async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      res.json({ success: true });
    });
    const logger = { error: vi.fn() };
    const response = await request(createWarehouseApp({
      panelApiBaseUrl: panelUrl,
      warehouseApiKey: SECRET,
      timeoutMs: 10,
      logger,
    })).get("/api/orders").set("Cookie", sessionCookie);

    expect(response.status).toBe(504);
    expect(response.body.error.code).toBe("UPSTREAM_TIMEOUT");
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(SECRET);
  });

  it("oturumsuz Warehouse çağrısını panele göndermeden 401 ile reddeder", async () => {
    const panelRequest = vi.fn((_req, res) => res.json({ success: true }));
    const panelUrl = await startPanel(panelRequest);
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .get("/api/orders");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("SESSION_REQUIRED");
    expect(panelRequest).not.toHaveBeenCalled();
  });

  it("panel giriş tokenını HttpOnly cookie yapar ve response içinde göstermez", async () => {
    const panelUrl = await startPanel((req, res) => {
      expect(req.path).toBe("/api/auth/login");
      res.json({ success: true, token: SESSION, user: { id: "user-1", username: "Alper", role: "admin", must_change_password: false } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/auth/login").send({ username: "Alper", password: "correct-password" });
    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]?.[0]).toContain("SameSite=Strict");
    expect(JSON.stringify(response.body)).not.toContain(SESSION);
    expect(response.body.data.username).toBe("Alper");
  });

  it("login hatasını ve durum kodunu token üretmeden aktarır", async () => {
    const panelUrl = await startPanel((_req, res) => res.status(401).json({ success: false, error: { code: "AUTH_FAILED", message: "Geçersiz kullanıcı adı veya şifre." } }));
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/auth/login").send({ username: "Alper", password: "wrong" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_FAILED");
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("verify-pick için yalnızca güvenli body alanlarını aktarır", async () => {
    let receivedBody: unknown;
    const panelUrl = await startPanel((req, res) => {
      receivedBody = req.body;
      res.json({ success: true, data: { product_id: "p1", match_type: "sku" } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/orders/o1/verify-pick")
      .set("Cookie", sessionCookie)
      .send({ product_id: "p1", code: "SKU-1", admin: true });
    expect(response.status).toBe(200);
    expect(receivedBody).toEqual({ product_id: "p1", code: "SKU-1" });
  });

  it("toplama geçmişi için yalnız whitelist filtrelerini ve sınırlandırılmış sayfalama değerlerini aktarır", async () => {
    let receivedQuery: unknown;
    const panelUrl = await startPanel((req, res) => {
      receivedQuery = req.query;
      res.json({ success: true, data: [], pagination: { page: 2, limit: 100, total: 0, total_pages: 0 } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .get("/api/pick-history?page=2&limit=500&sku=KIT-001&status=PICKED&admin=true")
      .set("Cookie", sessionCookie);
    expect(response.status).toBe(200);
    expect(receivedQuery).toEqual({ page: "2", limit: "100", sku: "KIT-001", status: "PICKED" });
  });

  it("tamamlama notunu kırpar ve bilinmeyen body alanlarını panele göndermez", async () => {
    let receivedBody: unknown;
    const panelUrl = await startPanel((req, res) => {
      receivedBody = req.body;
      res.json({ success: true, data: { id: "order-1", status: "Toplandı" } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/orders/order-1/complete")
      .set("Cookie", sessionCookie)
      .send({ note: "  Kırılabilir  ", role: "admin" });
    expect(response.status).toBe(200);
    expect(receivedBody).toEqual({ note: "Kırılabilir" });
  });

  it("logout oturum cookie'sini temizler", async () => {
    const response = await request(createWarehouseApp({ panelApiBaseUrl: "http://panel.test", warehouseApiKey: SECRET }))
      .post("/api/auth/logout").set("Cookie", sessionCookie);
    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]?.[0]).toMatch(/warehouse_session=;/);
  });
});
