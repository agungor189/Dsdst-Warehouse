import express, { type NextFunction, type Request, type Response as ExpressResponse } from "express";
import helmet from "helmet";
import path from "node:path";

export interface WarehouseBffConfig {
  panelApiBaseUrl?: string;
  warehouseApiKey?: string;
  timeoutMs?: number;
  staticDir?: string;
  cookieSecure?: boolean;
  logger?: Pick<Console, "error">;
}

type ProxyMethod = "GET" | "POST";
const SESSION_COOKIE = "warehouse_session";
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const sensitiveFieldNames = new Set([
  "x-api-key", "x_api_key", "api-key", "api_key", "warehouse_api_key",
  "authorization", "cookie", "token", "password",
]);

const redactSensitive = (value: unknown, secrets: string[]): unknown => {
  if (typeof value === "string") {
    return secrets.filter(Boolean).reduce((safe, secret) => safe.split(secret).join("[REDACTED]"), value);
  }
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, secrets));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      sensitiveFieldNames.has(key.toLowerCase()) ? "[REDACTED]" : redactSensitive(item, secrets),
    ]));
  }
  return value;
};

const rewritePanelPaths = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replace(/^\/api\/warehouse\/v1\/products\//, "/api/products/");
  }
  if (Array.isArray(value)) return value.map(rewritePanelPaths);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewritePanelPaths(item)]));
  }
  return value;
};

