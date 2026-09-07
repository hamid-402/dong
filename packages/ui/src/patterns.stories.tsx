import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Badge, EmptyState, Table, Tabs, Toast } from "./patterns";

/**
 * Stories for the shared design-system patterns (dong-50 #35).
 * Grouped under "Patterns" — mirrors button.stories.tsx style.
 */
const meta: Meta = {
  title: "Patterns",
};

export default meta;
type Story = StoryObj;

export const BadgeTones: Story = {
  name: "Badge",
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Badge>خنثی</Badge>
      <Badge tone="ok">تأیید</Badge>
      <Badge tone="warn">هشدار</Badge>
      <Badge tone="danger">خطر</Badge>
      <Badge tone="gold">ویژه</Badge>
    </div>
  ),
};

export const EmptyStateBlock: Story = {
  name: "EmptyState",
  render: () => (
    <EmptyState
      title="هنوز چیزی اینجا نیست"
      description="با ثبت اولین مورد، فهرست اینجا نمایش داده می‌شود."
      action={<Badge tone="ok">اقدام واقعی</Badge>}
    />
  ),
};

export const TabsInteractive: Story = {
  name: "Tabs",
  render: () => {
    const [value, setValue] = useState("all");
    return (
      <Tabs
        aria-label="نمونه تب"
        value={value}
        onChange={setValue}
        items={[
          { id: "all", label: "همه" },
          { id: "shared", label: "جمعی" },
          { id: "private", label: "خصوصی" },
        ]}
      />
    );
  },
};

export const ToastTones: Story = {
  name: "Toast",
  render: () => (
    <div style={{ display: "grid", gap: 10 }}>
      <Toast tone="success">با موفقیت ذخیره شد</Toast>
      <Toast tone="error">خطایی رخ داد</Toast>
      <Toast tone="info">در حال همگام‌سازی…</Toast>
    </div>
  ),
};

export const DataTable: Story = {
  name: "Table",
  render: () => (
    <Table
      caption="نمونه جدول"
      headers={["عضو", "نقش", "مانده"]}
      rows={[
        ["حمید", "owner", "۱٬۲۰۰٬۰۰۰"],
        ["مریم", "member", "−۳۵۰٬۰۰۰"],
      ]}
    />
  ),
};
