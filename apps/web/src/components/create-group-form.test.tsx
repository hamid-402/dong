/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateGroupForm, GroupCreatedNext } from "./create-group-form";

const createWorkspace = vi.fn();
const selectWorkspace = vi.fn();
const refreshChrome = vi.fn();

vi.mock("@/lib/use-app-chrome", () => ({
  useAppChrome: () => ({
    capabilities: null,
    selectWorkspace,
    refreshChrome,
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    createWorkspace: (...args: unknown[]) => createWorkspace(...args),
    profile: vi.fn(),
  },
}));

describe("CreateGroupForm", () => {
  beforeEach(() => {
    createWorkspace.mockReset();
    selectWorkspace.mockReset();
    refreshChrome.mockReset();
  });
  afterEach(() => cleanup());

  it("asks for a name and does not ask for a public id", () => {
    render(<CreateGroupForm onCreated={() => undefined} />);
    expect(screen.getByLabelText(/نام گروه/)).toBeTruthy();
    expect(screen.queryByLabelText(/شناسه/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ساخت گروه" }));
    expect(screen.getByRole("alert").textContent).toMatch(/نام گروه/);
    expect(createWorkspace).not.toHaveBeenCalled();
  });

  it("shows the public id only after the group exists", async () => {
    createWorkspace.mockResolvedValue({
      id: "ws-1",
      name: "سفر شمال",
      slug: "friends-safar-ab12",
      template: "friends_family",
    });
    const onCreated = vi.fn();
    const { rerender } = render(<CreateGroupForm onCreated={onCreated} />);
    fireEvent.change(screen.getByLabelText(/نام گروه/), { target: { value: "سفر شمال" } });
    fireEvent.click(screen.getByRole("button", { name: "ساخت گروه" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
    expect(createWorkspace.mock.calls[0]?.[0]).toMatchObject({
      name: "سفر شمال",
      template: "friends_family",
    });
    expect(String(createWorkspace.mock.calls[0]?.[0].slug)).toMatch(/^[a-z0-9-]+$/);
    rerender(
      <GroupCreatedNext
        workspace={{
          id: "ws-1",
          name: "سفر شمال",
          slug: "friends-safar-ab12",
          template: "friends_family",
          timezone: "Asia/Tehran",
          displayUnit: "toman",
        }}
      />,
    );
    expect(screen.getByText("friends-safar-ab12")).toBeTruthy();
    expect(screen.getByRole("link", { name: "دعوت" }).getAttribute("href")).toContain(
      "#invite-create-panel",
    );
  });
});
