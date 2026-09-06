"use client";

import Link from "next/link";
import { useState } from "react";
import { Amount, Button, SelectField, Surface, TextField, formatToman } from "@dang/ui";

export default function UiKitPage() {
  const [theme, setTheme] = useState<"dark" | "light">("light");

  return (
    <main
      className="page"
      dir="rtl"
      data-theme={theme}
      style={{ color: "var(--dang-text)", minHeight: "100vh" }}
    >
      <div className="ambient" aria-hidden />
      <header className="reviewBar">
        <div>
          <strong>دنگ همکاری</strong>
          <span> · کیت رابط</span>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            تم: {theme === "dark" ? "تیره" : "روشن"}
          </Button>
          <Link href="/">بازگشت</Link>
        </div>
      </header>

      <div style={{ display: "grid", gap: 20 }}>
        <Surface>
          <h1 style={{ marginTop: 0 }}>کامپوننت‌های پایه</h1>
          <p style={{ color: "var(--dang-muted)", maxWidth: "52ch" }}>
            این صفحه جایگزین موقت Storybook است تا قبل از راه‌اندازی کامل آن، RTL و
            هر دو تم بررسی شوند.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Button>اقدام اصلی</Button>
            <Button variant="secondary">خرید / توجه</Button>
            <Button variant="ghost">خنثی</Button>
            <Button variant="danger">حذف</Button>
            <Button size="sm" disabled>
              غیرفعال
            </Button>
          </div>
        </Surface>

        <Surface>
          <h2 style={{ marginTop: 0 }}>فرم</h2>
          <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
            <TextField label="عنوان هزینه" placeholder="مثلاً مصالح سقف" />
            <SelectField label="قالب Workspace" defaultValue="friends_family">
              <option value="friends_family">دوستان</option>
              <option value="household">خانواده</option>
              <option value="project_partners">شرکای پروژه</option>
            </SelectField>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
              نمونه مبلغ: <Amount toman={1_250_000} />
            </p>
            <p style={{ margin: 0, color: "var(--dang-muted)" }}>
              از ریال جزئی: <Amount irrMinor="12500000" /> ({formatToman(1_250_000)})
            </p>
          </div>
        </Surface>
      </div>
    </main>
  );
}
