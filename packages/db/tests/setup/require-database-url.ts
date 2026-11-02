/**
 * Side-effect import for `pnpm test`: fail fast when DATABASE_URL is unset.
 * Use `pnpm test:unit` for local runs without a database.
 */
const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error(
    "DATABASE_URL is required for `pnpm test`. Use `pnpm test:unit` to run without a database.",
  );
  process.exit(1);
}
