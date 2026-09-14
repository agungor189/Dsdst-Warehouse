import express from "express";
import helmet from "helmet";
import path from "node:path";
const sensitiveFieldNames = new Set([
    "x-api-key",
    "x_api_key",
    "api-key",
    "api_key",
    "warehouse_api_key",
]);
const redactSensitive = (value, secret) => {
    if (typeof value === "string") {
        return secret && value.includes(secret) ? value.split(secret).join("[REDACTED]") : value;
    }
    if (Array.isArray(value))
        return value.map((item) => redactSensitive(item, secret));
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [
            key,
            sensitiveFieldNames.has(key.toLowerCase()) ? "[REDACTED]" : redactSensitive(item, secret),
        ]));
    }
    return value;
};
const safePositiveInteger = (value, fallback, max) => {
    const source = Array.isArray(value) ? value[0] : value;
    const number = Number(source);
    if (!Number.isInteger(number) || number < 1)
        return fallback;
    return max ? Math.min(number, max) : number;
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
export function createWarehouseApp(config) {
    const app = express();
    const timeoutMs = config.timeoutMs ?? 8_000;
    const logger = config.logger ?? console;
    app.disable("x-powered-by");
    app.use(helmet({ contentSecurityPolicy: false }));
    app.use(express.json({ limit: "16kb", strict: true }));
    app.use("/api", (_req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        next();
    });
    app.get("/health", (_req, res) => res.json({ status: "ok" }));
    const forward = async (req, res, method, upstreamPath, query) => {
        const invalidConfig = configError(config);
        if (invalidConfig) {
            return res.status(503).json({
                success: false,
                error: {
                    code: invalidConfig === "missing" ? "BFF_NOT_CONFIGURED" : "BFF_INVALID_CONFIG",
                    message: "Warehouse bağlantısı sunucuda yapılandırılmamış.",
                },
            });
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const baseUrl = config.panelApiBaseUrl.replace(/\/$/, "");
            const target = new URL(`${baseUrl}/api/warehouse/v1${upstreamPath}`);
            if (query)
                target.search = query.toString();
            const upstream = await fetch(target, {
                method,
                headers: {
                    Accept: "application/json",
                    "x-api-key": config.warehouseApiKey,
                },
                redirect: "error",
                signal: controller.signal,
            });
            if (upstream.status === 204)
                return res.status(204).end();
            const rawBody = await upstream.text();
            let body;
            try {
                body = JSON.parse(rawBody);
            }
            catch {
                logger.error("[warehouse-bff] UPSTREAM_INVALID_RESPONSE");
                return res.status(502).json({
                    success: false,
                    error: { code: "UPSTREAM_INVALID_RESPONSE", message: "Panel API geçersiz yanıt verdi." },
                });
            }
            return res.status(upstream.status).json(redactSensitive(body, config.warehouseApiKey));
        }
        catch (error) {
            const timedOut = error instanceof Error && error.name === "AbortError";
            logger.error(`[warehouse-bff] ${timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE"}`);
            return res.status(timedOut ? 504 : 502).json({
                success: false,
                error: {
                    code: timedOut ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
                    message: timedOut
                        ? "Panel API zaman aşımına uğradı."
                        : "Panel bağlantısı yok. Ağ bağlantısını kontrol edin.",
                },
            });
        }
        finally {
            clearTimeout(timeout);
        }
    };
    app.get("/api/orders", (req, res) => {
        const query = new URLSearchParams({
            page: String(safePositiveInteger(req.query.page, 1)),
            limit: String(safePositiveInteger(req.query.limit, 25, 100)),
        });
        return forward(req, res, "GET", "/orders", query);
    });
    app.get("/api/orders/:id", (req, res) => forward(req, res, "GET", `/orders/${encodeURIComponent(String(req.params.id))}`));
    app.get("/api/orders/:id/pick-plan", (req, res) => forward(req, res, "GET", `/orders/${encodeURIComponent(String(req.params.id))}/pick-plan`));
    app.get("/api/scan/:code", (req, res) => forward(req, res, "GET", `/scan/${encodeURIComponent(String(req.params.code))}`));
    app.post("/api/orders/:id/start", (req, res) => forward(req, res, "POST", `/orders/${encodeURIComponent(String(req.params.id))}/start`));
    app.post("/api/orders/:id/complete", (req, res) => forward(req, res, "POST", `/orders/${encodeURIComponent(String(req.params.id))}/complete`));
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
