import type { Preview } from "@storybook/react";
import "../src/tokens.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    backgrounds: {
      default: "dang",
      values: [{ name: "dang", value: "#f4f7f6" }],
    },
  },
};

export default preview;
