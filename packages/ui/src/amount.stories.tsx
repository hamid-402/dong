import type { Meta, StoryObj } from "@storybook/react";
import { Amount } from "./amount";

const meta: Meta<typeof Amount> = {
  title: "Amount",
  component: Amount,
  args: {
    toman: 125000,
  },
};

export default meta;
type Story = StoryObj<typeof Amount>;

export const Toman: Story = {};

export const FromIrrMinor: Story = {
  args: { toman: undefined, irrMinor: "1250000" },
};

export const WithoutUnit: Story = {
  args: { showUnit: false },
};

export const Zero: Story = {
  args: { toman: 0 },
};
