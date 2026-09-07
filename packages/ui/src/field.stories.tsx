import type { Meta, StoryObj } from "@storybook/react";
import { TextField, SelectField } from "./field";

const meta: Meta<typeof TextField> = {
  title: "Field",
  component: TextField,
};

export default meta;
type Story = StoryObj<typeof TextField>;

export const Text: Story = {
  args: {
    label: "ایمیل",
    type: "email",
    placeholder: "you@example.com",
  },
};

export const Required: Story = {
  args: {
    label: "ایمیل",
    type: "email",
    required: true,
    placeholder: "you@example.com",
  },
};

export const WithError: Story = {
  args: {
    label: "ایمیل",
    type: "email",
    required: true,
    defaultValue: "not-an-email",
    hint: "آدرس ایمیل معتبر وارد کنید.",
    error: "فرمت ایمیل نادرست است.",
  },
};

export const Select: StoryObj<typeof SelectField> = {
  render: () => (
    <SelectField label="نقش" defaultValue="member">
      <option value="member">عضو</option>
      <option value="admin">ادمین</option>
    </SelectField>
  ),
};

export const SelectWithError: StoryObj<typeof SelectField> = {
  render: () => (
    <SelectField label="نقش" required error="انتخاب نقش الزامی است." defaultValue="">
      <option value="" disabled>
        انتخاب کنید
      </option>
      <option value="member">عضو</option>
      <option value="admin">ادمین</option>
    </SelectField>
  ),
};
