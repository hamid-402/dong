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

export const Select: StoryObj<typeof SelectField> = {
  render: () => (
    <SelectField label="نقش" defaultValue="member">
      <option value="member">عضو</option>
      <option value="admin">ادمین</option>
    </SelectField>
  ),
};
