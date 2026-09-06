"use client";

import { useEffect, useState } from "react";

export type ViewportMode = "mobile" | "tablet" | "desktop";

function readMode(width: number): ViewportMode {
  if (width >= 1100) return "desktop";
  if (width >= 768) return "tablet";
  return "mobile";
}

/** Stable after mount; CSS media queries remain source of truth for shell sizing. */
export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>("desktop");

  useEffect(() => {
    const update = () => setMode(readMode(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return mode;
}

export function useIsNarrow(): boolean {
  const mode = useViewportMode();
  return mode === "mobile";
}
