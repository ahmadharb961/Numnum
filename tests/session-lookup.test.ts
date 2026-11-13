import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { hmac } from "@/server/crypto";
import { userForSessionToken } from "@/server/auth";
import { resetDb } from "./helpers";

beforeEach(resetDb);

async function userWithSession(opts: { roles?: ("ADMIN" | "CUSTOMER" | "RESTAURANT")[]; disabled?: boolean; expiresInMs?: number; phone?: string | null } = {}) {
  const u = await prisma.user.create({ data: { email: `u${Math.random()}@test.dev`, passwordHash: "x", name: "Rami", phone: opts.phone ?? null, disabled: opts.disabled ?? false, roles: { create: (opts.roles ?? []).map((role) => ({ role })) } } });
  const token = `tok-${Math.random()}`;
  await prisma.session.create({ data: { tokenHash: hmac(token), userId: u.id, expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 3600_000)) } });
  return { u, token };
}

describe("signed-in user from the session cookie", () => {
  it("returns the user with all their roles", async () => {
    const { u, token } = await userWithSession({ roles: ["ADMIN", "CUSTOMER"], phone: "96170111222" });
    const got = await userForSessionToken(token);
    expect(got).toMatchObject({ id: u.id, email: u.email, name: "Rami", phone: "96170111222" });
    expect([...got!.roles].sort()).toEqual(["ADMIN", "CUSTOMER"]);
  });

  it("works for a user with no role yet", async () => {
    const { token } = await userWithSession();
    expect(await userForSessionToken(token)).toMatchObject({ roles: [], phone: null });
  });

  it("refuses expired sessions, disabled users and unknown tokens", async () => {
    expect(await userForSessionToken((await userWithSession({ expiresInMs: -1000 })).token)).toBeNull();
    expect(await userForSessionToken((await userWithSession({ disabled: true, roles: ["ADMIN"] })).token)).toBeNull();
    expect(await userForSessionToken("not-a-real-token")).toBeNull();
  });

  it("never mixes up two users", async () => {
    const a = await userWithSession({ roles: ["ADMIN"] });
    const b = await userWithSession({ roles: ["CUSTOMER"] });
    expect((await userForSessionToken(a.token))?.id).toBe(a.u.id);
    expect((await userForSessionToken(b.token))?.roles).toEqual(["CUSTOMER"]);
  });
});