const readCookie = (req: Request, name: string) => {
  for (const pair of String(req.headers.cookie || "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
};

const safePositiveInteger = (value: unknown, fallback: number, max?: number) => {
  const source = Array.isArray(value) ? value[0] : value;
  const number = Number(source);
  if (!Number.isInteger(number) || number < 1) return fallback;
  return max ? Math.min(number, max) : number;
};

const safeQueryText = (value: unknown, maxLength = 120) => {
  const source = Array.isArray(value) ? value[0] : value;
  return typeof source === "string" ? source.trim().slice(0, maxLength) : "";
};

const configError = (config: WarehouseBffConfig) => {
  if (!config.panelApiBaseUrl || !config.warehouseApiKey) return "missing";
  try {
    const url = new URL(config.panelApiBaseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "invalid";
  } catch {
    return "invalid";
  }
  return null;
};

export function createWarehouseApp(config: WarehouseBffConfig) {
  const app = express();
  const timeoutMs = config.timeoutMs ?? 8_000;
  const logger = config.logger ?? console;
  const cookieOptions = {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: config.cookieSecure ?? false,
    path: "/",
  };

  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: "2mb", strict: true }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  const configurationFailure = (res: ExpressResponse) => {
    const invalidConfig = configError(config);
    if (!invalidConfig) return false;
    res.status(503).json({
      success: false,
      error: {
        code: invalidConfig === "missing" ? "BFF_NOT_CONFIGURED" : "BFF_INVALID_CONFIG",
        message: "Warehouse bağlantısı sunucuda yapılandırılmamış.",
      },
    });
    return true;
  };

  const fetchPanel = async (res: ExpressResponse, target: URL, init: RequestInit): Promise<globalThis.Response | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(target, { ...init, redirect: "error", signal: controller.signal });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      logger.error(`[warehouse-bff] ${timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE"}`);
      res.status(timedOut ? 504 : 502).json({
        success: false,
        error: {
          code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
          message: timedOut
            ? "Panel API zaman aşımına uğradı."
            : "Panel bağlantısı yok. Ağ bağlantısını kontrol edin.",
        },
      });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  const readJson = async (upstream: globalThis.Response, res: ExpressResponse): Promise<unknown | null> => {
    const rawBody = await upstream.text();
    try {
      return JSON.parse(rawBody);
    } catch {
      logger.error("[warehouse-bff] UPSTREAM_INVALID_RESPONSE");
      res.status(502).json({
        success: false,
        error: { code: "UPSTREAM_INVALID_RESPONSE", message: "Panel API geçersiz yanıt verdi." },
      });
      return null;
    }
  };

  const safeResponse = (body: unknown, sessionToken = "") => rewritePanelPaths(redactSensitive(
    body,
    [config.warehouseApiKey || "", sessionToken],
  ));

  const requireSession = (req: Request, res: ExpressResponse, next: NextFunction) => {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: "SESSION_REQUIRED", message: "Oturum açmanız gerekiyor." },
      });
    }
    res.locals.sessionToken = token;
    next();
  };

  app.post("/api/auth/login", async (req, res) => {
    if (configurationFailure(res)) return;
    const username = typeof req.body?.username === "string" ? req.body.username.trim().slice(0, 254) : "";
    const password = typeof req.body?.password === "string" ? req.body.password.slice(0, 1024) : "";
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Kullanıcı adı/e-posta ve şifre zorunludur." },
      });
    }

    const target = new URL(`${config.panelApiBaseUrl!.replace(/\/$/, "")}/api/auth/login`);
    const upstream = await fetchPanel(res, target, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!upstream) return;
    const body = await readJson(upstream, res);
    if (body === null) return;
    if (!upstream.ok) return res.status(upstream.status).json(safeResponse(body));

    const auth = body as { token?: unknown; user?: Record<string, unknown> };
    const token = typeof auth.token === "string" ? auth.token : "";
    if (!token || !auth.user) {
      logger.error("[warehouse-bff] UPSTREAM_INVALID_AUTH_RESPONSE");
      return res.status(502).json({
        success: false,
        error: { code: "UPSTREAM_INVALID_RESPONSE", message: "Panel oturum yanıtı geçersiz." },
      });
    }
    if (auth.user.must_change_password === true) {
      return res.status(403).json({
        success: false,
        error: { code: "PASSWORD_CHANGE_REQUIRED", message: "Önce panel üzerinden şifrenizi değiştirin." },
      });
    }
    res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE_MS });
    return res.json({ success: true, data: safeResponse(auth.user, token) });
  });

  app.get("/api/auth/me", requireSession, async (_req, res) => {
    if (configurationFailure(res)) return;
    const token = String(res.locals.sessionToken);
    const target = new URL(`${config.panelApiBaseUrl!.replace(/\/$/, "")}/api/auth/me`);
    const upstream = await fetchPanel(res, target, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (!upstream) return;
    const body = await readJson(upstream, res);
    if (body === null) return;
    if (!upstream.ok) {
      res.clearCookie(SESSION_COOKIE, cookieOptions);
      return res.status(upstream.status).json(safeResponse(body, token));
    }
    return res.json({ success: true, data: safeResponse((body as { user?: unknown }).user, token) });
  });

  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.json({ success: true, data: null });
  });

  const forward = async (
    req: Request,
    res: ExpressResponse,
    method: ProxyMethod,
    upstreamPath: string,
    query?: URLSearchParams,
    body?: Record<string, unknown>,
    binary = false,
  ) => {
    if (configurationFailure(res)) return;
    const sessionToken = String(res.locals.sessionToken);
    const baseUrl = config.panelApiBaseUrl!.replace(/\/$/, "");
    const target = new URL(`${baseUrl}/api/warehouse/v1${upstreamPath}`);
    if (query) target.search = query.toString();
    const upstream = await fetchPanel(res, target, {
      method,
      headers: {
        Accept: binary ? "image/*" : "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        "x-api-key": config.warehouseApiKey!,
        Authorization: `Bearer ${sessionToken}`,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!upstream) return;

    if (binary && upstream.ok) {
      const contentType = upstream.headers.get("content-type");
      if (contentType) res.setHeader("Content-Type", contentType);
      return res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
    }
    if (upstream.status === 204) return res.status(204).end();
    const responseBody = await readJson(upstream, res);
    if (responseBody === null) return;
    return res.status(upstream.status).json(safeResponse(responseBody, sessionToken));
  };

  app.get("/api/orders", requireSession, (req, res) => {
    const query = new URLSearchParams({
      page: String(safePositiveInteger(req.query.page, 1)),
      limit: String(safePositiveInteger(req.query.limit, 100, 100)),
    });
    return forward(req, res, "GET", "/orders", query);
  });
  app.get("/api/orders/:id", requireSession, (req, res) =>
    forward(req, res, "GET", `/orders/${encodeURIComponent(String(req.params.id))}`));
  app.get("/api/orders/:id/pick-plan", requireSession, (req, res) =>
    forward(req, res, "GET", `/orders/${encodeURIComponent(String(req.params.id))}/pick-plan`));
  app.get("/api/scan/:code", requireSession, (req, res) =>
    forward(req, res, "GET", `/scan/${encodeURIComponent(String(req.params.code))}`));
  app.get("/api/products/:id/image", requireSession, (req, res) =>
    forward(req, res, "GET", `/products/${encodeURIComponent(String(req.params.id))}/image`, undefined, undefined, true));
  app.get("/api/pick-history", requireSession, (req, res) => {
    const query = new URLSearchParams({
      page: String(safePositiveInteger(req.query.page, 1)),
      limit: String(safePositiveInteger(req.query.limit, 25, 100)),
    });
    for (const [key, maxLength] of Object.entries({
      date_from: 40,
      date_to: 40,
      summary_from: 40,
      summary_to: 40,
      picker_user_id: 80,
      sku: 120,
      product_name: 120,
      order_number: 120,
      status: 20,
    })) {
      const value = safeQueryText(req.query[key], maxLength);
      if (value) query.set(key, value);
    }
    return forward(req, res, "GET", "/pick-history", query);
  });
  app.get("/api/pick-history/:id", requireSession, (req, res) =>
    forward(req, res, "GET", `/pick-history/${encodeURIComponent(String(req.params.id))}`));
  app.post("/api/orders/:id/start", requireSession, (req, res) =>
    forward(req, res, "POST", `/orders/${encodeURIComponent(String(req.params.id))}/start`));
  app.post("/api/orders/:id/verify-pick", requireSession, (req, res) => {
    const productId = typeof req.body?.product_id === "string" ? req.body.product_id.trim() : "";
    const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
    if (!productId || !code) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Ürün ve kod zorunludur." } });
    }
    return forward(req, res, "POST", `/orders/${encodeURIComponent(String(req.params.id))}/verify-pick`, undefined, {
      product_id: productId,
      code,
    });
  });
  app.post("/api/orders/:id/pick-items/:productId/complete", requireSession, (req, res) => {
    const pickedQuantity = Number(req.body?.picked_quantity);
    if (!Number.isFinite(pickedQuantity)) {
      return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Toplanan adet zorunludur." } });
    }
    return forward(
      req,
      res,
      "POST",
      `/orders/${encodeURIComponent(String(req.params.id))}/pick-items/${encodeURIComponent(String(req.params.productId))}/complete`,
      undefined,
      { picked_quantity: pickedQuantity },
    );
  });
  app.post("/api/orders/:id/complete", requireSession, (req, res) => {
    const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";
    return forward(req, res, "POST", `/orders/${encodeURIComponent(String(req.params.id))}/complete`, undefined, note ? { note } : {});
  });

  const safeAdminBody = (body: unknown) => body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  app.get("/api/admin/batches", requireSession, (req, res) => forward(req, res, "GET", "/admin/batches"));
  app.post("/api/admin/batches", requireSession, (req, res) => forward(req, res, "POST", "/admin/batches", undefined, safeAdminBody(req.body)));
  app.get("/api/admin/batches/:id", requireSession, (req, res) =>
    forward(req, res, "GET", `/admin/batches/${encodeURIComponent(String(req.params.id))}`));
  app.post("/api/admin/batches/:id/import/preview", requireSession, (req, res) =>
    forward(req, res, "POST", `/admin/batches/${encodeURIComponent(String(req.params.id))}/import/preview`, undefined, {
      rows: Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 5000) : [],
    }));
  app.post("/api/admin/batches/:id/import/apply", requireSession, (req, res) =>
    forward(req, res, "POST", `/admin/batches/${encodeURIComponent(String(req.params.id))}/import/apply`, undefined, {
      rows: Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 5000) : [],
      preview_hash: safeQueryText(req.body?.preview_hash, 128),
    }));
  app.get("/api/admin/receiving/lots/:lot", requireSession, (req, res) =>
    forward(req, res, "GET", `/admin/receiving/lots/${encodeURIComponent(String(req.params.lot))}`));
  app.get("/api/admin/receiving/sessions", requireSession, (req, res) =>
    forward(req, res, "GET", "/admin/receiving/sessions"));
  app.get("/api/admin/receiving/my-active-package", requireSession, (req, res) =>
    forward(req, res, "GET", "/admin/receiving/my-active-package"));
  app.post("/api/admin/receiving/sessions", requireSession, (req, res) =>
    forward(req, res, "POST", "/admin/receiving/sessions", undefined, {
      lot_number: safeQueryText(req.body?.lot_number, 150),
      supplier_code: safeQueryText(req.body?.supplier_code, 100),
      device_id: safeQueryText(req.body?.device_id, 150),
    }));
  app.get("/api/admin/receiving/sessions/:id", requireSession, (req, res) =>
    forward(req, res, "GET", `/admin/receiving/sessions/${encodeURIComponent(String(req.params.id))}`));
  app.get("/api/admin/receiving/sessions/:id/my-active-package", requireSession, (req, res) =>
    forward(req, res, "GET", `/admin/receiving/sessions/${encodeURIComponent(String(req.params.id))}/my-active-package`));
  app.get("/api/admin/receiving/sessions/:id/my-packages", requireSession, (req, res) =>
    forward(req, res, "GET", `/admin/receiving/sessions/${encodeURIComponent(String(req.params.id))}/my-packages`));
  app.post("/api/admin/receiving/sessions/:id/state", requireSession, (req, res) =>
    forward(req, res, "POST", `/admin/receiving/sessions/${encodeURIComponent(String(req.params.id))}/state`, undefined, {
      state: safeQueryText(req.body?.state, 20),
      device_id: safeQueryText(req.body?.device_id, 150),
    }));
  app.post("/api/admin/receiving/sessions/:id/complete", requireSession, (req, res) =>
    forward(req, res, "POST", `/admin/receiving/sessions/${encodeURIComponent(String(req.params.id))}/complete`, undefined, {
      force_reason: safeQueryText(req.body?.force_reason, 1000),
      device_id: safeQueryText(req.body?.device_id, 150),
    }));
  app.post("/api/admin/packages/claim-next", requireSession, (req, res) => {
    const body: Record<string, unknown> = { supplier_code: safeQueryText(req.body?.supplier_code, 100) };
    const sessionId = safeQueryText(req.body?.session_id, 100);
    const deviceId = safeQueryText(req.body?.device_id, 150);
    if (sessionId) body.session_id = sessionId;
    if (deviceId) body.device_id = deviceId;
    return forward(req, res, "POST", "/admin/packages/claim-next", undefined, body);
  });
  app.get("/api/admin/packages/by-code/:code", requireSession, (req, res) =>
    forward(req, res, "GET", `/admin/packages/by-code/${encodeURIComponent(String(req.params.code))}`));
  app.post("/api/admin/packages/:id/print", requireSession, (req, res) =>
    forward(req, res, "POST", `/admin/packages/${encodeURIComponent(String(req.params.id))}/print`, undefined, safeAdminBody(req.body)));
  app.post("/api/admin/packages/:id/release-receiving", requireSession, (req, res) =>
    forward(req, res, "POST", `/admin/packages/${encodeURIComponent(String(req.params.id))}/release-receiving`, undefined, {
      device_id: safeQueryText(req.body?.device_id, 150),
    }));
  app.get("/api/admin/print-jobs", requireSession, (req, res) => {
    const query = new URLSearchParams({ limit: String(safePositiveInteger(req.query.limit, 100, 500)) });
    return forward(req, res, "GET", "/admin/print-jobs", query);
  });
  app.get("/api/admin/locations", requireSession, (req, res) => forward(req, res, "GET", "/admin/locations"));
  app.get("/api/admin/warehouse-map", requireSession, (req, res) => forward(req, res, "GET", "/admin/warehouse-map"));
  app.get("/api/admin/layouts/placement", requireSession, (req, res) => forward(req, res, "GET", "/admin/layouts/placement"));
  app.post("/api/admin/layouts/placement/preview", requireSession, (req, res) => forward(req, res, "POST", "/admin/layouts/placement/preview", undefined, {
    source_filename: safeQueryText(req.body?.source_filename, 255),
    csv_text: safeQueryText(req.body?.csv_text, 2 * 1024 * 1024),
  }));
  app.post("/api/admin/layouts/placement/apply", requireSession, (req, res) => forward(req, res, "POST", "/admin/layouts/placement/apply", undefined, {
    source_filename: safeQueryText(req.body?.source_filename, 255),
    csv_text: safeQueryText(req.body?.csv_text, 2 * 1024 * 1024),
    preview_hash: safeQueryText(req.body?.preview_hash, 128),
    notes: safeQueryText(req.body?.notes, 1000),
  }));
  app.get("/api/admin/packages", requireSession, (req, res) => {
    const query = new URLSearchParams({
      page: String(safePositiveInteger(req.query.page, 1)),
      limit: String(safePositiveInteger(req.query.limit, 25, 100)),
    });
    for (const key of ["query", "status", "location", "lot", "date_from", "date_to"] as const) {
      const value = safeQueryText(req.query[key], 120);
      if (value) query.set(key, value);
    }
    return forward(req, res, "GET", "/admin/packages", query);
  });
  app.get("/api/admin/movements", requireSession, (req, res) => {
    const query = new URLSearchParams({ limit: String(safePositiveInteger(req.query.limit, 200, 500)) });
    return forward(req, res, "GET", "/admin/movements", query);
  });
  app.get("/api/admin/user-activity", requireSession, (req, res) => {
    const query = new URLSearchParams({ limit: String(safePositiveInteger(req.query.limit, 200, 500)) });
    return forward(req, res, "GET", "/admin/user-activity", query);
  });
  app.get("/api/admin/locations/suggestion", requireSession, (req, res) => {
    const query = new URLSearchParams();
    const packageId = safeQueryText(req.query.package_id, 100);
    if (packageId) query.set("package_id", packageId);
    return forward(req, res, "GET", "/admin/locations/suggestion", query);
  });
  app.get("/api/admin/packages/:id/receiving-location", requireSession, (req, res) =>
    forward(req, res, "GET", `/admin/packages/${encodeURIComponent(String(req.params.id))}/receiving-location`));
  app.post("/api/admin/locations", requireSession, (req, res) => forward(req, res, "POST", "/admin/locations", undefined, safeAdminBody(req.body)));
  app.post("/api/admin/placements", requireSession, (req, res) => forward(req, res, "POST", "/admin/placements", undefined, safeAdminBody(req.body)));
  app.post("/api/admin/moves", requireSession, (req, res) => forward(req, res, "POST", "/admin/moves", undefined, safeAdminBody(req.body)));
  app.post("/api/admin/stock-counts", requireSession, (req, res) => forward(req, res, "POST", "/admin/stock-counts", undefined, safeAdminBody(req.body)));
  app.get("/api/admin/label-templates", requireSession, (req, res) => forward(req, res, "GET", "/admin/label-templates"));
  app.post("/api/admin/label-templates", requireSession, (req, res) => forward(req, res, "POST", "/admin/label-templates", undefined, safeAdminBody(req.body)));

  app.use("/api", (_req, res) => res.status(404).json({
    success: false,
    error: { code: "BFF_ROUTE_NOT_FOUND", message: "Warehouse API yolu bulunamadı." },
  }));

  if (config.staticDir) {
    app.use(express.static(config.staticDir, {
      index: false,
      maxAge: "1y",
      immutable: true,
      setHeaders: (res, filePath) => {
        if (["sw.js", "manifest.webmanifest"].includes(path.basename(filePath))) {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    }));
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.setHeader("Cache-Control", "no-cache");
      return res.sendFile(path.join(config.staticDir!, "index.html"));
    });
  }

  return app;
}
