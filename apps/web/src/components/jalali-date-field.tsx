"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  JALALI_MONTH_FA,
  WEEKDAY_FA_SAT_FIRST,
  formatJalaliIso,
  gregorianToJalali,
  isoFromJalali,
  jalaliMonthLength,
  parseIsoToJalali,
  weekdayIndexSatFirst,
} from "@dang/contracts";

export type JalaliDateFieldProps = {
  label: ReactNode;
  value: string;
  onChange: (isoDate: string) => void;
  hint?: ReactNode;
  disabled?: boolean;
  id?: string;
  placeholder?: string;
};

type ViewMonth = { jy: number; jm: number };

type DayCell = {
  jd: number;
  iso: string;
  /** 0=شنبه … 6=جمعه */
  col: number;
  /** 1-based row in month grid */
  row: number;
};

type PopCoords = { top: number; left: number; width: number };

function todayJalali(): { jy: number; jm: number; jd: number } {
  const now = new Date();
  return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function utcWeekdayFromIso(iso: string): number {
  // ظهر UTC تا حاشیهٔ نیمه‌شب/منطقهٔ زمانی جابه‌جا نکند
  return new Date(`${iso}T12:00:00.000Z`).getUTCDay();
}

/** روزهای ماه با ستون شنبه‌اول — مستقل از direction صفحه */
function buildMonthDays(jy: number, jm: number): DayCell[] {
  const len = jalaliMonthLength(jy, jm);
  const firstIso = isoFromJalali(jy, jm, 1);
  const startCol = weekdayIndexSatFirst(utcWeekdayFromIso(firstIso));
  const days: DayCell[] = [];
  for (let jd = 1; jd <= len; jd += 1) {
    const iso = isoFromJalali(jy, jm, jd);
    const col = weekdayIndexSatFirst(utcWeekdayFromIso(iso));
    const row = Math.floor((jd - 1 + startCol) / 7) + 1;
    days.push({ jd, iso, col, row });
  }
  return days;
}

function formatTodayIso(): string {
  const t = todayJalali();
  return isoFromJalali(t.jy, t.jm, t.jd);
}

const WEEKDAY_SHORT = WEEKDAY_FA_SAT_FIRST.map((w) => w.charAt(0));
const POP_EST_HEIGHT = 340;

export function JalaliDateField({
  label,
  value,
  onChange,
  hint,
  disabled,
  id,
  placeholder = "انتخاب تاریخ شمسی",
}: JalaliDateFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<PopCoords | null>(null);
  const selected = value ? parseIsoToJalali(value) : null;
  const [view, setView] = useState<ViewMonth>(() => {
    const t = selected ?? todayJalali();
    return { jy: t.jy, jm: t.jm };
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = value ? parseIsoToJalali(value) : null;
    const cur = t ?? todayJalali();
    setView({ jy: cur.jy, jm: cur.jm });
  }, [open, value]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(300, Math.max(r.width, 260));
      const rtl =
        getComputedStyle(document.documentElement).direction === "rtl" ||
        getComputedStyle(el).direction === "rtl";
      let left = rtl ? r.right - width : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = r.bottom + 6;
      if (top + POP_EST_HEIGHT > window.innerHeight - 8) {
        top = Math.max(8, r.top - POP_EST_HEIGHT - 6);
      }
      setCoords({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // defer so the opening click does not immediately close
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
    }, 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shiftMonth = (delta: number) => {
    setView((v) => {
      let jm = v.jm + delta;
      let jy = v.jy;
      if (jm < 1) {
        jm = 12;
        jy -= 1;
      } else if (jm > 12) {
        jm = 1;
        jy += 1;
      }
      return { jy, jm };
    });
  };

  const days = buildMonthDays(view.jy, view.jm);
  const rowCount = days.length ? days[days.length - 1]!.row : 1;
  const display = value ? formatJalaliIso(value) : "";
  const todayIso = formatTodayIso();

  const popStyle: CSSProperties | undefined = coords
    ? {
        top: coords.top,
        left: coords.left,
        width: coords.width,
      }
    : undefined;

  const pop =
    open && mounted && coords
      ? createPortal(
          <div
            className="jdfPop jdfPop--portal"
            role="dialog"
            aria-label="تقویم شمسی"
            ref={popRef}
            style={popStyle}
          >
            <div className="jdfNav">
              <button
                type="button"
                className="jdfNavBtn"
                onClick={() => shiftMonth(1)}
                aria-label="ماه بعد"
              >
                ‹
              </button>
              <div className="jdfTitle">
                {JALALI_MONTH_FA[view.jm - 1]} {view.jy}
              </div>
              <button
                type="button"
                className="jdfNavBtn"
                onClick={() => shiftMonth(-1)}
                aria-label="ماه قبل"
              >
                ›
              </button>
            </div>
            <div className="jdfWeekdays" aria-hidden>
              {WEEKDAY_SHORT.map((w, i) => (
                <span key={WEEKDAY_FA_SAT_FIRST[i]} style={{ gridColumn: i + 1 }}>
                  {w}
                </span>
              ))}
            </div>
            <div
              className="jdfGrid"
              style={{ gridTemplateRows: `repeat(${rowCount}, minmax(32px, auto))` }}
            >
              {days.map((cell) => {
                const cls =
                  cell.iso === value
                    ? "jdfDay isSelected"
                    : cell.iso === todayIso
                      ? "jdfDay isToday"
                      : "jdfDay";
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    className={cls}
                    style={{ gridColumn: cell.col + 1, gridRow: cell.row }}
                    onClick={() => {
                      onChange(cell.iso);
                      setOpen(false);
                    }}
                  >
                    {cell.jd}
                  </button>
                );
              })}
            </div>
            <div className="jdfFooter">
              <button
                type="button"
                className="jdfTodayBtn"
                onClick={() => {
                  const t = todayJalali();
                  onChange(isoFromJalali(t.jy, t.jm, t.jd));
                  setOpen(false);
                }}
              >
                امروز
              </button>
              {value ? (
                <button
                  type="button"
                  className="jdfClearBtn"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  پاک کردن
                </button>
              ) : null}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="jdf" ref={rootRef}>
      <label className="jdfLabel" htmlFor={inputId}>
        <span className="jdfLabelText">{label}</span>
        <button
          type="button"
          id={inputId}
          ref={triggerRef}
          className="jdfTrigger"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <span className={display ? "jdfValue" : "jdfPlaceholder"}>
            {display || placeholder}
          </span>
          <span className="jdfIcon" aria-hidden>
            ▾
          </span>
        </button>
      </label>
      {hint ? <span className="jdfHint">{hint}</span> : null}
      {pop}
    </div>
  );
}
