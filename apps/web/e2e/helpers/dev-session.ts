import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

/** Keep aligned with `@dang/contracts` session-cookies (inline to avoid Playwright ESM/CJS load of package dist). */
const CSRF_COOKIE = "dang_csrf";
const CSRF_HEADER = "x-csrf-token";

/** Stable subject for Playwright demo seed (must match ALLOW_DEV_AUTH API). */
export const E2E_DEV_SUBJECT = "playwright-e2e-user";
export const E2E_DEV_NAME = "Playwright E2E";

export type SeededWorkspace = {
  id: string;
  slug: string;
  name: string;
  reused: boolean;
};

function encodeDevHeader(subject: string): string {
  return `b64:${Buffer.from(subject, "utf8").toString("base64")}`;
}

const API_ORIGIN = (process.env.PLAYWRIGHT_API_ORIGIN ?? "http://127.0.0.1:3006").replace(
  /\/$/,
  "",
);

const WEB_ORIGIN = (process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3005").replace(
  /\/$/,
  "",
);

function devHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-dang-subject": encodeDevHeader(E2E_DEV_SUBJECT),
    "x-dang-display-name": encodeDevHeader(E2E_DEV_NAME),
    ...extra,
  };
}

/**
 * Dev localStorage + real HttpOnly dang_session via bootstrap-session.
 * dang_web_session alone is no longer enough for middleware.
 */
export async function installDevSession(context: BrowserContext, page: Page): Promise<void> {
  await page.addInitScript(
    ({ subject, name }) => {
      window.localStorage.setItem("dang.auth.mode", "dev");
      window.localStorage.setItem("dang.dev.subject", subject);
      window.localStorage.setItem("dang.dev.displayName", name);
      void (async () => {
        if (!("serviceWorker" in navigator)) return;
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      })();
    },
    { subject: E2E_DEV_SUBJECT, name: E2E_DEV_NAME },
  );

  const headers = devHeaders();
  const boot =
    (await tryPost(context.request, `${WEB_ORIGIN}/api/v1/auth/dev/bootstrap-session`, headers)) ||
    (await tryPost(context.request, `${API_ORIGIN}/api/v1/auth/dev/bootstrap-session`, headers));

  if (!boot) {
    await context.addCookies([
      {
        name: "dang_web_session",
        value: "1",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
  }
}

async function tryPost(
  request: APIRequestContext,
  url: string,
  headers: Record<string, string>,
): Promise<boolean> {
  try {
    const res = await request.post(url, { data: {}, headers });
    return res.ok();
  } catch {
    return false;
  }
}

function csrfFromSetCookie(header: string | null): string | undefined {
  if (!header) return undefined;
  const match = new RegExp(`${CSRF_COOKIE}=([^;]+)`).exec(header);
  return match?.[1];
}

/**
 * Calls real demo seed. Tries Next proxy first, then direct API (Windows/proxy 503s).
 */
export async function seedDemoWorkspace(
  request: APIRequestContext,
): Promise<SeededWorkspace | null> {
  async function trySeed(url: string): Promise<SeededWorkspace | null> {
    try {
      const bootUrl = url.includes("/api/v1/")
        ? url.replace(/\/demo\/seed.?$/, "/auth/dev/bootstrap-session")
        : `${API_ORIGIN}/api/v1/auth/dev/bootstrap-session`;
      const bootRes = await request.post(bootUrl, { data: {}, headers: devHeaders() });
      const setCookie =
        bootRes.headers()["set-cookie"] ??
        (bootRes.headers() as Record<string, string>)["Set-Cookie"];
      const csrf = csrfFromSetCookie(
        Array.isArray(setCookie) ? setCookie.join(",") : (setCookie ?? null),
      );
      const headers = devHeaders(csrf ? { [CSRF_HEADER]: csrf } : undefined);

      const res = await request.post(url, { data: {}, headers });
      if (!res.ok()) return null;
      const body = (await res.json()) as {
        workspace?: { id?: string; slug?: string; name?: string };
        reused?: boolean;
      };
      if (!body.workspace?.id || !body.workspace.slug) return null;
      return {
        id: body.workspace.id,
        slug: body.workspace.slug,
        name: body.workspace.name ?? body.workspace.slug,
        reused: Boolean(body.reused),
      };
    } catch {
      return null;
    }
  }

  return (
    (await trySeed("/api/v1/demo/seed")) ??
    (await trySeed(`${API_ORIGIN}/api/v1/demo/seed`))
  );
}

/**
 * Prefer PLAYWRIGHT_WORKSPACE_SLUG; otherwise seed via demo API when ALLOW_DEV_AUTH works.
 */
export async function resolveWorkspaceSlug(
  request: APIRequestContext,
): Promise<{ slug: string; source: "env" | "seed" } | null> {
  const fromEnv = process.env.PLAYWRIGHT_WORKSPACE_SLUG?.trim();
  if (fromEnv) return { slug: fromEnv, source: "env" };
  const seeded = await seedDemoWorkspace(request);
  if (!seeded) return null;
  return { slug: seeded.slug, source: "seed" };
}
