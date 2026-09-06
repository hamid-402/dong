"use client";

import { MosaicTile } from "@/components/mosaic/mosaic-tile";
import { useMosaicNav } from "@/components/mosaic/mosaic-nav-context";
import type { NavNode } from "@/lib/navigation-types";

type Props = {
  nodes: NavNode[];
  animationKey: string;
  onTileClick: (node: NavNode) => void;
  density?: "list" | "tile";
};

export function MosaicGrid({
  nodes,
  animationKey,
  onTileClick,
  density = "list",
}: Props) {
  const { direction, contentRoute } = useMosaicNav();
  return (
    <ul
      className={`mosaic-grid mosaic-grid--${density} mosaic-grid--${direction === "back" ? "back" : "forward"}`}
      key={animationKey}
    >
      {nodes.map((node, index) => (
        <MosaicTile
          key={node.key}
          node={node}
          density={density}
          delayIndex={index}
          active={Boolean(node.route && node.route === contentRoute)}
          onClick={() => onTileClick(node)}
        />
      ))}
    </ul>
  );
}
