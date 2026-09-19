import assert from "node:assert/strict";
import test from "node:test";
import { MemoryAccountStore } from "../auth/memory-account.store.js";
import { hashPassword } from "../auth/password.js";
import { MemorySocialStore } from "./memory-social.store.js";
import { SocialService } from "./social.service.js";

async function seedUser(accounts: MemoryAccountStore, email: string, username: string) {
  const phone =
    username.startsWith("alice") ? `+98911${username.length}111111`.slice(0, 13) : `+98912${username.length}222222`.slice(0, 13);
  return accounts.createLocalUser({
    email,
    displayName: username,
    passwordHash: await hashPassword("StrongPass1!"),
    username,
    phone,
  });
}

test("S11-02 friend request accept flow", async () => {
  const accounts = new MemoryAccountStore();
  const social = new MemorySocialStore();
  const service = new SocialService(social, accounts);
  const alice = await seedUser(accounts, "a@example.com", "alice");
  const bob = await seedUser(accounts, "b@example.com", "bob");
  const actorA = {
    userId: alice.userId,
    externalSubject: alice.externalSubject,
    displayName: alice.displayName,
    authMode: "password" as const,
  };
  const actorB = {
    userId: bob.userId,
    externalSubject: bob.externalSubject,
    displayName: bob.displayName,
    authMode: "password" as const,
  };

  const req = await service.requestFriend(actorA, { targetUserId: bob.userId });
  assert.equal(req.status, "pending");
  assert.equal(req.outgoing, true);

  const incoming = await service.listRequests(actorB, "incoming");
  assert.equal(incoming.length, 1);

  const accepted = await service.acceptRequest(actorB, req.id);
  assert.equal(accepted.status, "accepted");
  const friends = await service.listFriends(actorA);
  assert.equal(friends.length, 1);
  assert.equal(friends[0]?.otherUser.username, "bob");
});

test("S11-02 cancel outgoing friend request", async () => {
  const accounts = new MemoryAccountStore();
  const social = new MemorySocialStore();
  const service = new SocialService(social, accounts);
  const alice = await seedUser(accounts, "a-cancel@example.com", "alicecancel");
  const bob = await seedUser(accounts, "b-cancel@example.com", "bobcancel");
  const actorA = {
    userId: alice.userId,
    externalSubject: alice.externalSubject,
    displayName: alice.displayName,
    authMode: "password" as const,
  };
  const actorB = {
    userId: bob.userId,
    externalSubject: bob.externalSubject,
    displayName: bob.displayName,
    authMode: "password" as const,
  };

  const req = await service.requestFriend(actorA, { targetUserId: bob.userId });
  assert.equal((await service.listRequests(actorA, "outgoing")).length, 1);
  await service.cancelOutgoingRequest(actorA, req.id);
  assert.equal((await service.listRequests(actorA, "outgoing")).length, 0);
  assert.equal((await service.listRequests(actorB, "incoming")).length, 0);
});

test("S11-12 block then list includes; unblock removes", async () => {
  const accounts = new MemoryAccountStore();
  const social = new MemorySocialStore();
  const service = new SocialService(social, accounts);
  const alice = await seedUser(accounts, "a-block@example.com", "aliceblock");
  const bob = await seedUser(accounts, "b-block@example.com", "bobblock");
  const actorA = {
    userId: alice.userId,
    externalSubject: alice.externalSubject,
    displayName: alice.displayName,
    authMode: "password" as const,
  };
  const actorB = {
    userId: bob.userId,
    externalSubject: bob.externalSubject,
    displayName: bob.displayName,
    authMode: "password" as const,
  };

  assert.deepEqual(await service.listBlocks(actorA), []);

  await service.block(actorA, bob.userId);
  const blocked = await service.listBlocks(actorA);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0]?.userId, bob.userId);
  assert.equal(blocked[0]?.displayName, bob.displayName);
  assert.ok(blocked[0]?.blockedAt);
  assert.deepEqual(await service.listBlocks(actorB), []);

  await service.unblock(actorA, bob.userId);
  assert.deepEqual(await service.listBlocks(actorA), []);
});

test("S11-02 directory lookup is exact and respects privacy", async () => {
  const accounts = new MemoryAccountStore();
  const social = new MemorySocialStore();
  const service = new SocialService(social, accounts);
  const alice = await seedUser(accounts, "a2@example.com", "alice2");
  const bob = await seedUser(accounts, "b2@example.com", "bob2");
  const actorA = {
    userId: alice.userId,
    externalSubject: alice.externalSubject,
    displayName: alice.displayName,
    authMode: "password" as const,
  };

  const found = await service.lookup(actorA, { username: "bob2" });
  assert.equal(found?.username, "bob2");

  const partial = await service.lookup(actorA, { username: "bo" });
  assert.equal(partial, null);

  await service.updatePrivacy(
    {
      userId: bob.userId,
      externalSubject: bob.externalSubject,
      displayName: bob.displayName,
      authMode: "password",
    },
    { findableByUsername: false },
  );
  const hidden = await service.lookup(actorA, { username: "bob2" });
  assert.equal(hidden, null);
});
