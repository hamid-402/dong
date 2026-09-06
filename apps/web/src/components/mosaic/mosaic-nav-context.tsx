"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { resolveStack } from "@/lib/app-navigation";
import { buildHubPath, parseHubLocation, routeToHubContentPath } from "@/lib/hub-nav-url";
import type { NavNode } from "@/lib/navigation-types";

export type NavDirection = "forward" | "back" | "none";

type MosaicNavContextValue = {
  stack: NavNode[];
  currentNodes: NavNode[];
  contentRoute: string | null;
  isContentMode: boolean;
  breadcrumbTrail: NavNode[];
  navKey: string;
  direction: NavDirection;
  depth: number;
  pushGroup: (node: NavNode) => void;
  pop: () => void;
  openContent: (node: NavNode) => void;
  closeContent: () => void;
  goToBreadcrumb: (index: number) => void;
};

const MosaicNavContext = createContext<MosaicNavContextValue | null>(null);

export function MosaicNavProvider({
  rootNodes,
  children,
}: {
  rootNodes: NavNode[];
  children: ReactNode;
}) {
  const router = useRouter();
  const params = useParams<{ slug?: string[] }>();
  const hubSplat = (params.slug ?? []).join("/");
  const [direction, setDirection] = useState<NavDirection>("none");
  const prevDepth = useRef(0);

  const state = useMemo(() => {
    const { groupKeys, contentRoute } = parseHubLocation(hubSplat);
    const resolved = resolveStack(rootNodes, groupKeys);

    if (!resolved) {
      return { valid: false as const, redirectPath: "/hub" };
    }

    const { stack, currentNodes } = resolved;
    const isContentMode = contentRoute !== null;

    if (isContentMode && contentRoute) {
      const leaf = currentNodes.find((n) => n.route === contentRoute);
      if (!leaf) {
        /** Deep-link correction: `/hub/~me` → `/hub/spaces/~me` via menu tree. */
        const corrected = routeToHubContentPath(contentRoute, rootNodes);
        const fallback = buildHubPath(stack);
        return {
          valid: false as const,
          redirectPath: corrected !== "/hub" ? corrected : fallback,
        };
      }
    }

    const breadcrumbTrail = [...stack];
    if (isContentMode) {
      const leaf = currentNodes.find((n) => n.route === contentRoute);
      if (leaf) breadcrumbTrail.push(leaf);
    }

    const depth = stack.length + (isContentMode ? 1 : 0);

    return {
      valid: true as const,
      stack,
      currentNodes,
      contentRoute,
      isContentMode,
      breadcrumbTrail,
      navKey: hubSplat || "root",
      depth,
    };
  }, [hubSplat, rootNodes]);

  useEffect(() => {
    if (!state.valid) {
      router.replace(state.redirectPath);
    }
  }, [state, router]);

  useEffect(() => {
    if (!state.valid) return;
    const next = state.depth;
    if (next > prevDepth.current) setDirection("forward");
    else if (next < prevDepth.current) setDirection("back");
    else setDirection("none");
    prevDepth.current = next;
  }, [state]);

  const pushGroup = useCallback(
    (node: NavNode) => {
      if (!state.valid) return;
      router.push(buildHubPath([...state.stack, node]));
    },
    [router, state],
  );

  const pop = useCallback(() => {
    if (!state.valid) return;
    if (state.isContentMode) {
      router.push(buildHubPath(state.stack));
      return;
    }
    router.push(buildHubPath(state.stack.slice(0, -1)));
  }, [router, state]);

  const openContent = useCallback(
    (node: NavNode) => {
      if (!state.valid || !node.route) return;
      router.push(buildHubPath(state.stack, node.route));
    },
    [router, state],
  );

  const closeContent = useCallback(() => {
    if (!state.valid) return;
    router.push(buildHubPath(state.stack));
  }, [router, state]);

  const goToBreadcrumb = useCallback(
    (index: number) => {
      if (!state.valid) return;
      if (index < 0) {
        router.push("/hub");
        return;
      }
      const target = state.breadcrumbTrail[index];
      if (!target) return;

      if (target.route) {
        router.push(buildHubPath(state.stack, target.route));
      } else {
        const groupIndex = state.stack.findIndex((n) => n.key === target.key);
        router.push(buildHubPath(state.stack.slice(0, groupIndex + 1)));
      }
    },
    [router, state],
  );

  if (!state.valid) return null;

  const value: MosaicNavContextValue = {
    stack: state.stack,
    currentNodes: state.currentNodes,
    contentRoute: state.contentRoute,
    isContentMode: state.isContentMode,
    breadcrumbTrail: state.breadcrumbTrail,
    navKey: state.navKey,
    direction,
    depth: state.depth,
    pushGroup,
    pop,
    openContent,
    closeContent,
    goToBreadcrumb,
  };

  return <MosaicNavContext.Provider value={value}>{children}</MosaicNavContext.Provider>;
}

export function useMosaicNav() {
  const ctx = useContext(MosaicNavContext);
  if (!ctx) throw new Error("useMosaicNav must be used within MosaicNavProvider");
  return ctx;
}
