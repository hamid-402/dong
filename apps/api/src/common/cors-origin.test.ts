import assert from "node:assert/strict";
import test from "node:test";
import { allowCorsOrigin, isPrivateLanHttpOrigin } from "../common/cors-origin.js";

test("private LAN origin detection", () => {
  assert.equal(isPrivateLanHttpOrigin("http://192.168.1.10:3005"), true);
  assert.equal(isPrivateLanHttpOrigin("http://10.0.0.2:3005"), true);
  assert.equal(isPrivateLanHttpOrigin("https://192.168.1.10:3005"), false);
  assert.equal(isPrivateLanHttpOrigin("http://192.168.1.10:3000"), false);
});

test("LAN CORS allowed only outside production", () => {
  const lan = "http://192.168.1.20:3005";
  assert.equal(
    allowCorsOrigin({
      origin: lan,
      webOrigin: "http://127.0.0.1:3005",
      extraOrigins: [],
      nodeEnv: "development",
    }),
    true,
  );
  assert.equal(
    allowCorsOrigin({
      origin: lan,
      webOrigin: "http://127.0.0.1:3005",
      extraOrigins: [],
      nodeEnv: "production",
    }),
    false,
  );
  assert.equal(
    allowCorsOrigin({
      origin: lan,
      webOrigin: "http://127.0.0.1:3005",
      extraOrigins: [lan],
      nodeEnv: "production",
    }),
    true,
  );
});
