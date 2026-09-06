import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";
import { loadEnvFile } from "@dang/config";

loadEnvFile([
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), "../.env"),
]);

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: databaseUrl ? { url: databaseUrl } : { url: "postgresql://unused" },
  strict: true,
  verbose: true,
});
