import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";
import { Modal } from "./modal";
import { TextField } from "./field";

function ModalDemo() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        باز کردن
      </Button>
      <Modal open={open} title="نمونه مودال" onClose={() => setOpen(false)}>
        <p style={{ margin: "0 0 1rem" }}>
          Escape ببندد، Tab داخل دیالوگ بماند، کلیک روی پس‌زمینه هم می‌بندد.
        </p>
        <TextField label="نام" required hint="برای تست فوکوس و تب‌ترپ." />
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            بستن
          </Button>
          <Button type="button" onClick={() => setOpen(false)}>
            تأیید
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
