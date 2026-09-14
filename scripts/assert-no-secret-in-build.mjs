import fs from "node:fs";
import path from "node:path";

const buildDir = path.resolve("dist");
const forbidden = [
  "VITE_WAREHOUSE_API_KEY",
  "WAREHOUSE_API_KEY",
  process.env.WAREHOUSE_API_KEY,
].filter((value) => typeof value === "string" && value.length > 0);

const files = [];
const collect = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(target);
    else files.push(target);
  }
};

collect(buildDir);
for (const file of files) {
  const content = fs.readFileSync(file);
  for (const value of forbidden) {
    if (content.includes(Buffer.from(value))) {
      throw new Error(`Frontend build güvenlik kontrolü başarısız: ${path.relative(buildDir, file)}`);
    }
  }
}

console.log("Frontend build secret scan: temiz");
