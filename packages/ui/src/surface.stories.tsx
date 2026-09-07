import type { Meta, StoryObj } from "@storybook/react";
import { Surface } from "./surface";

const meta: Meta<typeof Surface> = {
  title: "Surface",
  component: Surface,
  args: {
    children: "محتوای سطح — کارت پایه با خط و شعاع طراحی.",
  },
};

export default meta;
type Story = StoryObj<typeof Surface>;

export const Default: Story = {};

export const Flush: Story = {
  args: { padded: false, children: "بدون فاصلهٔ داخلی (padded=false)" },
};

export const AsArticle: Story = {
  args: { as: "article", children: "با تگ article" },
};
