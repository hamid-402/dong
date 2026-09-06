import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(resolve(root, ".env"), "utf8");
const match = env.match(/^DATABASE_URL=(.+)$/m);
if (!match) {
  console.error("DATABASE_URL missing in .env");
  process.exit(1);
}
process.env.DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "");
const result = spawnSync("pnpm", ["--filter", "@dang/db", "db:migrate"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
  shell: true,
});
process.exit(result.status ?? 1);
