import assert from "node:assert/strict";
import test from "node:test";
import { evaluateLighthouse } from "./lighthouse-budget.mjs";
import { fieldUrlProblem } from "./field-url.mjs";

function report({ lcp = 1200, cls = 0.02, js = 400_000 } = {}) {
  return {
    audits: {
      "largest-contentful-paint": { numericValue: lcp },
      "cumulative-layout-shift": { numericValue: cls },
      "network-requests": {
        details: {
          items: [
            { resourceType: "Script", transferSize: js },
            { resourceType: "Stylesheet", transferSize: 20_000 },
          ],
        },
      },
    },
  };
}

test("the measured home lab run is inside the budget", () => {
  const result = evaluateLighthouse(report({ lcp: 1208, cls: 0.075, js: 448 * 1024 }));
  assert.deepEqual(result.failures, []);
});

test("a 5s LCP fails", () => {
  const result = evaluateLighthouse(report({ lcp: 5700 }));
  assert.ok(result.failures.some((line) => line.startsWith("LCP")));
});

test("CLS at the 0.1 line fails", () => {
  const result = evaluateLighthouse(report({ cls: 0.1 }));
  assert.ok(result.failures.some((line) => line.startsWith("CLS")));
});

test("script transfer at 600 KiB fails", () => {
  const result = evaluateLighthouse(report({ js: 600 * 1024 }));
  assert.ok(result.failures.some((line) => line.startsWith("JS")));
});

test("a public host can be a field run", () => {
  assert.equal(fieldUrlProblem("https://app.example.com/login"), null);
});

test("loopback and private hosts are lab runs", () => {
  assert.match(fieldUrlProblem("http://127.0.0.1:3010/home") ?? "", /lab|private/);
  assert.match(fieldUrlProblem("http://localhost:3005/login") ?? "", /lab/);
  assert.match(fieldUrlProblem("http://192.168.1.8/") ?? "", /private/);
  assert.match(fieldUrlProblem("http://10.0.0.4/") ?? "", /private/);
});
