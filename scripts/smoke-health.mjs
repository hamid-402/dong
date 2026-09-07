#!/usr/bin/env node
/**
 * Post-deploy / local smoke: API ready + web login HTML.
 * Env: API_URL (default http://127.0.0.1:3006) WEB_URL (default http://127.0.0.1:3005)
 */
const apiBase = (process.env.API_URL ?? "http://127.0.0.1:3006").replace(/\/$/, "");
const webBase = (process.env.WEB_URL ?? "http://127.0.0.1:3005").replace(/\/$/, "");

async function get(url) {
  const res = await fetch(url, { redirect: "follow" });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

const failures = [];

try {
  const ready = await get(`${apiBase}/api/v1/health/ready`);
  if (!ready.ok) {
    failures.push(`health/ready HTTP ${ready.status}`);
  } else {
    try {
      const body = JSON.parse(ready.text);
      if (body.status !== "ready" && body.status !== "degraded") {
        failures.push(`health/ready unexpected status: ${body.status}`);
      }
      console.log(`OK health/ready → ${body.status}`);
    } catch {
      failures.push("health/ready returned non-JSON");
    }
  }
} catch (err) {
  failures.push(`health/ready unreachable: ${err instanceof Error ? err.message : err}`);
}

try {
  const login = await get(`${webBase}/login`);
  if (!login.ok) {
    failures.push(`/login HTTP ${login.status}`);
  } else if (!/ورود|login/i.test(login.text)) {
    failures.push("/login HTML missing expected auth markers");
  } else {
    console.log("OK web /login");
  }
} catch (err) {
  failures.push(`/login unreachable: ${err instanceof Error ? err.message : err}`);
}

if (failures.length) {
  console.error("SMOKE FAILED:");
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}

console.log("SMOKE OK");
