/**
 * R10-09 — golden-path smoke load (not overnight soak).
 *
 * Env:
 *   API_BASE  default http://127.0.0.1:3006
 *   WEB_BASE  default http://127.0.0.1:3005
 *   K6_VUS    default 5
 *   K6_DURATION default 30s
 *
 * Thresholds are CI-smoke budgets (looser than aspirational SLO in QUALITY-AND-DELIVERY).
 * Do not display these results as live product SLO badges.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const API_BASE = (__ENV.API_BASE || "http://127.0.0.1:3006").replace(/\/$/, "");
const WEB_BASE = (__ENV.WEB_BASE || "http://127.0.0.1:3005").replace(/\/$/, "");
const VUS = Number(__ENV.K6_VUS || 5);
const DURATION = __ENV.K6_DURATION || "30s";

const readFail = new Rate("golden_read_fail");
const readyMs = new Trend("golden_ready_ms", true);

export const options = {
  scenarios: {
    golden: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<1500"],
    golden_ready_ms: ["p(95)<800"],
    golden_read_fail: ["rate<0.05"],
  },
};

function get(url) {
  return http.get(url, {
    tags: { name: url.replace(API_BASE, "").replace(WEB_BASE, "") || "/" },
    timeouts: { read: "10s", connect: "5s" },
  });
}

export default function goldenPath() {
  const live = get(`${API_BASE}/api/v1/health/live`);
  const liveOk = check(live, {
    "live status 200": (r) => r.status === 200,
  });
  readFail.add(!liveOk);

  const ready = get(`${API_BASE}/api/v1/health/ready`);
  readyMs.add(ready.timings.duration);
  const readyOk = check(ready, {
    "ready status 200": (r) => r.status === 200,
    "ready body status": (r) => {
      try {
        const body = r.json();
        return body.status === "ready" || body.status === "degraded";
      } catch {
        return false;
      }
    },
  });
  readFail.add(!readyOk);

  const caps = get(`${API_BASE}/api/v1/system/capabilities`);
  const capsOk = check(caps, {
    "capabilities 200": (r) => r.status === 200,
  });
  readFail.add(!capsOk);

  const login = get(`${WEB_BASE}/login`);
  const loginOk = check(login, {
    "web login 200": (r) => r.status === 200,
    "web login markers": (r) => /ورود|login/i.test(r.body || ""),
  });
  readFail.add(!loginOk);

  sleep(0.3);
}

export function handleSummary(data) {
  const summary = {
    ok:
      (data.metrics.http_req_failed?.values?.rate ?? 1) < 0.05 &&
      (data.metrics.golden_read_fail?.values?.rate ?? 1) < 0.05,
    apiBase: API_BASE,
    webBase: WEB_BASE,
    vus: VUS,
    duration: DURATION,
    p95_ready_ms: data.metrics.golden_ready_ms?.values?.["p(95)"],
    http_req_failed: data.metrics.http_req_failed?.values?.rate,
    note: "R10-09 smoke load — not production soak; see docs/ops/LOAD-K6.md",
  };
  return {
    stdout: `${JSON.stringify(summary, null, 2)}\n`,
    "perf/k6/last-summary.json": `${JSON.stringify(summary, null, 2)}\n`,
  };
}
