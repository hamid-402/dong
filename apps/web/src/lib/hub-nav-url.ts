const ROUTE_PREFIX = "~";

export function keyToPathSegment(key: string): string {
  if (key.startsWith("/")) {
    return ROUTE_PREFIX + key.slice(1).replace(/\//g, "--");
  }
  return key;
}

export function pathSegmentToKey(segment: string): string {
  if (segment.startsWith(ROUTE_PREFIX)) {
    return "/" + segment.slice(1).replace(/--/g, "/");
  }
  return segment;
}

export function buildHubPath(
  stack: { key: string }[],
  contentRoute: string | null = null,
): string {
  const segments = stack.map((n) => keyToPathSegment(n.key));
  if (contentRoute) segments.push(keyToPathSegment(contentRoute));
  return segments.length ? `/hub/${segments.join("/")}` : "/hub";
}

export function parseHubLocation(hubSplat: string): {
  groupKeys: string[];
  contentRoute: string | null;
} {
  const raw = (hubSplat || "").replace(/^\/+|\/+$/g, "");
  if (!raw) return { groupKeys: [], contentRoute: null };

  const keys = raw.split("/").map(pathSegmentToKey);
  const routeIdx = keys.findIndex((k) => k.startsWith("/"));

  if (routeIdx === -1) {
    return { groupKeys: keys, contentRoute: null };
  }
  return {
    groupKeys: keys.slice(0, routeIdx),
    contentRoute: keys[routeIdx] ?? null,
  };
}

/** Find hub path for a classic app route (e.g. /workspaces → /hub/finance/~workspaces). */
export function routeToHubContentPath(
  pathname: string,
  rootNodes: Array<{
    key: string;
    route?: string;
    isGroup?: boolean;
    children?: Array<{ key: string; route?: string; isGroup?: boolean; children?: unknown[] }>;
  }>,
): string {
  let normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/groups") normalized = "/group";

  function walk(
    nodes: typeof rootNodes,
    stack: { key: string }[],
  ): string | null {
    for (const node of nodes) {
      if (node.route === normalized || node.route === pathname) {
        return buildHubPath(stack, node.route);
      }
      if (node.isGroup && node.children) {
        const found = walk(node.children as typeof rootNodes, [...stack, { key: node.key }]);
        if (found) return found;
      }
    }
    return null;
  }

  return walk(rootNodes, []) ?? "/hub";
}
