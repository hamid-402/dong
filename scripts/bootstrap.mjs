#!/usr/bin/env node
/**
 * Local bootstrap: start compose deps + run migrations.
 * Does NOT auto-seed demo data (seed only via labeled UI / POST /demo/seed when allowed).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...opts,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("→ docker compose up -d (postgres, valkey, minio)");
run("docker", [
  "compose",
  "-f",
  "infra/compose.local.yml",
  "up",
  "-d",
  "postgres",
  "valkey",
  "minio",
]);

console.log("→ pnpm db:migrate");
run("pnpm", ["db:migrate"]);

console.log("");
console.log("ready");
console.log(
  "No demo seed ran. Start API/web with pnpm dev:api / pnpm dev:web; seed only via labeled «دمو» or POST /api/v1/demo/seed when ALLOW_DEV_AUTH is on.",
);
