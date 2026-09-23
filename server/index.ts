import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWarehouseApp } from "./app.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3006;

const app = createWarehouseApp({
  panelApiBaseUrl: process.env.PANEL_API_BASE_URL,
  warehouseApiKey: process.env.WAREHOUSE_API_KEY,
  labelPrinterBaseUrl: process.env.LABEL_PRINTER_URL || process.env.LABEL_RENDERER_URL,
  labelPrinterApiKey: process.env.LABEL_PRINTER_API_KEY || process.env.LABEL_RENDERER_API_KEY,
  cookieSecure: process.env.COOKIE_SECURE === "true",
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 0),
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean),
  staticDir: path.resolve(currentDir, "../dist"),
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[warehouse-bff] listening on port ${port}`);
});
