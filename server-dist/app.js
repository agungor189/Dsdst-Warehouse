import express from "express";
import helmet from "helmet";
import path from "node:path";
import { createLoginRateLimit } from "./loginRateLimit.js";
const SESSION_COOKIE = "warehouse_session";
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const sensitiveFieldNames = new Set([
    "x-api-key", "x_api_key", "api-key", "api_key", "warehouse_api_key",
    "authorization", "cookie", "token", "password",
]);
const redactSensitive = (value, secrets) => {
    if (typeof value === "string") {
        return secrets.filter(Boolean).reduce((safe, secret) => safe.split(secret).join("[REDACTED]"), value);
    }
    if (Array.isArray(value))
        return value.map((item) => redactSensitive(item, secrets));
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [
            key,
            sensitiveFieldNames.has(key.toLowerCase()) ? "[REDACTED]" : redactSensitive(item, secrets),
        ]));
    }
    return value;
};
const rewritePanelPaths = (value) => {
    if (typeof value === "string") {
        return value.replace(/^\/api\/warehouse\/v1\/products\//, "/api/products/");
    }
    if (Array.isArray(value))
        return value.map(rewritePanelPaths);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, rewritePanelPaths(item)]));
    }
    return value;
};
const readCookie = (req, name) => {
    for (const pair of String(req.headers.cookie || "").split(";")) {
        const separator = pair.indexOf("=");
        if (separator < 0 || pair.slice(0, separator).trim() !== name)
            continue;
        try {
            return decodeURIComponent(pair.slice(separator + 1).trim());
        }
        catch {
            return undefined;
        }
    }
    return undefined;
};
const safePositiveInteger = (value, fallback, max) => {
    const source = Array.isArray(value) ? value[0] : value;
    const number = Number(source);
    if (!Number.isInteger(number) || number < 1)
        return fallback;
    return max ? Math.min(number, max) : number;
};
const safeQueryText = (value, maxLength = 120) => {
    const source = Array.isArray(value) ? value[0] : value;
    return typeof source === "string" ? source.trim().slice(0, maxLength) : "";
};
const configError = (config) => {
    if (!config.panelApiBaseUrl || !config.warehouseApiKey)
        return "missing";
    try {
        const url = new URL(config.panelApiBaseUrl);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
            return "invalid";
    }
    catch {
        return "invalid";
    }
    return null;
};
const labelConfigError = (config) => {
    if (!config.labelPrinterBaseUrl)
        return "missing";
    try {
        const url = new URL(config.labelPrinterBaseUrl);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
            return "invalid";
    }
    catch {
        return "invalid";
    }
    return null;
};
export function createWarehouseApp(config) {
    const app = express();
    const timeoutMs = config.timeoutMs ?? 8_000;
    const logger = config.logger ?? console;
    const cookieOptions = {
        httpOnly: true,
        sameSite: "strict",
        secure: config.cookieSecure ?? false,
        path: "/",
    };
    const allowedOrigins = new Set((config.allowedOrigins || []).flatMap((value) => {
        try {
            return [new URL(value).origin];
        }
        catch {
            return [];
        }
    }));
    const trustProxy = Number.isInteger(config.trustProxyHops) && Number(config.trustProxyHops) > 0;
    if (trustProxy) {
        app.set("trust proxy", Number(config.trustProxyHops));
    }
    app.disable("x-powered-by");
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(express.json({ limit: "2mb", strict: true }));
    app.use("/api", (_req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        next();
    });
    app.get("/health", (_req, res) => res.json({ status: "ok" }));
    const loginRateLimit = createLoginRateLimit(config.loginRateLimit);
    const fetchLabelPrinter = async (res, pathName, init = {}) => {
        if (labelConfigError(config)) {
            res.status(503).json({ success: false, error: { code: "LABEL_PRINTER_NOT_CONFIGURED", message: "Label Printer bağlantısı sunucuda yapılandırılmamış." } });
            return null;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(`${config.labelPrinterBaseUrl.replace(/\/$/, "")}${pathName}`, {
                ...init,
                redirect: "error",
                signal: controller.signal,
                headers: {
                    ...(init.headers || {}),
                    ...(config.labelPrinterApiKey ? { "x-api-key": config.labelPrinterApiKey } : {}),
                },
            });
        }
        catch (error) {
            const timedOut = error instanceof Error && error.name === "AbortError";
            logger.error(`[warehouse-bff] ${timedOut ? "LABEL_PRINTER_TIMEOUT" : "LABEL_PRINTER_UNAVAILABLE"}`);
            res.status(timedOut ? 504 : 502).json({ success: false, error: {
                    code: timedOut ? "LABEL_PRINTER_TIMEOUT" : "LABEL_PRINTER_UNAVAILABLE",
                    message: timedOut ? "Label Printer zaman aşımına uğradı." : "Label Printer bağlantısı kurulamadı.",
                } });
            return null;
        }
        finally {
            clearTimeout(timeout);
        }
    };
    const configurationFailure = (res) => {
        const invalidConfig = configError(config);
        if (!invalidConfig)
            return false;
        res.status(503).json({
            success: false,
            error: {
                code: invalidConfig === "missing" ? "BFF_NOT_CONFIGURED" : "BFF_INVALID_CONFIG",
                message: "Warehouse bağlantısı sunucuda yapılandırılmamış.",
            },
        });
        return true;
    };
    const fetchPanel = async (res, target, init) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(target, { ...init, redirect: "error", signal: controller.signal });
        }
        catch (error) {
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
        }
        finally {
            clearTimeout(timeout);
        }
    };
    const readJson = async (upstream, res) => {
        const rawBody = await upstream.text();
        try {
            return JSON.parse(rawBody);
        }
        catch {
            logger.error("[warehouse-bff] UPSTREAM_INVALID_RESPONSE");
            res.status(502).json({
                success: false,
                error: { code: "UPSTREAM_INVALID_RESPONSE", message: "Panel API geçersiz yanıt verdi." },
            });
            return null;
        }
    };
    const safeResponse = (body, sessionToken = "") => rewritePanelPaths(redactSensitive(body, [config.warehouseApiKey || "", sessionToken]));
    const requireTrustedOrigin = (req, res) => {
        if (["GET", "HEAD", "OPTIONS"].includes(req.method))
            return true;
        const origin = req.headers.origin;
        if (!origin) {
            res.status(403).json({ success: false, error: { code: "CSRF_FORBIDDEN", message: "Unsafe istek için Origin header zorunludur." } });
            return false;
        }
        const forwardedHost = trustProxy ? String(req.headers["x-forwarded-host"] || "").split(",", 1)[0].trim() : "";
        const host = forwardedHost || req.get("host");
        let effectiveOrigin = "";
        try {
            effectiveOrigin = host ? new URL(`${req.protocol}://${host}`).origin : "";
        }
        catch { }
        if (origin !== effectiveOrigin && !allowedOrigins.has(origin)) {
            res.status(403).json({ success: false, error: { code: "CSRF_FORBIDDEN", message: "Origin izinli değil." } });
            return false;
        }
        return true;
    };
    const requireSession = (req, res, next) => {
        const token = readCookie(req, SESSION_COOKIE);
        if (!token) {
            return res.status(401).json({
                success: false,
                error: { code: "SESSION_REQUIRED", message: "Oturum açmanız gerekiyor." },
            });
        }
        if (!requireTrustedOrigin(req, res))
            return;
        res.locals.sessionToken = token;
        next();
    };
    const requireLivePanelCapability = (capability) => async (_req, res, next) => {
        if (configurationFailure(res))
            return;
        const token = String(res.locals.sessionToken || "");
        if (!token)
            return res.status(401).json({ success: false, error: { code: "SESSION_REQUIRED", message: "Oturum açmanız gerekiyor." } });
        const target = new URL(`${config.panelApiBaseUrl.replace(/\/$/, "")}/api/auth/service/me`);
        const upstream = await fetchPanel(res, target, {
            method: "GET",
            headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "x-api-key": config.warehouseApiKey },
        });
        if (!upstream)
            return;
        const body = await readJson(upstream, res);
        if (body === null)
            return;
        if (!upstream.ok) {
            res.clearCookie(SESSION_COOKIE, cookieOptions);
            if (upstream.status >= 500)
                return res.status(502).json({ success: false, error: { code: "PANEL_AUTH_UNAVAILABLE", message: "Panel kimlik doğrulaması kullanılamıyor." } });
            return res.status(401).json({ success: false, error: { code: "SESSION_INVALID", message: "Oturum geçersiz veya iptal edilmiş." } });
        }
        const user = body.user;
        const permissions = user?.permissions && typeof user.permissions === "object" && !Array.isArray(user.permissions)
            ? user.permissions
            : {};
        const allowed = user?.role === "admin" || permissions[capability] === true;
        if (!allowed)
            return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: `Bu işlem için ${capability} capability gerekli.` } });
        res.locals.panelUser = user;
        return next();
    };
    app.post("/api/auth/login", loginRateLimit, async (req, res) => {
        if (configurationFailure(res))
            return;
        const username = typeof req.body?.username === "string" ? req.body.username.trim().slice(0, 254) : "";
        const password = typeof req.body?.password === "string" ? req.body.password.slice(0, 1024) : "";
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: { code: "VALIDATION_ERROR", message: "Kullanıcı adı/e-posta ve şifre zorunludur." },
            });
        }
        const target = new URL(`${config.panelApiBaseUrl.replace(/\/$/, "")}/api/auth/service/login`);
        const upstream = await fetchPanel(res, target, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json", "x-api-key": config.warehouseApiKey },
            body: JSON.stringify({ username, password }),
        });
        if (!upstream)
            return;
        const body = await readJson(upstream, res);
        if (body === null)
            return;
        if (!upstream.ok)
            return res.status(upstream.status).json(safeResponse(body));
        const auth = body;
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
        if (configurationFailure(res))
            return;
        const token = String(res.locals.sessionToken);
        const target = new URL(`${config.panelApiBaseUrl.replace(/\/$/, "")}/api/auth/service/me`);
        const upstream = await fetchPanel(res, target, {
            method: "GET",
            headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "x-api-key": config.warehouseApiKey },
        });
        if (!upstream)
            return;
        const body = await readJson(upstream, res);
        if (body === null)
            return;
        if (!upstream.ok) {
            res.clearCookie(SESSION_COOKIE, cookieOptions);
            return res.status(upstream.status).json(safeResponse(body, token));
        }
        return res.json({ success: true, data: safeResponse(body.user, token) });
    });
    app.post("/api/auth/logout", requireSession, async (_req, res) => {
        if (configurationFailure(res))
            return;
        const token = String(res.locals.sessionToken);
        const target = new URL(`${config.panelApiBaseUrl.replace(/\/$/, "")}/api/auth/service/logout`);
        const upstream = await fetchPanel(res, target, {
            method: "POST",
            headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "x-api-key": config.warehouseApiKey },
        });
        if (!upstream)
            return;
        const body = await readJson(upstream, res);
        if (body === null)
            return;
        if (!upstream.ok && upstream.status !== 401)
            return res.status(upstream.status).json(safeResponse(body, token));
        res.clearCookie(SESSION_COOKIE, cookieOptions);
        return res.json({ success: true, data: null });
    });
    app.get("/api/labels/templates", requireSession, requireLivePanelCapability("warehouse:print_labels"), async (req, res) => {
        const purpose = safeQueryText(req.query.purpose, 40);
        const query = purpose ? `?purpose=${encodeURIComponent(purpose)}` : "";
        const upstream = await fetchLabelPrinter(res, `/api/v1/templates${query}`, { headers: { Accept: "application/json" } });
        if (!upstream)
            return;
        const raw = await upstream.text();
        if (!upstream.ok)
            return res.status(upstream.status).type("application/json").send(raw);
        try {
            const parsed = JSON.parse(raw);
            return res.json({ success: true, data: Array.isArray(parsed.templates) ? parsed.templates : [] });
        }
        catch {
            return res.status(502).json({ success: false, error: { code: "LABEL_PRINTER_INVALID_RESPONSE", message: "Label Printer geçersiz yanıt verdi." } });
        }
    });
    app.post("/api/labels/preview", requireSession, requireLivePanelCapability("warehouse:print_labels"), async (req, res) => {
        const purpose = safeQueryText(req.body?.purpose, 40);
        const data = req.body?.data && typeof req.body.data === "object" && !Array.isArray(req.body.data) ? req.body.data : {};
        const upstream = await fetchLabelPrinter(res, "/api/v1/render", {
            method: "POST",
            headers: { Accept: "application/pdf", "Content-Type": "application/json" },
            body: JSON.stringify({ purpose, data }),
        });
        if (!upstream)
            return;
        const contentType = upstream.headers.get("content-type") || "application/octet-stream";
        for (const header of ["x-label-template-id", "x-label-template-purpose"]) {
            const value = upstream.headers.get(header);
            if (value)
                res.setHeader(header, value);
        }
        return res.status(upstream.status).type(contentType).send(Buffer.from(await upstream.arrayBuffer()));
    });
    const defaultTemplateSnapshot = async (res, purpose) => {
        const upstream = await fetchLabelPrinter(res, `/api/v1/templates/default?purpose=${encodeURIComponent(purpose)}`, { headers: { Accept: "application/json" } });
        if (!upstream)
            return null;
        const raw = await upstream.text();
        if (!upstream.ok) {
            res.status(upstream.status).type("application/json").send(raw);
            return null;
        }
        try {
            return JSON.parse(raw);
        }
        catch {
            res.status(502).json({ success: false, error: { code: "LABEL_PRINTER_INVALID_RESPONSE", message: "Label Printer geçersiz şablon snapshot'ı döndürdü." } });
            return null;
        }
    };
    const forward = async (req, res, method, upstreamPath, query, body, binary = false) => {
        if (configurationFailure(res))
            return;
        const sessionToken = String(res.locals.sessionToken);
        const baseUrl = config.panelApiBaseUrl.replace(/\/$/, "");
        const target = new URL(`${baseUrl}/api/warehouse/v1${upstreamPath}`);
        if (query)
            target.search = query.toString();
        const upstream = await fetchPanel(res, target, {
            method,
            headers: {
                Accept: binary ? "image/*" : "application/json",
                ...(body ? { "Content-Type": "application/json" } : {}),
                "x-api-key": config.warehouseApiKey,
                Authorization: `Bearer ${sessionToken}`,
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (!upstream)
            return;
        if (binary && upstream.ok) {
            const contentType = upstream.headers.get("content-type");
            if (contentType)
                res.setHeader("Content-Type", contentType);
            return res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()));
        }
        if (upstream.status === 204)
            return res.status(204).end();
        const responseBody = await readJson(upstream, res);
        if (responseBody === null)
            return;
        return res.status(upstream.status).json(safeResponse(responseBody, sessionToken));
    };
    app.get("/api/orders", requireSession, (req, res) => {
        const query = new URLSearchParams({
            page: String(safePositiveInteger(req.query.page, 1)),
            limit: String(safePositiveInteger(req.query.limit, 100, 100)),
        });
        return forward(req, res, "GET", "/orders", query);
    });
    app.get("/api/catalog/v1/products", requireSession, (req, res) => {
        const query = new URLSearchParams();
        const catalogType = safeQueryText(req.query.catalog_type, 20);
        if (catalogType)
            query.set("catalog_type", catalogType);
        return forward(req, res, "GET", "/catalog/products", query);
    });
    app.get("/api/catalog/v1/uoms", requireSession, (req, res) => forward(req, res, "GET", "/catalog/uoms"));
    app.get("/api/inventory/v1/products/:id/availability", requireSession, (req, res) => forward(req, res, "GET", `/inventory/products/${encodeURIComponent(String(req.params.id))}/availability`));
    app.get("/api/inventory/v1/reservations/:id/fulfillment", requireSession, (req, res) => forward(req, res, "GET", `/inventory/reservations/${encodeURIComponent(String(req.params.id))}/fulfillment`));
    app.post("/api/inventory/v1/receipts", requireSession, (req, res) => forward(req, res, "POST", "/inventory/receipts", undefined, {
        receiptId: safeQueryText(req.body?.receiptId, 200),
        costSnapshotId: safeQueryText(req.body?.costSnapshotId, 200),
        receivedAt: safeQueryText(req.body?.receivedAt, 50),
        location: {
            id: safeQueryText(req.body?.location?.id, 200),
            kind: safeQueryText(req.body?.location?.kind, 20),
        },
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    for (const transition of ["pick", "pack"]) {
        app.post(`/api/inventory/v1/reservations/:id/${transition}`, requireSession, (req, res) => forward(req, res, "POST", `/inventory/reservations/${encodeURIComponent(String(req.params.id))}/${transition}`, undefined, {
            at: safeQueryText(req.body?.at, 50) || null,
            idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
        }));
    }
    app.post("/api/inventory/v1/reservations/:id/dispatch", requireSession, (req, res) => res.status(409).json({ success: false, error: { code: "PHYSICAL_HANDOFF_REQUIRED",
            message: "Stok çıkışı yalnız doğrulanmış fiziksel taşıyıcı teslimiyle yapılabilir." } }));
    app.get("/api/shipping/v1/provider-contracts/geliver", requireSession, (req, res) => forward(req, res, "GET", "/shipping/provider-contracts/geliver"));
    app.get("/api/shipping/v1/shipments/:id", requireSession, (req, res) => forward(req, res, "GET", `/shipping/shipments/${encodeURIComponent(String(req.params.id))}`));
    app.get("/api/shipping/v1/reservations/:id/shipment", requireSession, (req, res) => forward(req, res, "GET", `/shipping/reservations/${encodeURIComponent(String(req.params.id))}/shipment`));
    app.post("/api/shipping/v1/shipments/:id/packages", requireSession, (req, res) => {
        const packages = Array.isArray(req.body?.packages) ? req.body.packages.slice(0, 50).map((item) => ({
            packageNumber: Number(item?.packageNumber),
            recipePackageNumber: item?.recipePackageNumber == null ? null : Number(item.recipePackageNumber),
            measured: item?.measured ? {
                lengthMm: Number(item.measured.lengthMm), widthMm: Number(item.measured.widthMm),
                heightMm: Number(item.measured.heightMm), weightGrams: Number(item.measured.weightGrams),
            } : null,
            contents: Array.isArray(item?.contents) ? item.contents.slice(0, 200).map((content) => ({
                productId: safeQueryText(content?.productId, 200), quantityBaseInt: Number(content?.quantityBaseInt),
            })) : [],
        })) : [];
        return forward(req, res, "POST", `/shipping/shipments/${encodeURIComponent(String(req.params.id))}/packages`, undefined, {
            packages, idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
        });
    });
    app.post("/api/shipping/v1/shipments/:id/carrier-selection", requireSession, (req, res) => {
        if (req.body?.cashOnDelivery === true)
            return res.status(409).json({ success: false, error: { code: "COD_FORBIDDEN", message: "Kapıda ödeme desteklenmiyor." } });
        return forward(req, res, "POST", `/shipping/shipments/${encodeURIComponent(String(req.params.id))}/carrier-selection`, undefined, {
            provider: "GELIVER",
            carrierCode: safeQueryText(req.body?.carrierCode, 100),
            serviceCode: safeQueryText(req.body?.serviceCode, 100),
            cashOnDelivery: false,
            quote: {
                quoteId: safeQueryText(req.body?.quote?.quoteId, 200),
                amountMinor: Number(req.body?.quote?.amountMinor),
                currency: safeQueryText(req.body?.quote?.currency, 3).toUpperCase(),
                provenance: {
                    source: safeQueryText(req.body?.quote?.provenance?.source, 100),
                    reference: safeQueryText(req.body?.quote?.provenance?.reference, 500),
                },
            },
            idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
        });
    });
    app.post("/api/shipping/v1/shipments/:id/booking", requireSession, (req, res) => forward(req, res, "POST", `/shipping/shipments/${encodeURIComponent(String(req.params.id))}/booking`, undefined, {
        requestedAt: safeQueryText(req.body?.requestedAt, 50) || null,
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    app.post("/api/shipping/v1/shipments/:id/geliver/offers", requireSession, (req, res) => forward(req, res, "POST", `/shipping/shipments/${encodeURIComponent(String(req.params.id))}/geliver/offers`, undefined, {
        recipient: {
            name: safeQueryText(req.body?.recipient?.name, 200), email: safeQueryText(req.body?.recipient?.email, 320),
            phone: safeQueryText(req.body?.recipient?.phone, 50) || null,
            address1: safeQueryText(req.body?.recipient?.address1, 500), address2: safeQueryText(req.body?.recipient?.address2, 500) || null,
            countryCode: safeQueryText(req.body?.recipient?.countryCode, 3).toUpperCase(),
            cityName: safeQueryText(req.body?.recipient?.cityName, 100), cityCode: safeQueryText(req.body?.recipient?.cityCode, 30),
            districtName: safeQueryText(req.body?.recipient?.districtName, 100), districtID: safeQueryText(req.body?.recipient?.districtID, 50) || null,
            zip: safeQueryText(req.body?.recipient?.zip, 30) || null,
        },
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    app.post("/api/shipping/v1/shipments/:id/geliver/refresh", requireSession, (req, res) => forward(req, res, "POST", `/shipping/shipments/${encodeURIComponent(String(req.params.id))}/geliver/refresh`, undefined, {
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    app.post("/api/shipping/v1/shipments/:id/geliver/offers/:offerId/accept", requireSession, (req, res) => forward(req, res, "POST", `/shipping/shipments/${encodeURIComponent(String(req.params.id))}/geliver/offers/${encodeURIComponent(String(req.params.offerId))}/accept`, undefined, {
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    app.post("/api/shipping/v1/shipments/:id/packages/:packageId/print", requireSession, (req, res) => forward(req, res, "POST", `/shipping/shipments/${encodeURIComponent(String(req.params.id))}/packages/${encodeURIComponent(String(req.params.packageId))}/print`, undefined, {
        printer_name: safeQueryText(req.body?.printer_name, 160) || null,
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    app.post("/api/shipping/v1/shipments/:id/cancel", requireSession, (req, res) => forward(req, res, "POST", `/shipping/shipments/${encodeURIComponent(String(req.params.id))}/cancel`, undefined, {
        reason: safeQueryText(req.body?.reason, 500),
        cancelledAt: safeQueryText(req.body?.cancelledAt, 50) || null,
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    app.post("/api/shipping/v1/shipments/:id/handoff", requireSession, (req, res) => forward(req, res, "POST", `/shipping/shipments/${encodeURIComponent(String(req.params.id))}/handoff`, undefined, {
        handedOffAt: safeQueryText(req.body?.handedOffAt, 50),
        handoffEvidence: {
            kind: safeQueryText(req.body?.handoffEvidence?.kind, 100),
            reference: safeQueryText(req.body?.handoffEvidence?.reference, 500),
        },
        actualCharge: req.body?.actualCharge ? {
            amountMinor: Number(req.body.actualCharge.amountMinor),
            currency: safeQueryText(req.body.actualCharge.currency, 3).toUpperCase(),
            provenance: {
                source: safeQueryText(req.body.actualCharge.provenance?.source, 100),
                reference: safeQueryText(req.body.actualCharge.provenance?.reference, 500),
            },
        } : undefined,
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    app.post("/api/inventory/v1/reservations/:id/discrepancies", requireSession, (req, res) => forward(req, res, "POST", `/inventory/reservations/${encodeURIComponent(String(req.params.id))}/discrepancies`, undefined, {
        lotId: safeQueryText(req.body?.lotId, 200),
        locationId: safeQueryText(req.body?.locationId, 200),
        reason: safeQueryText(req.body?.reason, 500),
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    app.get("/api/returns", requireSession, (req, res) => forward(req, res, "GET", "/returns"));
    app.get("/api/returns/:id", requireSession, (req, res) => forward(req, res, "GET", `/returns/${encodeURIComponent(String(req.params.id))}`));
    app.post("/api/returns/:id/receipts", requireSession, (req, res) => forward(req, res, "POST", `/returns/${encodeURIComponent(String(req.params.id))}/receipts`, undefined, {
        lines: Array.isArray(req.body?.lines) ? req.body.lines.slice(0, 100).map((line) => ({
            returnLineId: safeQueryText(line?.returnLineId, 200),
            quantityBaseInt: Number(line?.quantityBaseInt),
            disposition: safeQueryText(line?.disposition, 40),
            locationId: safeQueryText(line?.locationId, 200) || null,
        })) : [],
        receivedAt: safeQueryText(req.body?.receivedAt, 50) || null,
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    app.get("/api/orders/:id", requireSession, (req, res) => forward(req, res, "GET", `/orders/${encodeURIComponent(String(req.params.id))}`));
    app.get("/api/orders/:id/pick-plan", requireSession, (req, res) => forward(req, res, "GET", `/orders/${encodeURIComponent(String(req.params.id))}/pick-plan`));
    app.get("/api/scan/:code", requireSession, (req, res) => forward(req, res, "GET", `/scan/${encodeURIComponent(String(req.params.code))}`));
    app.get("/api/products/:id/image", requireSession, (req, res) => forward(req, res, "GET", `/products/${encodeURIComponent(String(req.params.id))}/image`, undefined, undefined, true));
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
            if (value)
                query.set(key, value);
        }
        return forward(req, res, "GET", "/pick-history", query);
    });
    app.get("/api/pick-history/:id", requireSession, (req, res) => forward(req, res, "GET", `/pick-history/${encodeURIComponent(String(req.params.id))}`));
    app.post("/api/orders/:id/start", requireSession, (req, res) => forward(req, res, "POST", `/orders/${encodeURIComponent(String(req.params.id))}/start`));
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
        return forward(req, res, "POST", `/orders/${encodeURIComponent(String(req.params.id))}/pick-items/${encodeURIComponent(String(req.params.productId))}/complete`, undefined, { picked_quantity: pickedQuantity });
    });
    app.post("/api/orders/:id/complete", requireSession, (req, res) => {
        const note = typeof req.body?.note === "string" ? req.body.note.trim().slice(0, 2000) : "";
        return forward(req, res, "POST", `/orders/${encodeURIComponent(String(req.params.id))}/complete`, undefined, note ? { note } : {});
    });
    const safeAdminBody = (body) => body && typeof body === "object" && !Array.isArray(body)
        ? body
        : {};
    app.get("/api/execution/topology", requireSession, (req, res) => forward(req, res, "GET", "/execution/topology"));
    app.post("/api/execution/topology", requireSession, (req, res) => forward(req, res, "POST", "/execution/topology", undefined, safeAdminBody(req.body)));
    app.get("/api/execution/settings", requireSession, (req, res) => forward(req, res, "GET", "/execution/settings"));
    app.post("/api/execution/settings", requireSession, (req, res) => forward(req, res, "POST", "/execution/settings", undefined, safeAdminBody(req.body)));
    app.post("/api/execution/receipts/excess-approvals", requireSession, (req, res) => forward(req, res, "POST", "/execution/receipts/excess-approvals", undefined, safeAdminBody(req.body)));
    app.post("/api/execution/receipts", requireSession, (req, res) => forward(req, res, "POST", "/execution/receipts", undefined, safeAdminBody(req.body)));
    app.get("/api/execution/packages/:id", requireSession, (req, res) => forward(req, res, "GET", `/execution/packages/${encodeURIComponent(String(req.params.id))}`));
    app.post("/api/execution/packages/:id/identity", requireSession, (req, res) => forward(req, res, "POST", `/execution/packages/${encodeURIComponent(String(req.params.id))}/identity`, undefined, safeAdminBody(req.body)));
    app.get("/api/execution/packages/:id/suggestion", requireSession, (req, res) => forward(req, res, "GET", `/execution/packages/${encodeURIComponent(String(req.params.id))}/suggestion`));
    app.post("/api/execution/packages/:id/place", requireSession, (req, res) => forward(req, res, "POST", `/execution/packages/${encodeURIComponent(String(req.params.id))}/place`, undefined, safeAdminBody(req.body)));
    app.post("/api/execution/packages/:id/move", requireSession, (req, res) => forward(req, res, "POST", `/execution/packages/${encodeURIComponent(String(req.params.id))}/move`, undefined, safeAdminBody(req.body)));
    app.post("/api/execution/replenishments/prepare", requireSession, (req, res) => forward(req, res, "POST", "/execution/replenishments/prepare", undefined, safeAdminBody(req.body)));
    app.get("/api/execution/replenishments", requireSession, (req, res) => forward(req, res, "GET", "/execution/replenishments"));
    app.post("/api/execution/replenishments/:id/complete", requireSession, (req, res) => forward(req, res, "POST", `/execution/replenishments/${encodeURIComponent(String(req.params.id))}/complete`, undefined, safeAdminBody(req.body)));
    app.post("/api/execution/discrepancies", requireSession, (req, res) => forward(req, res, "POST", "/execution/discrepancies", undefined, safeAdminBody(req.body)));
    app.post("/api/execution/counts", requireSession, (req, res) => forward(req, res, "POST", "/execution/counts", undefined, safeAdminBody(req.body)));
    app.post("/api/execution/counts/:id/approve", requireSession, (req, res) => forward(req, res, "POST", `/execution/counts/${encodeURIComponent(String(req.params.id))}/approve`, undefined, safeAdminBody(req.body)));
    app.get("/api/execution/products/:id/reconciliation", requireSession, (req, res) => forward(req, res, "GET", `/execution/products/${encodeURIComponent(String(req.params.id))}/reconciliation`));
    app.get("/api/admin/batches", requireSession, (req, res) => forward(req, res, "GET", "/admin/batches"));
    app.post("/api/admin/batches", requireSession, (req, res) => forward(req, res, "POST", "/admin/batches", undefined, safeAdminBody(req.body)));
    app.get("/api/admin/batches/:id", requireSession, (req, res) => forward(req, res, "GET", `/admin/batches/${encodeURIComponent(String(req.params.id))}`));
    app.post("/api/admin/batches/:id/import/preview", requireSession, (req, res) => forward(req, res, "POST", `/admin/batches/${encodeURIComponent(String(req.params.id))}/import/preview`, undefined, {
        rows: Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 5000) : [],
    }));
    app.post("/api/admin/batches/:id/import/apply", requireSession, (req, res) => forward(req, res, "POST", `/admin/batches/${encodeURIComponent(String(req.params.id))}/import/apply`, undefined, {
        rows: Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 5000) : [],
        preview_hash: safeQueryText(req.body?.preview_hash, 128),
    }));
    app.get("/api/admin/receiving/lots/:lot", requireSession, (req, res) => forward(req, res, "GET", `/admin/receiving/lots/${encodeURIComponent(String(req.params.lot))}`));
    app.get("/api/admin/receiving/sessions", requireSession, (req, res) => forward(req, res, "GET", "/admin/receiving/sessions"));
    app.get("/api/admin/receiving/my-active-package", requireSession, (req, res) => forward(req, res, "GET", "/admin/receiving/my-active-package"));
    app.post("/api/admin/receiving/sessions", requireSession, (req, res) => forward(req, res, "POST", "/admin/receiving/sessions", undefined, {
        lot_number: safeQueryText(req.body?.lot_number, 150),
        supplier_code: safeQueryText(req.body?.supplier_code, 100),
        device_id: safeQueryText(req.body?.device_id, 150),
    }));
    app.get("/api/admin/receiving/sessions/:id", requireSession, (req, res) => forward(req, res, "GET", `/admin/receiving/sessions/${encodeURIComponent(String(req.params.id))}`));
    app.get("/api/admin/receiving/sessions/:id/my-active-package", requireSession, (req, res) => forward(req, res, "GET", `/admin/receiving/sessions/${encodeURIComponent(String(req.params.id))}/my-active-package`));
    app.get("/api/admin/receiving/sessions/:id/my-packages", requireSession, (req, res) => forward(req, res, "GET", `/admin/receiving/sessions/${encodeURIComponent(String(req.params.id))}/my-packages`));
    app.post("/api/admin/receiving/sessions/:id/state", requireSession, (req, res) => forward(req, res, "POST", `/admin/receiving/sessions/${encodeURIComponent(String(req.params.id))}/state`, undefined, {
        state: safeQueryText(req.body?.state, 20),
        device_id: safeQueryText(req.body?.device_id, 150),
    }));
    app.post("/api/admin/receiving/sessions/:id/complete", requireSession, (req, res) => forward(req, res, "POST", `/admin/receiving/sessions/${encodeURIComponent(String(req.params.id))}/complete`, undefined, {
        force_reason: safeQueryText(req.body?.force_reason, 1000),
        device_id: safeQueryText(req.body?.device_id, 150),
    }));
    app.post("/api/admin/packages/claim-next", requireSession, (req, res) => {
        const body = { supplier_code: safeQueryText(req.body?.supplier_code, 100) };
        const sessionId = safeQueryText(req.body?.session_id, 100);
        const deviceId = safeQueryText(req.body?.device_id, 150);
        if (sessionId)
            body.session_id = sessionId;
        if (deviceId)
            body.device_id = deviceId;
        return forward(req, res, "POST", "/admin/packages/claim-next", undefined, body);
    });
    app.get("/api/admin/packages/by-code/:code", requireSession, (req, res) => forward(req, res, "GET", `/admin/packages/by-code/${encodeURIComponent(String(req.params.code))}`));
    app.get("/api/admin/packages/:id/print-preview", requireSession, (req, res) => forward(req, res, "GET", `/admin/packages/${encodeURIComponent(String(req.params.id))}/print-preview`));
    app.post("/api/admin/packages/:id/print", requireSession, async (req, res) => {
        const templateSnapshot = await defaultTemplateSnapshot(res, "goods_receipt");
        if (!templateSnapshot)
            return;
        return forward(req, res, "POST", `/admin/packages/${encodeURIComponent(String(req.params.id))}/print`, undefined, {
            claim_token: safeQueryText(req.body?.claim_token, 200) || null,
            idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
            device_id: safeQueryText(req.body?.device_id, 150),
            printer_name: safeQueryText(req.body?.printer_name, 160) || null,
            template_snapshot: templateSnapshot,
        });
    });
    app.post("/api/admin/packages/:id/release-receiving", requireSession, (req, res) => forward(req, res, "POST", `/admin/packages/${encodeURIComponent(String(req.params.id))}/release-receiving`, undefined, {
        device_id: safeQueryText(req.body?.device_id, 150),
    }));
    app.get("/api/admin/print-jobs", requireSession, (req, res) => {
        const query = new URLSearchParams({ limit: String(safePositiveInteger(req.query.limit, 100, 500)) });
        return forward(req, res, "GET", "/admin/print-jobs", query);
    });
    app.post("/api/admin/print-jobs/:id/reprint", requireSession, (req, res) => forward(req, res, "POST", `/admin/print-jobs/${encodeURIComponent(String(req.params.id))}/reprint`, undefined, {
        reason: safeQueryText(req.body?.reason, 40),
        explanation: safeQueryText(req.body?.explanation, 1000) || null,
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    app.post("/api/admin/print-jobs/:id/confirm", requireSession, (req, res) => forward(req, res, "POST", `/admin/print-jobs/${encodeURIComponent(String(req.params.id))}/confirm`, undefined, {
        idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
    }));
    app.get("/api/admin/locations", requireSession, (req, res) => forward(req, res, "GET", "/admin/locations"));
    app.get("/api/admin/locations/:id/print-preview", requireSession, (req, res) => forward(req, res, "GET", `/admin/locations/${encodeURIComponent(String(req.params.id))}/print-preview`));
    app.post("/api/admin/locations/:id/print", requireSession, async (req, res) => {
        const templateSnapshot = await defaultTemplateSnapshot(res, "location");
        if (!templateSnapshot)
            return;
        return forward(req, res, "POST", `/admin/locations/${encodeURIComponent(String(req.params.id))}/print`, undefined, {
            idempotency_key: safeQueryText(req.body?.idempotency_key, 200),
            device_id: safeQueryText(req.body?.device_id, 150),
            printer_name: safeQueryText(req.body?.printer_name, 160) || null,
            template_snapshot: templateSnapshot,
        });
    });
    app.get("/api/admin/warehouse-map", requireSession, (req, res) => forward(req, res, "GET", "/admin/warehouse-map"));
    app.get("/api/admin/layouts/placement", requireSession, (req, res) => forward(req, res, "GET", "/admin/layouts/placement"));
    app.post("/api/admin/layouts/import-legacy", requireSession, (req, res) => forward(req, res, "POST", "/admin/layouts/import-legacy", undefined, safeAdminBody(req.body)));
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
        for (const key of ["query", "status", "location", "lot", "date_from", "date_to"]) {
            const value = safeQueryText(req.query[key], 120);
            if (value)
                query.set(key, value);
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
        if (packageId)
            query.set("package_id", packageId);
        return forward(req, res, "GET", "/admin/locations/suggestion", query);
    });
    app.get("/api/admin/packages/:id/receiving-location", requireSession, (req, res) => forward(req, res, "GET", `/admin/packages/${encodeURIComponent(String(req.params.id))}/receiving-location`));
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
            if (req.method !== "GET")
                return next();
            res.setHeader("Cache-Control", "no-cache");
            return res.sendFile(path.join(config.staticDir, "index.html"));
        });
    }
    return app;
}
