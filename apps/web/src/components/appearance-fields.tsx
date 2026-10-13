"use client";

import { APP_MOTIONS, APP_THEMES, useOptionalTheme } from "@/lib/theme";

/** Four themes plus the existing motion and density controls. */
export function AppearanceFields() {
  const themeApi = useOptionalTheme();
  if (!themeApi) return null;
  const { theme, density, motion, setTheme, setDensity, setMotion } = themeApi;

  return (
    <div className="appearance-fields">
      <section>
        <p className="appearance-panel__heading">تم رابط</p>
        <p className="appearance-panel__sub">سفید، مشکی، کاغذی یا سرمه‌ای</p>
        <ul className="appearance-theme-grid appearance-theme-grid--wide" role="list">
          {APP_THEMES.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={
                  item.id === theme
                    ? "appearance-theme-option is-active"
                    : "appearance-theme-option"
                }
                data-theme-preview={item.id}
                onClick={() => setTheme(item.id)}
                aria-pressed={item.id === theme}
              >
                <span
                  className={`appearance-theme-preview appearance-theme-preview--${item.id}`}
                  aria-hidden
                />
                <strong>{item.label}</strong>
                <small>{item.caption}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <p className="appearance-panel__heading">حرکت</p>
        <ul className="appearance-bg-grid" role="list">
          {APP_MOTIONS.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={
                  item.id === motion
                    ? "appearance-bg-option is-active"
                    : "appearance-bg-option"
                }
                onClick={() => setMotion(item.id)}
                aria-pressed={item.id === motion}
                title={`${item.hint} (${item.levels})`}
              >
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <label className="appearance-density-row">
        <span>
          <strong>نمای فشرده</strong>
          <small>تراکم بیشتر برای فهرست‌ها؛ کنترل‌ها حداقل ۴۴</small>
        </span>
        <span className="appearance-switch">
          <input
            type="checkbox"
            checked={density === "compact"}
            onChange={(event) =>
              setDensity(event.target.checked ? "compact" : "comfortable")
            }
            aria-label="نمای فشرده"
          />
          <span aria-hidden />
        </span>
      </label>
    </div>
  );
}
