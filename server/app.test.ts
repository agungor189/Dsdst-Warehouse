// @vitest-environment node
import express, { type RequestHandler } from "express";
import type { Server } from "node:http";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWarehouseApp as createWarehouseAppImplementation, type WarehouseBffConfig } from "./app.js";

const SECRET = "warehouse-secret-that-must-never-leak";
const SESSION = "test-panel-jwt";
const sessionCookie = `warehouse_session=${SESSION}`;
const TRUSTED_ORIGIN = "https://warehouse.example";
const servers: Server[] = [];
const createWarehouseApp = (config: WarehouseBffConfig) => createWarehouseAppImplementation({
  ...config,
  allowedOrigins: config.allowedOrigins ?? [TRUSTED_ORIGIN],
});

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

  it("versioned catalog contract'ını salt-okunur olarak Panel'e iletir", async () => {
    const received: { path?: string; authorization?: string; key?: string } = {};
    const panelUrl = await startPanel((req, res) => {
      received.path = req.path;
      received.authorization = req.header("authorization");
      received.key = req.header("x-api-key");
      res.json({ success: true, contract: "dsdst.catalog-product.v1", data: [{ id: "p-1", sku: "SKU-1", base_uom: { code: "piece" }, catalog_version_ref: "catalog-product:p-1:v1" }] });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .get("/api/catalog/v1/products?catalog_type=connector").set("Cookie", sessionCookie);
    expect(response.status).toBe(200);
    expect(response.body.contract).toBe("dsdst.catalog-product.v1");
    expect(received).toEqual({ path: "/api/warehouse/v1/catalog/products", authorization: `Bearer ${SESSION}`, key: SECRET });
  });

  it("V2-07 inventory fulfillment contract'ını salt-okunur ve canlı Panel kaynağından iletir", async () => {
    const received: { path?: string; authorization?: string; key?: string } = {};
    const panelUrl = await startPanel((req, res) => {
      received.path = req.path;
      received.authorization = req.header("authorization");
      received.key = req.header("x-api-key");
      res.json({ success: true, contract: "dsdst.inventory-fulfillment.v1", data: { reservationId: "res-1", status: "ACTIVE", requirements: [{ lotId: "lot-old", state: "REPLENISH_SAME_LOT" }] } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .get("/api/inventory/v1/reservations/res-1/fulfillment").set("Cookie", sessionCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.requirements[0]).toEqual({ lotId: "lot-old", state: "REPLENISH_SAME_LOT" });
    expect(received).toEqual({ path: "/api/warehouse/v1/inventory/reservations/res-1/fulfillment", authorization: `Bearer ${SESSION}`, key: SECRET });
  });

  it("V2-07 dispatch operation identity is preserved and unsafe fields are stripped", async () => {
    let received: { path?: string; body?: unknown } = {};
    const panelUrl = await startPanel((req, res) => {
      received = { path: req.path, body: req.body };
      res.json({ success: true, contract: "dsdst.inventory-dispatch.v1", data: { id: "res-1", status: "DISPATCHED" } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/inventory/v1/reservations/res-1/dispatch")
      .set("Cookie", sessionCookie).set("Origin", TRUSTED_ORIGIN)
      .send({ shipmentId: "ship-1", dispatchedAt: "2026-09-20T12:00:00.000Z", idempotency_key: "dispatch-op", central_stock: -99, role: "admin" });
    expect(response.status).toBe(200);
    expect(received).toEqual({
      path: "/api/warehouse/v1/inventory/reservations/res-1/dispatch",
      body: { shipmentId: "ship-1", dispatchedAt: "2026-09-20T12:00:00.000Z", idempotency_key: "dispatch-op" },
    });
  });

  it("V2-08 warehouse execution commands are forwarded to Panel without local inventory authority", async () => {
    let received: { path?: string; body?: unknown; authorization?: string; key?: string } = {};
    const panelUrl = await startPanel((req, res) => {
      received = { path: req.path, body: req.body, authorization: req.header("authorization"), key: req.header("x-api-key") };
      res.json({ success: true, contract: "dsdst.warehouse-execution.v1", data: { package: { id: "pkg-1" }, onHandBaseInt: 10 }, idempotent: false });
    });
    const body = { destinationCode: "A1-K1-P1-FRONT", scannedDestinationCode: "A1-K1-P1-FRONT", idempotency_key: "place-op" };
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/execution/packages/pkg-1/place")
      .set("Cookie", sessionCookie).set("Origin", TRUSTED_ORIGIN).send(body);
    expect(response.status).toBe(200);
    expect(response.body.contract).toBe("dsdst.warehouse-execution.v1");
    expect(received).toEqual({
      path: "/api/warehouse/v1/execution/packages/pkg-1/place",
      body,
      authorization: `Bearer ${SESSION}`,
      key: SECRET,
    });
  });

  it("V2-10 return acceptance preserves operation identity and remains a Panel-owned command", async () => {
    const received: Array<{ method: string; path: string; body: any }> = [];
    const panelUrl = await startPanel((req, res) => {
      received.push({ method: req.method, path: req.path, body: req.body });
      res.json({ success: true, contract: "dsdst.warehouse-return-acceptance.v1", data: req.method === "GET" ? [] : { id: "return-1" } });
    });
    const app = createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET, allowedOrigins: [TRUSTED_ORIGIN] });
    const list = await request(app).get("/api/returns").set("Cookie", sessionCookie);
    expect(list.status).toBe(200);
    const body = { lines: [{ returnLineId: "line-1", quantityBaseInt: 1, disposition: "DAMAGED", locationId: "Q1" }], receivedAt: "2026-09-23T10:00:00.000Z", idempotency_key: "return-op-1" };
    const receipt = await request(app).post("/api/returns/return-1/receipts").set("Cookie", sessionCookie).set("Origin", TRUSTED_ORIGIN).send(body);
    expect(receipt.status).toBe(200);
    expect(received).toEqual([
      { method: "GET", path: "/api/warehouse/v1/returns", body: undefined },
      { method: "POST", path: "/api/warehouse/v1/returns/return-1/receipts", body },
    ]);
  });

  it("pending replenishments and scanned same-lot completion stay on the Panel execution contract", async () => {
    const received: Array<{ method: string; path: string; body: unknown }> = [];
    const panelUrl = await startPanel((req, res) => {
      received.push({ method: req.method, path: req.path, body: req.body });
      res.json({ success: true, contract: "dsdst.warehouse-replenishment-tasks.v1", data: [] });
    });
    const app = createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET });
    const list = await request(app).get("/api/execution/replenishments").set("Cookie", sessionCookie);
    const completeBody = {
      scannedSourcePackageCode: "RESERVE-PKG-1",
      destinationCode: "A1-K1-P2-FRONT",
      scannedDestinationCode: "A1-K1-P2-FRONT",
      idempotency_key: "replenish-op",
    };
    const complete = await request(app).post("/api/execution/replenishments/task-1/complete")
      .set("Cookie", sessionCookie).set("Origin", TRUSTED_ORIGIN).send(completeBody);
    expect(list.status).toBe(200);
    expect(complete.status).toBe(200);
    expect(received).toEqual([
      { method: "GET", path: "/api/warehouse/v1/execution/replenishments", body: undefined },
      { method: "POST", path: "/api/warehouse/v1/execution/replenishments/task-1/complete", body: completeBody },
    ]);
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

  it("cookie-auth unsafe isteklerde eksik, cross-origin ve same-site farklı origin'i reddeder", async () => {
    const panelRequest = vi.fn((_req, res) => res.json({ success: true, data: { id: "order-1" } }));
    const panelUrl = await startPanel(panelRequest);
    const app = createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET, trustProxyHops: 1, allowedOrigins: [] });
    const unsafe = () => request(app).post("/api/orders/order-1/start")
      .set("Cookie", sessionCookie)
      .set("Host", "warehouse.example")
      .set("X-Forwarded-Proto", "https")
      .send({});

    const missing = await unsafe();
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe("CSRF_FORBIDDEN");

    const crossOrigin = await unsafe().set("Origin", "https://attacker.example");
    expect(crossOrigin.status).toBe(403);
    expect(crossOrigin.body.error.code).toBe("CSRF_FORBIDDEN");

    const invalidOrigin = await unsafe().set("Origin", "null");
    expect(invalidOrigin.status).toBe(403);
    expect(invalidOrigin.body.error.code).toBe("CSRF_FORBIDDEN");

    const sameSiteDifferentOrigin = await unsafe().set("Origin", "https://warehouse.example:444");
    expect(sameSiteDifferentOrigin.status).toBe(403);
    expect(sameSiteDifferentOrigin.body.error.code).toBe("CSRF_FORBIDDEN");

    const trusted = await unsafe().set("Origin", "https://warehouse.example");
    expect(trusted.status).toBe(200);
    expect(panelRequest).toHaveBeenCalledTimes(1);
  });

  it("panel giriş tokenını HttpOnly cookie yapar ve response içinde göstermez", async () => {
    const panelUrl = await startPanel((req, res) => {
      expect(req.path).toBe("/api/auth/service/login");
      expect(req.header("x-api-key")).toBe(SECRET);
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

  it("login proxy'sini IP ve kullanıcı adı birleşimine göre sınırlar", async () => {
    const panelRequest = vi.fn((_req, res) => res.status(401).json({ success: false, error: { code: "AUTH_FAILED", message: "Geçersiz giriş." } }));
    const panelUrl = await startPanel(panelRequest);
    const app = createWarehouseApp({
      panelApiBaseUrl: panelUrl,
      warehouseApiKey: SECRET,
      loginRateLimit: { maxAttempts: 2, windowMs: 60_000 },
    });

    expect((await request(app).post("/api/auth/login").send({ username: "Alper", password: "wrong" })).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ username: "alper", password: "wrong" })).status).toBe(401);
    const blocked = await request(app).post("/api/auth/login").send({ username: "ALPER", password: "wrong" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect(panelRequest).toHaveBeenCalledTimes(2);

    const otherUser = await request(app).post("/api/auth/login").send({ username: "Ayşe", password: "wrong" });
    expect(otherUser.status).toBe(401);
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
      .set("Origin", TRUSTED_ORIGIN)
      .send({ product_id: "p1", code: "SKU-1", admin: true });
    expect(response.status).toBe(200);
    expect(receivedBody).toEqual({ product_id: "p1", code: "SKU-1" });
  });

  it("Warehouse Admin claim yolunu sabit upstream rotasına ve güvenli alana sınırlar", async () => {
    let received: { path?: string; body?: unknown; authorization?: string; key?: string } = {};
    const panelUrl = await startPanel((req, res) => {
      received = { path: req.path, body: req.body, authorization: req.header("authorization"), key: req.header("x-api-key") };
      res.json({ success: true, data: { id: "package-1", package_code: "PKG-2609-000001" } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/admin/packages/claim-next")
      .set("Cookie", sessionCookie)
      .set("Origin", TRUSTED_ORIGIN)
      .send({ supplier_code: " SUP-1 ", role: "admin", x_api_key: "leak" });
    expect(response.status).toBe(200);
    expect(received).toEqual({
      path: "/api/warehouse/v1/admin/packages/claim-next",
      body: { supplier_code: "SUP-1" },
      authorization: `Bearer ${SESSION}`,
      key: SECRET,
    });
  });

  it("lot session başlangıcında lot, tedarikçi ve cihaz kimliğini güvenli biçimde Panel'e aktarır", async () => {
    let received: { path?: string; body?: unknown } = {};
    const panelUrl = await startPanel((req, res) => {
      received = { path: req.path, body: req.body };
      res.json({ success: true, data: { id: "session-1", lot_number: "LOT-1", receiving_state: "active" } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/admin/receiving/sessions")
      .set("Cookie", sessionCookie)
      .set("Origin", TRUSTED_ORIGIN)
      .send({ lot_number: " LOT-1 ", device_id: " phone-1 ", supplier_code: "leak", role: "admin" });
    expect(response.status).toBe(200);
    expect(received).toEqual({
      path: "/api/warehouse/v1/admin/receiving/sessions",
      body: { lot_number: "LOT-1", supplier_code: "leak", device_id: "phone-1" },
    });
  });

  it("yerleşim CSV önizlemesinde yalnız dosya adı ve CSV metnini Panel'e aktarır", async () => {
    let received: { path?: string; body?: unknown } = {};
    const panelUrl = await startPanel((req, res) => {
      received = { path: req.path, body: req.body };
      res.json({ success: true, data: { valid: true, preview_hash: "hash" } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/admin/layouts/placement/preview").set("Cookie", sessionCookie).set("Origin", TRUSTED_ORIGIN)
      .send({ source_filename: " layout.csv ", csv_text: "sku,pick_face_location\nSKU-1,A1-K1-P1", active: true, created_by: "attacker" });
    expect(response.status).toBe(200);
    expect(received).toEqual({
      path: "/api/warehouse/v1/admin/layouts/placement/preview",
      body: { source_filename: "layout.csv", csv_text: "sku,pick_face_location\nSKU-1,A1-K1-P1" },
    });
  });

  it("fiziksel depo planını Panel Warehouse sözleşmesine iletir", async () => {
    let received: { path?: string; body?: unknown } = {};
    const layout = { warehouseConfig: { name: "E2E" }, objects: [{ id: "rack-z9", type: "rack", rackCode: "Z9" }] };
    const panelUrl = await startPanel((req, res) => {
      received = { path: req.path, body: req.body };
      res.status(201).json({ success: true, data: { id: "layout-1" } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/admin/layouts/import-legacy").set("Cookie", sessionCookie).set("Origin", TRUSTED_ORIGIN).send(layout);
    expect(response.status).toBe(201);
    expect(received).toEqual({ path: "/api/warehouse/v1/admin/layouts/import-legacy", body: layout });
  });

  it("Mal Kabul planlı rafını paket kimliğiyle sabit upstream rotasından alır", async () => {
    let receivedPath = "";
    const panelUrl = await startPanel((req, res) => {
      receivedPath = req.path;
      res.json({ success: true, data: { id: "location-1", code: "A3-K2-P5" } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .get("/api/admin/packages/package-1/receiving-location")
      .set("Cookie", sessionCookie);
    expect(response.status).toBe(200);
    expect(receivedPath).toBe("/api/warehouse/v1/admin/packages/package-1/receiving-location");
    expect(response.body.data.code).toBe("A3-K2-P5");
  });

  it.each([
    ["/api/admin/receiving/my-active-package", "/api/warehouse/v1/admin/receiving/my-active-package"],
    ["/api/admin/receiving/sessions/session-1/my-active-package", "/api/warehouse/v1/admin/receiving/sessions/session-1/my-active-package"],
    ["/api/admin/receiving/sessions/session-1/my-packages", "/api/warehouse/v1/admin/receiving/sessions/session-1/my-packages"],
  ])("kullanıcıya özel receiving sorgusunu güvenli upstream rotasına iletir: %s", async (clientPath, upstreamPath) => {
    let receivedPath = "";
    const panelUrl = await startPanel((req, res) => { receivedPath = req.path; res.json({ success: true, data: [] }); });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .get(clientPath).set("Cookie", sessionCookie);
    expect(response.status).toBe(200);
    expect(receivedPath).toBe(upstreamPath);
  });

  it("claim serbest bırakmada yalnız cihaz kimliğini upstream'e aktarır", async () => {
    let received: { path?: string; body?: unknown } = {};
    const panelUrl = await startPanel((req, res) => { received = { path: req.path, body: req.body }; res.json({ success: true, data: {} }); });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/admin/packages/package-1/release-receiving").set("Cookie", sessionCookie).set("Origin", TRUSTED_ORIGIN)
      .send({ device_id: " phone-1 ", user_id: "other-user", status: "EXPECTED" });
    expect(response.status).toBe(200);
    expect(received).toEqual({
      path: "/api/warehouse/v1/admin/packages/package-1/release-receiving",
      body: { device_id: "phone-1" },
    });
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

  it("harita snapshot'ını tek sabit endpoint üzerinden taşır", async () => {
    let receivedPath = "";
    const panelUrl = await startPanel((req, res) => { receivedPath = req.path; res.json({ success: true, data: { warehouse: null, locations: [], packages: [] } }); });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .get("/api/admin/warehouse-map").set("Cookie", sessionCookie);
    expect(response.status).toBe(200);
    expect(receivedPath).toBe("/api/warehouse/v1/admin/warehouse-map");
  });

  it("paket listesinde yalnız sunucu filtreleri ve sınırlı sayfalama aktarır", async () => {
    let receivedQuery: unknown;
    const panelUrl = await startPanel((req, res) => { receivedQuery = req.query; res.json({ success: true, data: [], pagination: {} }); });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .get("/api/admin/packages?page=2&limit=999&query=PCI&lot=L1&location=A1&status=PLACED&unsafe=yes")
      .set("Cookie", sessionCookie);
    expect(response.status).toBe(200);
    expect(receivedQuery).toEqual({ page: "2", limit: "100", query: "PCI", status: "PLACED", location: "A1", lot: "L1" });
  });

  it("Label Printer purpose şablonlarını server-side API anahtarıyla okur", async () => {
    let received: { path?: string; query?: unknown; key?: string } = {};
    const labelUrl = await startPanel((req, res) => {
      received = { path: req.path, query: req.query, key: req.header("x-api-key") };
      res.json({ templates: [{ id: "receipt-v2", purpose: "goods_receipt" }] });
    });
    const panelUrl = await startPanel((req, res) => {
      expect(req.path).toBe("/api/auth/service/me");
      expect(req.header("authorization")).toBe(`Bearer ${SESSION}`);
      expect(req.header("x-api-key")).toBe(SECRET);
      res.json({ success: true, user: { id: "user-1", role: "user", permissions: { "warehouse:print_labels": true } } });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET, labelPrinterBaseUrl: labelUrl, labelPrinterApiKey: "label-secret" }))
      .get("/api/labels/templates?purpose=goods_receipt").set("Cookie", sessionCookie);
    expect(response.status).toBe(200);
    expect(response.body.data[0].id).toBe("receipt-v2");
    expect(received).toEqual({ path: "/api/v1/templates", query: { purpose: "goods_receipt" }, key: "label-secret" });
  });

  it("etiket önizlemesini purpose ve Warehouse verisiyle PDF olarak proxyler", async () => {
    let receivedBody: unknown;
    const labelUrl = await startPanel((req, res) => {
      receivedBody = req.body;
      res.set("X-Label-Template-Id", "location-live-v2");
      res.set("X-Label-Template-Purpose", "location");
      res.type("application/pdf").send(Buffer.from("%PDF-preview"));
    });
    const panelUrl = await startPanel((_req, res) => res.json({ success: true, user: { id: "user-1", role: "admin", permissions: {} } }));
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET, labelPrinterBaseUrl: labelUrl }))
      .post("/api/labels/preview").set("Cookie", sessionCookie).set("Origin", TRUSTED_ORIGIN)
      .send({ purpose: "location", data: { Lokasyon: "A1-K1-P1" }, unsafe: true });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["x-label-template-id"]).toBe("location-live-v2");
    expect(response.headers["x-label-template-purpose"]).toBe("location");
    expect(receivedBody).toEqual({ purpose: "location", data: { Lokasyon: "A1-K1-P1" } });
  });

  it.each([
    [undefined, "missing"],
    [`${SESSION}-fake`, "fake"],
    [`${SESSION}-revoked`, "revoked"],
  ])("Label proxy %s human session için 401 döner", async (token) => {
    const labelRequest = vi.fn((_req, res) => res.json({ templates: [] }));
    const labelUrl = await startPanel(labelRequest);
    const panelUrl = await startPanel((_req, res) => res.status(401).json({ success: false, error: { code: "UNAUTHORIZED" } }));
    const call = request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET, labelPrinterBaseUrl: labelUrl }))
      .get("/api/labels/templates");
    if (token) call.set("Cookie", `warehouse_session=${token}`);
    const response = await call;
    expect(response.status).toBe(401);
    expect(labelRequest).not.toHaveBeenCalled();
  });

  it("Label proxy service key tek başına veya eksik human capability ile çalışmaz", async () => {
    const labelRequest = vi.fn((_req, res) => res.json({ templates: [] }));
    const labelUrl = await startPanel(labelRequest);
    const panelUrl = await startPanel((_req, res) => res.json({ success: true, user: { id: "user-1", role: "user", permissions: {} } }));
    const app = createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET, labelPrinterBaseUrl: labelUrl });
    expect((await request(app).get("/api/labels/templates").set("x-api-key", SECRET)).status).toBe(401);
    expect((await request(app).get("/api/labels/templates").set("Cookie", sessionCookie)).status).toBe(403);
    expect(labelRequest).not.toHaveBeenCalled();
  });

  it("paket ve lokasyon baskısında purpose değerini istemciden bağımsız sabitler", async () => {
    const received: Array<{ path: string; body: unknown }> = [];
    const panelUrl = await startPanel((req, res) => {
      received.push({ path: req.path, body: req.body });
      res.json({ success: true, data: { job: { id: "job-1" } } });
    });
    const app = createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET });
    await request(app).post("/api/admin/packages/pkg-1/print").set("Cookie", sessionCookie).set("Origin", TRUSTED_ORIGIN)
      .send({ idempotency_key: "p-1", template_purpose: "shipping" });
    await request(app).post("/api/admin/locations/loc-1/print").set("Cookie", sessionCookie).set("Origin", TRUSTED_ORIGIN)
      .send({ idempotency_key: "l-1", template_purpose: "custom" });
    expect(received).toEqual([
      { path: "/api/warehouse/v1/admin/packages/pkg-1/print", body: { idempotency_key: "p-1", template_purpose: "goods_receipt" } },
      { path: "/api/warehouse/v1/admin/locations/loc-1/print", body: { idempotency_key: "l-1", template_purpose: "location" } },
    ]);
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
      .set("Origin", TRUSTED_ORIGIN)
      .send({ note: "  Kırılabilir  ", role: "admin" });
    expect(response.status).toBe(200);
    expect(receivedBody).toEqual({ note: "Kırılabilir" });
  });

  it("logout Panel session'ını human + service identity ile revoke eder ve sonra cookie'yi temizler", async () => {
    let received: { path?: string; token?: string; key?: string } = {};
    const panelUrl = await startPanel((req, res) => {
      received = { path: req.path, token: req.header("authorization"), key: req.header("x-api-key") };
      res.json({ success: true });
    });
    const response = await request(createWarehouseApp({ panelApiBaseUrl: panelUrl, warehouseApiKey: SECRET }))
      .post("/api/auth/logout").set("Cookie", sessionCookie).set("Origin", TRUSTED_ORIGIN);
    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]?.[0]).toMatch(/warehouse_session=;/);
    expect(received).toEqual({ path: "/api/auth/service/logout", token: `Bearer ${SESSION}`, key: SECRET });
  });
});
