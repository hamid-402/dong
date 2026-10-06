"use client";

import type { KeyboardEvent, MouseEvent } from "react";

const INTERACTIVE_SELECTOR =
  "a,button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='menuitem'],[contenteditable='true']";

/** True when the click originated on a control — don't toggle row selection. */
export function isRowSelectIgnoredTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}

type ActivateOpts = {
  /** Called when the row body is activated (click / Enter / Space). */
  onActivate: () => void;
};

/**
 * Spread onto `<tr>`, `<li>`, or a row wrapper so clicking anywhere
 * toggles selection — not only the checkbox square.
 */
export function rowSelectActivateProps({ onActivate }: ActivateOpts) {
  return {
    onClick: (event: MouseEvent<HTMLElement>) => {
      if (isRowSelectIgnoredTarget(event.target)) return;
      onActivate();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (isRowSelectIgnoredTarget(event.target)) return;
      event.preventDefault();
      onActivate();
    },
  };
}
