import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import { Modal } from "./modal";

function ModalDemo() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        باز کردن
      </Button>
      <Modal open={open} title="نمونه مودال" onClose={() => setOpen(false)}>
        <p style={{ margin: 0 }}>محتوای تعاملی داخل مودال.</p>
        <div style={{ marginTop: 16 }}>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            بستن
          </Button>
        </div>
      </Modal>
    </>
  );
}

const meta: Meta<typeof ModalDemo> = {
  title: "Modal",
  component: ModalDemo,
};

export default meta;
type Story = StoryObj<typeof ModalDemo>;

export const Open: Story = {};
