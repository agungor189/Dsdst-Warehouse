import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWarehouseApp } from "./app.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3006;

const app = createWarehouseApp({
  panelApiBaseUrl: process.env.PANEL_API_BASE_URL,
  warehouseApiKey: process.env.WAREHOUSE_API_KEY,
  staticDir: path.resolve(currentDir, "../dist"),
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[warehouse-bff] listening on port ${port}`);
});
