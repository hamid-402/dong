import type { APIRequestContext, BrowserContext, Page } from "@playwright/test";

/** Stable subject for Playwright demo seed (must match ALLOW_DEV_AUTH API). */
export const E2E_DEV_SUBJECT = "playwright-e2e-user";
export const E2E_DEV_NAME = "Playwright E2E";

export type SeededWorkspace = {
  id: string;
  slug: string;
  name: string;
  reused: boolean;
};

/**
 * Dev-session cookie + localStorage so middleware and API client accept the browser.
 * Also clears stale service workers that can hang /api/v1 in production builds.
 */
export async function installDevSession(context: BrowserContext, page: Page): Promise<void> {
  await context.addCookies([
    {
      name: "dang_web_session",
      value: "1",
      domain: "127.0.0.1",
      path: "/",
    },
  ]);
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
}

function encodeDevHeader(subject: string): string {
  return `b64:${Buffer.from(subject, "utf8").toString("base64")}`;
}

const API_ORIGIN = (process.env.PLAYWRIGHT_API_ORIGIN ?? "http://127.0.0.1:3006").replace(
  /\/$/,
  "",
);

/**
 * Calls real demo seed. Tries Next proxy first, then direct API (Windows/proxy 503s).
 */
export async function seedDemoWorkspace(
  request: APIRequestContext,
): Promise<SeededWorkspace | null> {
  const headers = {
    "content-type": "application/json",
    "x-dang-subject": encodeDevHeader(E2E_DEV_SUBJECT),
    "x-dang-display-name": encodeDevHeader(E2E_DEV_NAME),
  };

  async function trySeed(url: string): Promise<SeededWorkspace | null> {
    try {
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
