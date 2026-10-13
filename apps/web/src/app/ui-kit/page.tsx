"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  ConfirmDialog,
  EmptyState,
  PasswordInput,
  RadioGroup,
  SelectField,
  Skeleton,
  Spinner,
  Switch,
  Tabs,
  TextField,
  TextareaField,
  Toast,
} from "@dang/ui";

const KIT_THEMES = ["paper", "white", "black", "midnight"] as const;
const KIT_LABELS = {
  paper: "کاغذی",
  white: "سفید",
  black: "مشکی",
  midnight: "سرمه‌ای",
} as const;

export default function UiKitPage() {
  const [theme, setTheme] = useState<(typeof KIT_THEMES)[number]>("paper");
  const [tab, setTab] = useState("fields");
  const [agree, setAgree] = useState(false);
  const [split, setSplit] = useState("equal");
  const [notify, setNotify] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scheme = theme === "black" || theme === "midnight" ? "dark" : "light";

  return (
    <main
      className="page"
      dir="rtl"
      data-theme={theme}
      style={{
        background: "var(--dang-bg)",
        color: "var(--dang-text)",
        colorScheme: scheme,
        minHeight: "100vh",
        padding: 16,
      }}
    >
      <header className="reviewBar">
        <div>
          <strong>دنگ همکاری</strong>
          <span> · قرارداد کامپوننت</span>
        </div>
        <Link href="/">بازگشت</Link>
      </header>

      <div className="dang-form">
        <Tabs
          aria-label="تم کیت"
          items={KIT_THEMES.map((id) => ({ id, label: KIT_LABELS[id] }))}
          value={theme}
          onChange={(id) => {
            if (KIT_THEMES.includes(id as (typeof KIT_THEMES)[number])) {
              setTheme(id as (typeof KIT_THEMES)[number]);
            }
          }}
        />

        <Card>
          <h1 style={{ marginTop: 0 }}>دکمه</h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Button>اصلی</Button>
            <Button variant="secondary">ثانویه</Button>
            <Button variant="ghost">روح</Button>
            <Button variant="danger">حذف</Button>
            <Button size="sm" icon={<Spinner />}>
              با آیکون
            </Button>
            <Button loading>در حال انجام</Button>
            <Button disabled>غیرفعال</Button>
            <Button variant="secondary" disabled>
              ثانویه غیرفعال
            </Button>
            <Button variant="danger" disabled>
              خطر غیرفعال
            </Button>
          </div>
        </Card>

        <Card>
          <h2 style={{ marginTop: 0 }}>فیلد</h2>
          <Tabs
            aria-label="نمونه فرم"
            items={[
              { id: "fields", label: "متن" },
              { id: "choice", label: "انتخاب" },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === "fields" ? (
            <div className="dang-form" style={{ maxWidth: 420, marginTop: 12 }}>
              <TextField label="عنوان" placeholder="مثلاً ناهار" hint="شرح کوتاه خرج" />
              <TextField label="ایمیل" type="email" error="ایمیل را کامل کنید" defaultValue="a@" />
              <PasswordInput label="رمز" autoComplete="current-password" required />
              <TextareaField label="یادداشت" hint="اختیاری" />
              <SelectField label="قالب" defaultValue="friends_family">
                <option value="friends_family">دوستان</option>
                <option value="household">خانواده</option>
              </SelectField>
            </div>
          ) : (
            <div className="dang-form" style={{ marginTop: 12 }}>
              <Checkbox label="شرایط را خواندم" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
              <RadioGroup
                label="تقسیم"
                name="kit-split"
                value={split}
                onChange={setSplit}
                options={[
                  { value: "equal", label: "مساوی" },
                  { value: "custom", label: "دلخواه" },
                ]}
              />
              <Switch label="اعلان تسویه" checked={notify} onCheckedChange={setNotify} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <Chip pressed={split === "equal"} onClick={() => setSplit("equal")}>
                  مساوی
                </Chip>
                <Chip pressed={split === "custom"} onClick={() => setSplit("custom")}>
                  دلخواه
                </Chip>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <h2 style={{ marginTop: 0 }}>بازخورد</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <Badge>خنثی</Badge>
            <Badge tone="ok">طلبکار</Badge>
            <Badge tone="warn">هشدار</Badge>
            <Badge tone="danger">بدهکار</Badge>
            <Badge tone="info">اطلاع</Badge>
            <Badge tone="gold">ساختمان</Badge>
          </div>
          <div className="dang-form">
            <Alert tone="info" title="اطلاع">
              مبلغ هنوز ثبت نشده.
            </Alert>
            <Alert tone="success">تسویه ثبت شد.</Alert>
            <Alert tone="warning">این ادعا هنوز تأیید نشده.</Alert>
            <Alert tone="danger">حذف برگشت‌پذیر نیست.</Alert>
            {toast ? (
              <Toast tone="success" onDismiss={() => setToast(null)}>
                {toast}
              </Toast>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setToast("خروجی آماده شد");
                  setConfirmOpen(true);
                }}
              >
                نمونه تأیید و اعلان
              </Button>
            )}
            <EmptyState title="خرجی نیست" description="اولین خرج را ثبت کنید." action={<Button size="sm">ثبت خرج</Button>} />
            <Skeleton height="0.875rem" width="40%" />
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="حذف خرج"
        description="این خرج برای همیشه از فهرست حذف شود؟"
        confirmLabel="حذف"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
      />
    </main>
  );
}
