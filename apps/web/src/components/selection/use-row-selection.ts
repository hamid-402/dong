"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Row selection for the **Bulk actions** / Selection toolbar pattern
 * (Persian product name: «نوار انتخاب»).
 *
 * Checkboxes on rows → actions live in a bar above the list, not on every row.
 */
export function useRowSelection(rowIds: readonly string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const idSet = useMemo(() => new Set(rowIds), [rowIds]);

  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (idSet.has(id)) next.add(id);
        else changed = true;
      }
      if (!changed && next.size === prev.size) return prev;
      return next;
    });
  }, [idSet]);

  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedCount = selected.size;
  const allSelected = rowIds.length > 0 && selectedCount === rowIds.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Replace selection with exactly one id (finance-style single select). */
  const selectOnly = useCallback((id: string) => {
    setSelected(new Set([id]));
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (rowIds.length === 0) return prev;
      if (prev.size === rowIds.length) return new Set();
      return new Set(rowIds);
    });
  }, [rowIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selectedIds,
    selectedCount,
    allSelected,
    someSelected,
    isSelected,
    toggle,
    selectOnly,
    toggleAll,
    clear,
  };
}
