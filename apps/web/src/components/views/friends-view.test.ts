import { describe, expect, it } from "vitest";
import {
  FRIENDS_INVITE_SELECT_HINT,
  friendsInviteSelectHint,
  friendsSpaceInviteCta,
} from "./friends-view";

describe("friendsSpaceInviteCta", () => {
  it("keeps invite button visible but disabled when no friend is selected", () => {
    expect(
      friendsSpaceInviteCta({
        canAddMember: false,
        hasWorkspaceId: true,
        hasSlug: true,
        hasSelectedFriend: false,
      }),
    ).toBe("invite-disabled");
    expect(
      friendsSpaceInviteCta({
        canAddMember: true,
        hasWorkspaceId: true,
        hasSlug: true,
        hasSelectedFriend: false,
      }),
    ).toBe("invite-disabled");
    expect(friendsInviteSelectHint(false)).toBe(FRIENDS_INVITE_SELECT_HINT);
    expect(FRIENDS_INVITE_SELECT_HINT).toBe("اول یک دوست انتخاب کن");
  });

  it("enables real invite link when a friend is selected", () => {
    expect(
      friendsSpaceInviteCta({
        canAddMember: false,
        hasWorkspaceId: true,
        hasSlug: true,
        hasSelectedFriend: true,
      }),
    ).toBe("invite-link");
    expect(friendsInviteSelectHint(true)).toBeNull();
  });

  it("enables add-member for managers when a friend is selected", () => {
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
