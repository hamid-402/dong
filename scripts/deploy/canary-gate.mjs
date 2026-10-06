#!/usr/bin/env node
/**
 * R10-16 / W6 / Phase 5.8 — canary / post-deploy gate.
 * Fail ⇒ do not promote / trigger rollback.
 */
import {
  readyStatusFailure,
  workerHeartbeatFailure,
} from "./canary-gate-policy.mjs";

const apiBase = (process.env.API_URL ?? "http://127.0.0.1:3006").replace(/\/$/, "");
const webBase = (process.env.WEB_URL ?? "http://127.0.0.1:3005").replace(/\/$/, "");
const requireReady = process.env.CANARY_REQUIRE_READY !== "0";
const requireWorker = process.env.CANARY_REQUIRE_WORKER !== "0";
const checkSlo = process.env.CANARY_CHECK_SLO === "1";
const sloCookie = process.env.CANARY_SLO_COOKIE?.trim() ?? "";

async function get(url, headers = {}) {
  const res = await fetch(url, { redirect: "follow", headers });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, text, json };
}

const failures = [];

try {
  const ready = await get(`${apiBase}/api/v1/health/ready`);
  if (!ready.ok) {
    failures.push(`health/ready HTTP ${ready.status}`);
  } else {
    const fail = readyStatusFailure({
      requireReady,
      status: ready.json?.status,
    });
    if (fail) failures.push(fail);
    else console.log(`OK health/ready → ${ready.json?.status}`);
  }
} catch (err) {
  failures.push(`health/ready unreachable: ${err instanceof Error ? err.message : err}`);
}

let capsJson = null;
try {
  const caps = await get(`${apiBase}/api/v1/system/capabilities`);
  if (!caps.ok || !caps.json?.version) {
    failures.push(`capabilities HTTP ${caps.status}`);
  } else {
    capsJson = caps.json;
    console.log(`OK capabilities v${caps.json.version}`);
  }
} catch (err) {
  failures.push(`capabilities unreachable: ${err instanceof Error ? err.message : err}`);
}

if (capsJson) {
  const worker = capsJson.integrationsReady?.workerConsumer;
  const redisConfigured = worker?.redisConfigured === true;
  const heartbeatAlive = worker?.heartbeatAlive === true;
  const fail = workerHeartbeatFailure({
    requireWorker,
    redisConfigured,
    heartbeatAlive,
  });
  if (fail) {
    failures.push(fail);
  } else if (redisConfigured) {
    console.log(
      `OK workerConsumer redisConfigured=true heartbeatAlive=${heartbeatAlive}`,
    );
  } else {
    console.log("OK workerConsumer Redis not configured — worker check skipped");
  }
}

try {
  const login = await get(`${webBase}/login`);
  if (!login.ok || !/ورود|login/i.test(login.text)) {
    failures.push(`web /login HTTP ${login.status}`);
  } else {
    console.log("OK web /login");
  }
} catch (err) {
  failures.push(`/login unreachable: ${err instanceof Error ? err.message : err}`);
}

if (checkSlo) {
  try {
    const headers = sloCookie ? { cookie: sloCookie } : {};
    const slo = await get(`${apiBase}/api/v1/platform/slo`, headers);
    if (slo.status === 401 || slo.status === 403) {
      console.log(
        `SKIP platform/slo HTTP ${slo.status} — no invented burn (set CANARY_SLO_COOKIE for auth)`,
      );
    } else if (!slo.ok || !slo.json) {
      failures.push(`platform/slo HTTP ${slo.status}`);
    } else if (slo.json.available === false) {
      console.log("OK platform/slo available=false — no burn invented");
    } else {
      const windows = Array.isArray(slo.json.windows) ? slo.json.windows : [];
      const breached = windows.filter((w) => w?.breached === true);
      if (breached.length > 0) {
        failures.push(
          `platform/slo breached windows: ${breached.map((w) => w.id ?? "?").join(",")}`,
        );
      } else {
        console.log(`OK platform/slo windows=${windows.length} none breached`);
      }
    }
  } catch (err) {
    failures.push(`platform/slo unreachable: ${err instanceof Error ? err.message : err}`);
  }
}

const result = {
  ok: failures.length === 0,
  apiBase,
  webBase,
  failures,
  action: failures.length ? "rollback_or_hold" : "promote_ok",
  note: "W6 canary gate — see docs/ops/CANARY-DEPLOY.md",
};

console.log(JSON.stringify(result, null, 2));
process.exit(failures.length ? 1 : 0);
