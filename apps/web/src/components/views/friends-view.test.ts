import { describe, expect, it } from "vitest";
import { friendsSpaceInviteCta } from "./friends-view";

describe("friendsSpaceInviteCta", () => {
  it("hides dead invite control until a friend is selected", () => {
    expect(
      friendsSpaceInviteCta({
        canAddMember: false,
        hasWorkspaceId: true,
        hasSlug: true,
        hasSelectedFriend: false,
      }),
    ).toBe("hidden");
  });

  it("shows real invite link only with selected friend", () => {
    expect(
      friendsSpaceInviteCta({
        canAddMember: false,
        hasWorkspaceId: true,
        hasSlug: true,
        hasSelectedFriend: true,
      }),
    ).toBe("invite-link");
  });

  it("shows add-member for managers only when a friend is selected", () => {
    expect(
      friendsSpaceInviteCta({
        canAddMember: true,
        hasWorkspaceId: true,
        hasSlug: true,
        hasSelectedFriend: false,
      }),
    ).toBe("hidden");
    expect(
      friendsSpaceInviteCta({
        canAddMember: true,
        hasWorkspaceId: true,
        hasSlug: true,
        hasSelectedFriend: true,
      }),
    ).toBe("add-member");
  });
});
