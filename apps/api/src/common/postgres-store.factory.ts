export type PersistenceStoreLogger = {
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
};

/** True when Postgres is configured or explicitly required. */
export function requiresPostgres(
  databaseUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(databaseUrl?.trim()) || env.DANG_REQUIRE_POSTGRES === "1";
}

/**
 * Memory only when DATABASE_URL is unset (and Postgres is not required).
 * When DATABASE_URL is set or DANG_REQUIRE_POSTGRES=1, never fall back to memory.
 */
export function createPersistenceStore<T>(options: {
  name: string;
  databaseUrl: string | undefined;
  logger: PersistenceStoreLogger;
  createPostgres: (databaseUrl: string) => T;
  createMemory: () => T;
  env?: NodeJS.ProcessEnv;
}): T {
  const env = options.env ?? process.env;
  const url = options.databaseUrl?.trim();

  if (!url) {
    if (env.DANG_REQUIRE_POSTGRES === "1") {
      throw new Error(
        `DANG_REQUIRE_POSTGRES=1 but DATABASE_URL unset; refusing memory ${options.name}`,
      );
    }
    options.logger.warn(`DATABASE_URL unset; using in-memory ${options.name}`);
    return options.createMemory();
  }

  try {
    options.logger.info(`Using PostgreSQL ${options.name}`);
    return options.createPostgres(url);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    options.logger.error(
      `Failed to initialize PostgreSQL ${options.name}; refusing memory fallback`,
      { detail },
    );
    if (error instanceof Error) throw error;
    throw new Error(`Failed to initialize PostgreSQL ${options.name}: ${detail}`);
  }
}
