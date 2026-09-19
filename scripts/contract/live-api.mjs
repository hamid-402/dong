#!/usr/bin/env node
/**
 * R10-10 / D3 — live Web↔API contract check against @dang/contracts Zod schemas.
 * Env: API_URL default http://127.0.0.1:3006
 *
 * Covers:
 * - health/ready + system/capabilities (incl. payment / slo / paymentOnBehalf)
 * - LocalPSP public route (404 problem for missing intent)
 * - platform/slo + on-behalf routes exist (401/404 problem without session)
 * - Optional CONTRACT_SESSION_COOKIE for authenticated 200 body checks
 */
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractsEntry = resolve(
  __dirname,
  "../../packages/contracts/dist/index.js",
);
const {
  healthReadyResponseSchema,
  systemCapabilitiesSchema,
  problemDetailsSchema,
  platformSloResponseSchema,
  onBehalfPaymentListSchema,
  localPspIntentSummarySchema,
} = await import(pathToFileURL(contractsEntry).href);

const apiBase = (process.env.API_URL ?? "http://127.0.0.1:3006").replace(
  /\/$/,
  "",
);
const sessionCookie = (process.env.CONTRACT_SESSION_COOKIE ?? "").trim();

async function json(path, init) {
  const headers = { ...(init?.headers ?? {}) };
  if (sessionCookie && !headers.cookie && !headers.Cookie) {
    headers.cookie = sessionCookie;
  }
  const res = await fetch(`${apiBase}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function expectProblem(label, status, body, allowedStatuses) {
  if (!allowedStatuses.includes(status)) {
    return `${label}: HTTP ${status} (expected ${allowedStatuses.join("|")})`;
  }
  const parsed = problemDetailsSchema.safeParse(body);
  if (!parsed.success) {
    return `${label}: problem schema: ${parsed.error.message}`;
  }
  if (parsed.data.status !== status) {
    return `${label}: problem.status ${parsed.data.status} ≠ HTTP ${status}`;
  }
  return null;
}

const failures = [];

try {
  const ready = await json("/api/v1/health/ready");
  if (ready.status !== 200) {
    failures.push(`health/ready HTTP ${ready.status}`);
  } else {
    const parsed = healthReadyResponseSchema.safeParse(ready.body);
    if (!parsed.success) {
      failures.push(`health/ready schema: ${parsed.error.message}`);
    } else {
      console.log(`OK health/ready contract (${parsed.data.status})`);
    }
  }
} catch (err) {
  failures.push(`health/ready: ${err instanceof Error ? err.message : err}`);
}

let capsProviders = null;
try {
  const caps = await json("/api/v1/system/capabilities");
  if (caps.status !== 200) {
    failures.push(`capabilities HTTP ${caps.status}`);
  } else {
    const parsed = systemCapabilitiesSchema.safeParse(caps.body);
    if (!parsed.success) {
      failures.push(`capabilities schema: ${parsed.error.message}`);
    } else {
      capsProviders = parsed.data.providers ?? {};
      const payment = capsProviders.payment;
      const slo = capsProviders.slo;
      const onBehalf = capsProviders.paymentOnBehalf;
      if (!payment) {
        failures.push("capabilities: providers.payment missing");
      } else {
        console.log(`OK capabilities providers.payment=${payment}`);
      }
      if (slo !== "in_app_v1" && slo !== "none") {
        failures.push(`capabilities: providers.slo unexpected (${slo})`);
      } else {
        console.log(`OK capabilities providers.slo=${slo ?? "absent"}`);
      }
      if (onBehalf !== "on_behalf_v1" && onBehalf !== "none") {
        failures.push(
          `capabilities: providers.paymentOnBehalf unexpected (${onBehalf})`,
        );
      } else {
        console.log(
          `OK capabilities providers.paymentOnBehalf=${onBehalf ?? "absent"}`,
        );
      }
      console.log(`OK capabilities contract v${parsed.data.version}`);
    }
  }
} catch (err) {
  failures.push(`capabilities: ${err instanceof Error ? err.message : err}`);
}

try {
  const missing = await json(
    "/api/v1/payments/local/intents/contract-smoke-missing-intent",
  );
  if (missing.status === 200) {
    const parsed = localPspIntentSummarySchema.safeParse(missing.body);
    if (!parsed.success) {
      failures.push(`LocalPSP intent schema: ${parsed.error.message}`);
    } else {
      console.log("OK LocalPSP intent contract (unexpected hit)");
    }
  } else {
    const errMsg = expectProblem(
      "LocalPSP missing intent",
      missing.status,
      missing.body,
      [404],
    );
    if (errMsg) failures.push(errMsg);
    else console.log("OK LocalPSP route (404 problem for missing intent)");
  }
} catch (err) {
  failures.push(`LocalPSP: ${err instanceof Error ? err.message : err}`);
}

try {
  const slo = await json("/api/v1/platform/slo");
  if (slo.status === 200) {
    const parsed = platformSloResponseSchema.safeParse(slo.body);
    if (!parsed.success) {
      failures.push(`platform/slo schema: ${parsed.error.message}`);
    } else {
      console.log(
        `OK platform/slo contract (breached=${parsed.data.breached})`,
      );
    }
  } else {
    const errMsg = expectProblem("platform/slo", slo.status, slo.body, [
      401,
      404,
    ]);
    if (errMsg) failures.push(errMsg);
    else
      console.log(
        `OK platform/slo route (HTTP ${slo.status} problem — auth/role gate)`,
      );
  }
} catch (err) {
  failures.push(`platform/slo: ${err instanceof Error ? err.message : err}`);
}

try {
  const ws =
    process.env.CONTRACT_WORKSPACE_ID?.trim() ||
    "00000000-0000-4000-8000-000000000001";
  const onBehalf = await json(
    `/api/v1/workspaces/${encodeURIComponent(ws)}/payments/on-behalf`,
  );
  if (onBehalf.status === 200) {
    const parsed = onBehalfPaymentListSchema.safeParse(onBehalf.body);
    if (!parsed.success) {
      failures.push(`on-behalf list schema: ${parsed.error.message}`);
    } else {
      console.log(`OK on-behalf list contract (n=${parsed.data.length})`);
    }
  } else {
    const errMsg = expectProblem("on-behalf", onBehalf.status, onBehalf.body, [
      401,
      403,
      404,
    ]);
    if (errMsg) failures.push(errMsg);
    else
      console.log(
        `OK on-behalf route (HTTP ${onBehalf.status} problem — auth/membership gate)`,
      );
  }
} catch (err) {
  failures.push(`on-behalf: ${err instanceof Error ? err.message : err}`);
}

try {
  const outbox = await json("/api/v1/platform/outbox/stats");
  if (outbox.status === 200) {
    const body = outbox.body;
    if (
      !body ||
      typeof body !== "object" ||
      !("persistence" in body) ||
      !("stats" in body)
    ) {
      failures.push("platform/outbox/stats: missing persistence/stats shape");
    } else {
      console.log(
        `OK platform/outbox/stats (persistence=${body.persistence}, stats=${body.stats == null ? "null" : "object"})`,
      );
    }
  } else {
    const errMsg = expectProblem("outbox/stats", outbox.status, outbox.body, [
      401,
      404,
    ]);
    if (errMsg) failures.push(errMsg);
    else
      console.log(
        `OK platform/outbox/stats route (HTTP ${outbox.status} problem — auth/role gate)`,
      );
  }
} catch (err) {
  failures.push(`outbox/stats: ${err instanceof Error ? err.message : err}`);
}

try {
  const ws =
    process.env.CONTRACT_WORKSPACE_ID?.trim() ||
    "00000000-0000-4000-8000-000000000001";
  const sec = await json(
    `/api/v1/workspaces/${encodeURIComponent(ws)}/security-events?category=fraud`,
  );
  if (sec.status === 200) {
    if (!sec.body || typeof sec.body !== "object" || !("items" in sec.body)) {
      failures.push("workspace security-events: missing items");
    } else console.log("OK workspace security-events contract");
  } else {
    const errMsg = expectProblem("workspace security-events", sec.status, sec.body, [
      401,
      403,
      404,
    ]);
    if (errMsg) failures.push(errMsg);
    else
      console.log(
        `OK workspace security-events route (HTTP ${sec.status} problem — auth/role gate)`,
      );
  }
} catch (err) {
  failures.push(
    `workspace security-events: ${err instanceof Error ? err.message : err}`,
  );
}

if (failures.length) {
  console.error("CONTRACT LIVE FAILED:");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    apiBase,
    covered: [
      "health/ready",
      "system/capabilities",
      "payments/local/intents",
      "platform/slo",
      "payments/on-behalf",
      "platform/outbox/stats",
      "workspaces/security-events",
    ],
    authDeep: Boolean(sessionCookie),
    note: "R10-10/D3 live contract — docs/ops/CONTRACT-TESTING.md",
  }),
);
