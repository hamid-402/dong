import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: databaseUrl ? { url: databaseUrl } : { url: "postgresql://unused" },
  strict: true,
  verbose: true,
});
