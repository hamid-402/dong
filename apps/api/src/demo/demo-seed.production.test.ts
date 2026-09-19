import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException, GoneException } from "@nestjs/common";
import { isDemoModuleEnabled } from "./demo.module.js";
import {
  assertColleaguesPurgeConfirm,
  assertColleaguesSeedConfirm,
  assertDemoSeedAllowed,
  assertWorkspaceSeedConfirm,
  COLLEAGUES_PURGE_CONFIRM,
  COLLEAGUES_SEED_CONFIRM,
  WORKSPACE_SEED_CONFIRM,
  demoSeedAllowedFromEnv,
} from "./demo-seed.service.js";

test("demo seed blocked in production even with allowDevAuth", () => {
  assert.throws(
    () => assertDemoSeedAllowed({ nodeEnv: "production", allowDevAuth: true }),
    GoneException,
  );
});

test("demo seed blocked without allowDevAuth in development", () => {
  assert.throws(
    () => assertDemoSeedAllowed({ nodeEnv: "development", allowDevAuth: false }),
    BadRequestException,
  );
});

test("demo seed allowed in development with allowDevAuth", () => {
  assert.doesNotThrow(() =>
    assertDemoSeedAllowed({ nodeEnv: "development", allowDevAuth: true }),
  );
});

test("S11-14 capabilities demoSeedAllowed never true in production", () => {
  assert.equal(
    demoSeedAllowedFromEnv({ nodeEnv: "production", allowDevAuth: true }),
    false,
  );
  assert.equal(
    demoSeedAllowedFromEnv({ nodeEnv: "development", allowDevAuth: true }),
    true,
  );
  assert.equal(
    demoSeedAllowedFromEnv({ nodeEnv: "development", allowDevAuth: false }),
    false,
  );
});

test("S10-05 / S11-14 DemoModule cut off in production", () => {
  assert.equal(isDemoModuleEnabled({ nodeEnv: "production" }), false);
  assert.equal(isDemoModuleEnabled({ nodeEnv: "development" }), true);
  assert.equal(isDemoModuleEnabled({ nodeEnv: "test" }), true);
});

test("S11-14 colleagues seed requires exact confirm string", () => {
  assert.throws(() => assertColleaguesSeedConfirm(undefined), BadRequestException);
  assert.throws(() => assertColleaguesSeedConfirm({}), BadRequestException);
  assert.throws(
    () => assertColleaguesSeedConfirm({ confirm: "yes" }),
    BadRequestException,
  );
  assert.doesNotThrow(() =>
    assertColleaguesSeedConfirm({ confirm: COLLEAGUES_SEED_CONFIRM }),
  );
});

test("S11-14 colleagues purge requires exact confirm string", () => {
  assert.throws(() => assertColleaguesPurgeConfirm({}), BadRequestException);
  assert.doesNotThrow(() =>
    assertColleaguesPurgeConfirm({ confirm: COLLEAGUES_PURGE_CONFIRM }),
  );
});

test("workspace demo seed requires exact confirm string", () => {
  assert.throws(() => assertWorkspaceSeedConfirm({}), BadRequestException);
  assert.doesNotThrow(() =>
    assertWorkspaceSeedConfirm({ confirm: WORKSPACE_SEED_CONFIRM }),
  );
});
