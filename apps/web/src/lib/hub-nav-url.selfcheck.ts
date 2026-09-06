/**
 * Lightweight parse/build checks for mosaic hub URLs (no test runner required).
 * Run from apps/web: node --import tsx src/lib/hub-nav-url.selfcheck.ts
 * Or: pnpm --filter @dang/api exec tsx ../../apps/web/src/lib/hub-nav-url.selfcheck.ts
 */
import { RAW_MENU_ITEMS } from "./app-navigation";
import {
  buildHubPath,
  parseHubLocation,
  pathSegmentToKey,
  keyToPathSegment,
  routeToHubContentPath,
} from "./hub-nav-url";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

assert(keyToPathSegment("/workspaces/invite") === "~workspaces--invite", "keyToPathSegment");
assert(pathSegmentToKey("~workspaces--invite") === "/workspaces/invite", "pathSegmentToKey");

assert(buildHubPath([]) === "/hub", "root path");
assert(
  buildHubPath([{ key: "finance" }], "/workspaces") === "/hub/finance/~workspaces",
  "finance content path",
);

const parsed = parseHubLocation("finance/~workspaces");
assert(parsed.groupKeys.join() === "finance", "parse groups");
assert(parsed.contentRoute === "/workspaces", "parse content");

assert(
  routeToHubContentPath("/workspaces", RAW_MENU_ITEMS) === "/hub/finance/~workspaces",
  "workspaces map",
);
assert(routeToHubContentPath("/me", RAW_MENU_ITEMS) === "/hub/spaces/~me", "me map");
assert(routeToHubContentPath("/orgs", RAW_MENU_ITEMS) === "/hub/spaces/~orgs", "orgs map");
assert(routeToHubContentPath("/groups", RAW_MENU_ITEMS) === "/hub/spaces/~group", "groups alias");
assert(routeToHubContentPath("/", RAW_MENU_ITEMS) === "/hub", "home map");

console.log("hub-nav-url selfcheck: ok");
