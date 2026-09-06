import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

/** Load monorepo root .env into process.env (Next cwd is apps/web). */
function loadRootEnv(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../.env"),
  ];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

loadRootEnv();

/**
 * Next.js 15+ blocks cross-origin access to the dev server unless listed.
 * Colleagues opening http://<LAN-IP>:3005 need the host here or assets/HMR break.
 */
function lanDevOrigins(): string[] {
  const fromEnv = (process.env.WEB_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((origin) => {
      try {
        const u = new URL(origin);
        return [u.host, u.hostname, origin];
      } catch {
        return [origin];
      }
    });
  return [...new Set(fromEnv)];
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@dang/ui"],
  allowedDevOrigins: lanDevOrigins(),
  output: "standalone",
  // API proxy: apps/web/src/app/api/v1/[...path]/route.ts
};

export default nextConfig;
