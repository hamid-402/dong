"use client";

import type { ReactNode } from "react";
import { useMosaicNav } from "@/components/mosaic/mosaic-nav-context";

export function MosaicContentFrame({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const { direction } = useMosaicNav();

  return (
    <div
      className={`mosaic-content-frame mosaic-content-frame--app ${
        direction === "back" ? "is-back" : "is-forward"
      }`}
    >
      {title ? (
        <header className="mosaic-content-frame__head">
          <h2 className="mosaic-content-frame__title">{title}</h2>
        </header>
      ) : null}
      <div className="mosaic-content-frame__body">{children}</div>
    </div>
  );
}
