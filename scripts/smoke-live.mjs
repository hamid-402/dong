import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const API = "http://127.0.0.1:3006/api/v1";
const WEB = "http://127.0.0.1:3005";

const results = [];

async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`OK  ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail: msg });
    console.log(`FAIL ${name} — ${msg}`);
  }
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function json(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body, text };
}

const email = `smoke-${Date.now()}@dang.local`;
const password = "SmokePass123!";
let cookie = "";

await check("postgres:5432 via API ready", async () => {
  const { res, body } = await json(`${API}/health/ready`);
  assert(res.ok, `status ${res.status}`);
  assert(body?.checks?.iam === "postgres", `iam=${body?.checks?.iam}`);
  assert(body?.checks?.databaseConfigured === true, "databaseConfigured false");
  return body.status;
});

await check("capabilities all postgres", async () => {
  const { res, body } = await json(`${API}/system/capabilities`);
  assert(res.ok, `status ${res.status}`);
  const p = body.persistence ?? {};
  const nonPg = Object.entries(p)
    .filter(([k, v]) => k !== "attachmentBlob" && v !== "postgres")
    .map(([k, v]) => `${k}=${v}`);
  assert(nonPg.length === 0, nonPg.join(", "));
  assert(p.attachmentBlob === "local" || p.attachmentBlob === "none", "blob");
  return `stubs payment=${body.stubs?.paymentProvider} ocr=${body.stubs?.ocr} av=${body.stubs?.avScan} email=${body.stubs?.emailDelivery}`;
});

await check("register", async () => {
  const { res, body } = await json(`${API}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, displayName: "اسموک تست" }),
  });
  assert(res.ok || res.status === 201, `status ${res.status} ${JSON.stringify(body)}`);
  return email;
});

await check("login + session cookie", async () => {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const raw = setCookie.join("; ") || res.headers.get("set-cookie") || "";
  assert(res.ok, `status ${res.status}`);
  assert(/dang|session|sid/i.test(raw) || raw.length > 0, "no set-cookie");
  cookie = setCookie.map((c) => c.split(";")[0]).join("; ") || raw.split(";")[0];
  return "cookie set";
});

await check("auth/me", async () => {
  const { res, body } = await json(`${API}/auth/me`, {
    headers: { cookie },
  });
  assert(res.ok, `status ${res.status}`);
  assert(body?.userId || body?.actor?.userId || body?.email, JSON.stringify(body).slice(0, 120));
  return body.email ?? body.displayName ?? "ok";
});

await check("ensure personal via workspaces list", async () => {
  const { res, body } = await json(`${API}/workspaces`, { headers: { cookie } });
  assert(res.ok, `status ${res.status}`);
  const list = Array.isArray(body) ? body : body?.workspaces ?? body?.items ?? [];
  assert(Array.isArray(list), `unexpected ${typeof body}`);
  return `count=${list.length}`;
});

await check("personal finance overview", async () => {
  const from = new Date();
  const ym = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
  const { res, body } = await json(
    `${API}/me/finance/overview?from=${ym}-01&to=${ym}-28`,
    { headers: { cookie } },
  );
  assert(res.ok, `status ${res.status} ${JSON.stringify(body).slice(0, 160)}`);
  assert(body?.source?.expense === "postgres", `expense=${body?.source?.expense}`);
  assert(body?.source?.ledger === "postgres", `ledger=${body?.source?.ledger}`);
  return `workspaces=${body.workspaces?.length ?? 0}`;
});

await check("personal finance trends", async () => {
  const from = new Date();
  const ym = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
  const { res, body } = await json(
    `${API}/me/finance/trends?from=${ym}-01&to=${ym}-28&groupBy=day`,
    { headers: { cookie } },
  );
  assert(res.ok, `status ${res.status} ${JSON.stringify(body).slice(0, 160)}`);
  assert(body?.source?.expense === "postgres", `expense=${body?.source?.expense}`);
  assert(body?.source?.personal === "postgres", `personal=${body?.source?.personal}`);
  return `buckets=${body.buckets?.length ?? 0}`;
});

await check("personal resources", async () => {
  const { res, body } = await json(`${API}/me/finance/resources`, {
    headers: { cookie },
  });
  assert(res.ok, `status ${res.status}`);
  assert(body?.persistence === "postgres", `persistence=${body?.persistence}`);
  return `accounts=${body.accountCount}`;
});

await check("web home 200", async () => {
  const res = await fetch(WEB + "/");
  assert(res.ok, `status ${res.status}`);
  return String(res.status);
});

await check("web proxy health/ready", async () => {
  const { res, body } = await json(`${WEB}/api/v1/health/ready`);
  assert(res.ok, `status ${res.status}`);
  assert(body?.checks?.iam === "postgres", `iam=${body?.checks?.iam}`);
  return body.status;
});

await check("web proxy capabilities", async () => {
  const { res, body } = await json(`${WEB}/api/v1/system/capabilities`);
  assert(res.ok, `status ${res.status}`);
  assert(body?.persistence?.iam === "postgres", "iam not postgres via proxy");
  return "ok";
});

const failed = results.filter((r) => !r.ok);
console.log(`\nsummary: ${results.length - failed.length}/${results.length} passed`);
writeFileSync(
  resolve("smoke-report.json"),
  JSON.stringify({ email, passed: results.length - failed.length, total: results.length, results }, null, 2),
);
process.exit(failed.length ? 1 : 0);
