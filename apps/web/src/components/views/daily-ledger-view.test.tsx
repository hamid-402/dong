/**
 * @vitest-environment jsdom
 *
 * Run27 daily-ledger view bugs T2–T4 (T1 lives in contracts/api tests).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DailyLedgerDayRow, DailyLedgerResponse } from "@dang/contracts";
import { ConfirmProvider } from "@dang/ui";

const { routerPush, routerReplace, routerBack, navState, ledgerState, makeLedger, chromeState } =
  vi.hoisted(() => {
    const emptyDay = (date: string): DailyLedgerDayRow => ({
      date,
      weekday: new Date(`${date}T00:00:00Z`).getUTCDay(),
      isHoliday: false,
      isRangeLocked: false,
      members: {
        u1: { items: [], total: { amountMinor: "0", currency: "IRR" } },
      },
      shared: { items: [], total: { amountMinor: "0", currency: "IRR" } },
      dayTotal: { amountMinor: "0", currency: "IRR" },
      fundDeposits: [],
    });
    function makeLedgerInner(
      overrides?: Partial<DailyLedgerResponse>,
    ): DailyLedgerResponse {
      const from = "2026-10-25";
      const to = "2026-10-31";
      const days = [
        emptyDay("2026-10-25"),
        emptyDay("2026-10-26"),
        emptyDay("2026-10-27"),
        emptyDay("2026-10-28"),
        emptyDay("2026-10-29"),
        emptyDay("2026-10-30"),
        emptyDay("2026-10-31"),
      ];
      return {
        workspaceId: "ws-1",
        from,
        to,
        members: [{ userId: "u1", displayName: "حمید" }],
        days,
        totals: {
          members: { u1: { amountMinor: "0", currency: "IRR" } },
          shared: { amountMinor: "0", currency: "IRR" },
          grand: { amountMinor: "0", currency: "IRR" },
        },
        rangeLocks: [],
        canManageLocks: false,
        source: { expense: "memory", dayMeta: "memory" },
        ...overrides,
      };
    }
    const workspacesStable = [
      {
        id: "ws-1",
        slug: "solo",
        name: "Solo",
        template: "friends_family",
      },
    ];
    const chromeState = {
      ready: true,
      workspaceId: "ws-1",
      workspaces: workspacesStable,
      selectWorkspace: vi.fn(),
      capabilities: { providers: {} },
    };
    return {
      routerPush: vi.fn(),
      routerReplace: vi.fn(),
      routerBack: vi.fn(),
      navState: {
        pathname: "/daily-ledger",
        searchParams: new URLSearchParams(),
      },
      ledgerState: { current: makeLedgerInner() },
      makeLedger: makeLedgerInner,
      chromeState,
    };
  });

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
    back: routerBack,
  }),
  usePathname: () => navState.pathname,
  useSearchParams: () => navState.searchParams,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/api", () => ({
  api: {
    dailyLedger: vi.fn(async () => ledgerState.current),
    getBalances: vi.fn(async () => ({ workspaceId: "ws-1", lines: [] })),
    listPettyCash: vi.fn(async () => []),
    listMembers: vi.fn(async () => [
      {
        workspaceId: "ws-1",
        userId: "u1",
        displayName: "حمید",
        role: "owner",
        defaultShares: 1,
        joinedAt: "2026-01-01T00:00:00.000Z",
      },
    ]),
    me: vi.fn(async () => ({
      actor: { userId: "u1", displayName: "Ali", email: "h@example.com" },
    })),
    createDailyLedgerEntry: vi.fn(),
    updateDailyLedgerEntry: vi.fn(),
  },
}));

vi.mock("@/lib/live-invalidation", () => ({
  useLiveInvalidation: () => undefined,
}));

vi.mock("@/lib/use-app-chrome", () => ({
  useAppChrome: () => chromeState,
}));

vi.mock("@/components/shell/workspace-scope", () => ({
  useOptionalWorkspaceScope: () => ({ workspaceId: "ws-1", slug: "solo" }),
}));

vi.mock("@/lib/display-unit", () => ({
  useDisplayUnit: () => "toman",
}));

vi.mock("@/components/shell/workspace-page-frame", () => ({
  WorkspacePageFrame: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title?: string;
  }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@/components/views/daily-ledger/daily-ledger-toolbar", () => ({
  DailyLedgerToolbar: () => <div data-testid="toolbar" />,
}));

vi.mock("@/components/views/daily-ledger/daily-ledger-overview-table", () => ({
  DailyLedgerOverviewTable: ({
    onOpenDay,
  }: {
    onOpenDay: (date: string) => void;
  }) => (
    <button type="button" onClick={() => onOpenDay("2026-10-29")}>
      باز کردن روز خالی
    </button>
  ),
}));

vi.mock("@/components/views/daily-ledger/daily-ledger-side-panels", () => ({
  DailyLedgerSidePanels: () => null,
}));

vi.mock("@/components/views/daily-ledger/daily-ledger-lock-panel", () => ({
  DailyLedgerLockPanel: () => null,
}));

vi.mock("@/components/views/daily-ledger/daily-ledger-day-view", () => ({
  DailyLedgerDayView: ({
    day,
    onBack,
    onOpenDraft,
  }: {
    day: DailyLedgerDayRow;
    onBack: () => void;
    onOpenDraft: (target: { kind: "shared"; date: string }) => void;
  }) => (
    <div data-testid="day-view">
      <span data-testid="day-date">{day.date}</span>
      <span data-testid="shared-titles">
        {day.shared.items.map((i) => i.title).join(",")}
      </span>
      <span data-testid="shared-count">{day.shared.items.length}</span>
      <button type="button" onClick={onBack} aria-label="day-view-back">
        day-back
      </button>
      <button
        type="button"
        onClick={() => onOpenDraft({ kind: "shared", date: day.date })}
      >
        + مشترک
      </button>
    </div>
  ),
}));

vi.mock("@/components/views/daily-ledger/daily-ledger-modal", () => ({
  DailyLedgerModal: ({
    open,
    onClose,
    children,
    title,
  }: {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    title?: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={title ?? "modal"}>
        <button type="button" aria-label="بستن مودال" onClick={onClose}>
          بستن
        </button>
        {children}
      </div>
    ) : null,
}));

vi.mock("@/components/jalali-date-field", () => ({
  JalaliDateField: () => null,
}));

vi.mock("@/components/catalog-picker", () => ({
  CatalogPicker: () => null,
}));

vi.mock("@/lib/use-flash-message", () => ({
  FlashMessages: () => null,
}));

import { api } from "@/lib/api";
import { DailyLedgerView } from "./daily-ledger-view";

describe("DailyLedgerView run27 bugs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navState.searchParams = new URLSearchParams();
    ledgerState.current = makeLedger();
    vi.mocked(api.dailyLedger).mockImplementation(async () => ledgerState.current);
    vi.mocked(api.createDailyLedgerEntry).mockReset();
    vi.mocked(api.updateDailyLedgerEntry).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("T2 selecting empty day keeps ?date= and stays in day view (no auto-clear)", async () => {
    // Day missing from ledger.days (but inside from..to) — old code auto-cleared ?date=.
    navState.searchParams = new URLSearchParams("date=2026-10-29");
    const sparse = makeLedger({
      days: makeLedger().days.filter((d) => d.date !== "2026-10-29"),
    });
    ledgerState.current = sparse;
    vi.mocked(api.dailyLedger).mockImplementation(async () => ledgerState.current);

    render(
      <ConfirmProvider>
        <DailyLedgerView />
      </ConfirmProvider>,
    );

    expect(await screen.findByTestId("day-date")).toHaveTextContent("2026-10-29");
    expect(screen.getByTestId("shared-count")).toHaveTextContent("0");

    await waitFor(() => {
      expect(api.dailyLedger).toHaveBeenCalled();
    });

    // Must not kick user out of the empty day.
    expect(routerReplace).not.toHaveBeenCalledWith(
      "/daily-ledger",
      expect.anything(),
    );
    expect(routerPush).not.toHaveBeenCalledWith("/daily-ledger", expect.anything());
    expect(screen.getByTestId("day-view")).toBeTruthy();
    expect(screen.getByTestId("day-date")).toHaveTextContent("2026-10-29");
  });

    it("T3 after successful create, UI reflects expense from response without navigation", async () => {
    navState.searchParams = new URLSearchParams("date=2026-10-29");
    const afterCreate = makeLedger();
    const day = afterCreate.days.find((d) => d.date === "2026-10-29")!;
    day.shared.items.push({
      expenseId: "e-new",
      title: "چای تازه",
      amount: { amountMinor: "500000", currency: "IRR" },
      visibility: "shared",
      status: "posted",
    });
    day.shared.total = { amountMinor: "500000", currency: "IRR" };
    day.dayTotal = { amountMinor: "500000", currency: "IRR" };
    afterCreate.totals.shared = { amountMinor: "500000", currency: "IRR" };
    afterCreate.totals.grand = { amountMinor: "500000", currency: "IRR" };

    // POST returns the fresh ledger, but subsequent GET/load stays stale —
    // old code discarded the response and only relied on load(), so UI would stay empty.
    vi.mocked(api.createDailyLedgerEntry).mockResolvedValue(afterCreate);
    vi.mocked(api.dailyLedger).mockImplementation(async () => ledgerState.current);

    render(
      <ConfirmProvider>
        <DailyLedgerView />
      </ConfirmProvider>,
    );

    expect(await screen.findByTestId("day-date")).toHaveTextContent("2026-10-29");
    fireEvent.click(screen.getByRole("button", { name: "+ مشترک" }));

    const name = await screen.findByLabelText("نام کالا");
    fireEvent.change(name, { target: { value: "چای تازه" } });
    const unit = screen.getByLabelText("مبلغ واحد");
    fireEvent.change(unit, { target: { value: "50000" } });

    fireEvent.click(screen.getByRole("button", { name: "ثبت" }));

    await waitFor(() => {
      expect(api.createDailyLedgerEntry).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId("shared-titles")).toHaveTextContent("چای تازه");
    });

    expect(routerPush).not.toHaveBeenCalled();
    expect(screen.getByTestId("day-date")).toHaveTextContent("2026-10-29");
  });

  it("T4 date navigation uses router.push; closing draft modal does not push history", async () => {
    render(
      <ConfirmProvider>
        <DailyLedgerView />
      </ConfirmProvider>,
    );

    expect(await screen.findByRole("button", { name: "باز کردن روز خالی" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "باز کردن روز خالی" }));

    expect(routerPush).toHaveBeenCalled();
    const pushArg = routerPush.mock.calls[0]?.[0] as string;
    expect(pushArg).toContain("date=2026-10-29");
    expect(routerReplace).not.toHaveBeenCalledWith(
      expect.stringContaining("date=2026-10-29"),
      expect.anything(),
    );

    navState.searchParams = new URLSearchParams("date=2026-10-29");
    cleanup();
    routerPush.mockClear();
    routerReplace.mockClear();

    render(
      <ConfirmProvider>
        <DailyLedgerView />
      </ConfirmProvider>,
    );

    expect(await screen.findByTestId("day-view")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "+ مشترک" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();

    const pushCountBeforeClose = routerPush.mock.calls.length;
    const replaceCountBeforeClose = routerReplace.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "بستن مودال" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(routerPush.mock.calls.length).toBe(pushCountBeforeClose);
    expect(routerReplace.mock.calls.length).toBe(replaceCountBeforeClose);

    fireEvent.click(screen.getByRole("button", { name: "بازگشت به خلاصه بازه" }));
    expect(routerReplace).toHaveBeenCalled();
    const replaceArg = String(routerReplace.mock.calls.at(-1)?.[0] ?? "");
    expect(replaceArg).not.toContain("date=");
  });
});
