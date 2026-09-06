"use client";

import type { CSSProperties } from "react";
import type { NavNode } from "@/lib/navigation-types";
import { TILE_GEM_PALETTES } from "@/lib/tile-gem-palettes";
import { ShellIconSvg, type ShellIcon } from "@/components/app-shell";

type Props = {
  node: NavNode;
  onClick: () => void;
  delayIndex?: number;
  active?: boolean;
  /** list = fintech module row · tile = compact launcher (rail / nested) */
  density?: "list" | "tile";
};

function gemStyle(gem: { edge: string; mid: string; center: string; ink: string }): CSSProperties {
  return {
    "--tile-gem-edge": gem.edge,
    "--tile-gem-mid": gem.mid,
    "--tile-gem-center": gem.center,
    "--tile-gem-ink": gem.ink,
  } as CSSProperties;
}

export function MosaicTile({
  node,
  onClick,
  delayIndex = 0,
  active = false,
  density = "list",
}: Props) {
  const gem = TILE_GEM_PALETTES[node.gemKey ?? "teal"] ?? TILE_GEM_PALETTES.teal!;
  const iconName = (node.icon as ShellIcon | undefined) ?? "home";
  const isList = density === "list";

  return (
    <li
      className={`mosaic-tile-wrap mosaic-tile-wrap--${density}`}
      style={{ animationDelay: `${delayIndex * 36}ms` }}
    >
      <button
        type="button"
        className={[
          "mosaic-tile",
          `mosaic-tile--${density}`,
          node.locked ? "mosaic-tile--locked" : "",
          node.isGroup ? "mosaic-tile--group" : "mosaic-tile--leaf",
          active ? "mosaic-tile--active" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={gemStyle(gem)}
        onClick={onClick}
        disabled={node.locked}
        aria-label={node.label}
        aria-current={active ? "page" : undefined}
      >
        <span className="mosaic-tile__icon" aria-hidden>
          <ShellIconSvg name={iconName} />
        </span>

        {isList ? (
          <span className="mosaic-tile__copy">
            <span className="mosaic-tile__label">{node.label}</span>
            {node.description ? (
              <span className="mosaic-tile__desc">{node.description}</span>
            ) : null}
          </span>
        ) : (
          <span className="mosaic-tile__label">{node.label}</span>
        )}

        <span className="mosaic-tile__trail" aria-hidden>
          {node.isGroup ? (
            <span className="mosaic-tile__count">{node.children?.length ?? 0}</span>
          ) : null}
          <span className="mosaic-tile__chev">‹</span>
        </span>
      </button>
    </li>
  );
}
