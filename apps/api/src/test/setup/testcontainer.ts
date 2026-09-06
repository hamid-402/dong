/**
 * Optional Testcontainers Postgres bootstrap for API integration tests.
 * Skips when Docker is unavailable; falls back to DATABASE_URL when set.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";

const execFileAsync = promisify(execFile);

export type TestDbHandle = {
  connectionUri: string;
  stop: () => Promise<void>;
};

export async function startTestDb(): Promise<TestDbHandle | null> {
  if (process.env.DATABASE_URL?.trim()) {
    return {
      connectionUri: process.env.DATABASE_URL.trim(),
      stop: async () => undefined,
    };
  }

  try {
    const { PostgreSqlContainer } = await import("@testcontainers/postgresql");
    const container = await new PostgreSqlContainer("postgres:17-alpine")
      .withDatabase("dang_test")
      .withUsername("dang")
      .withPassword("dang")
      .start();
    const connectionUri = container.getConnectionUri();
    process.env.DATABASE_URL = connectionUri;
    await runMigrations(connectionUri);
    return {
      connectionUri,
      stop: async () => {
        await container.stop();
      },
    };
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[testcontainer] skipped: ${detail}`);
    return null;
  }
}

async function runMigrations(databaseUrl: string): Promise<void> {
  const dbPkg = resolve(process.cwd(), "../../packages/db");
  await execFileAsync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["exec", "drizzle-kit", "migrate"],
    {
      cwd: dbPkg,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      windowsHide: true,
    },
  );
}
