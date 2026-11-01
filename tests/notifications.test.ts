import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture pushes and emails instead of sending them.
const pushes = vi.hoisted(() => [] as { endpoint: string; payload: Record<string, unknown> }[]);
const emails = vi.hoisted(() => [] as { to: string; subject: string; text: string }[]);
vi.mock("web-push", () => ({
  default: {
    generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }),
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, body: string) => {
      pushes.push({ endpoint: sub.endpoint, payload: JSON.parse(body) });
    },
  },
}));
vi.mock("@/server/email", () => ({
  sendEmail: async (to: string, subject: string, text: string) => {
    emails.push({ to, subject, text });
    return true;
  },
  sendRichEmail: async (to: string, subject: string, _html: string, text: string) => {
    emails.push({ to, subject, text });
    return true;
  },
}));

import { prisma } from "@/server/db";
import { audienceDevices, audienceReach, canSeeBroadcast, sendBroadcast } from "@/server/broadcast";
import { createOrder, restaurantOrderAction } from "@/server/orders";
import { makeCustomer, makeRestaurant, orderPayload, resetDb } from "./helpers";

const sub = (userId: string | null, n: string) => prisma.pushSubscription.create({ data: { userId, endpoint: `https://push.test/${n}`, p256dh: "p256dh-key-xxxx", auth: "auth-key-x" } });
const settle = () => new Promise((r) => setTimeout(r, 300));

let customer: { id: string; email: string };
let quiet: { id: string; email: string };
let admin: { id: string };
let f: Awaited<ReturnType<typeof makeRestaurant>>;

beforeEach(async () => {
  await resetDb();
  pushes.length = 0;
  emails.length = 0;
  customer = await makeCustomer();
  quiet = await makeCustomer(); // never turned notifications on
  admin = await prisma.user.create({ data: { email: "admin@test.dev", passwordHash: "x", name: "Admin", roles: { create: { role: "ADMIN" } } } });
  f = await makeRestaurant();
  await sub(customer.id, "c1");
  await sub(customer.id, "c2"); // second device
  await sub(f.user.id, "owner");
  await sub(admin.id, "admin");
  await sub(null, "guest"); // browsing without an account
});

describe("admin push broadcasts", () => {
  it("reaches each audience's devices, guests counting as customers", async () => {
    expect(await audienceReach(audienceDevices("everyone"))).toEqual({ people: 4, devices: 5 });
    expect(await audienceReach(audienceDevices("customers"))).toEqual({ people: 2, devices: 3 });
    expect(await audienceReach(audienceDevices("restaurants"))).toEqual({ people: 1, devices: 1 });
    expect(await audienceReach(audienceDevices("restaurant", { restaurantId: f.restaurant.id }))).toEqual({ people: 1, devices: 1 });
    expect(await audienceReach(audienceDevices("user", { userId: quiet.id }))).toEqual({ people: 0, devices: 0 });
  });

  it("validates content, link and target", async () => {
    expect(await sendBroadcast({ audience: "everyone" }, admin.id)).toMatchObject({ ok: false, fieldErrors: { title: expect.any(String) } });
    expect(await sendBroadcast({ audience: "everyone", title: "Hi", link: "javascript:alert(1)" }, admin.id)).toMatchObject({ ok: false, fieldErrors: { link: expect.any(String) } });
    expect(await sendBroadcast({ audience: "user", title: "Hi", email: "nobody@test.dev" }, admin.id)).toMatchObject({ ok: false, fieldErrors: { email: "No account with this email" } });
    expect(await sendBroadcast({ audience: "user", title: "Hi", email: quiet.email }, admin.id)).toMatchObject({ ok: false, error: expect.stringMatching(/haven't turned on/) });
    expect(pushes).toHaveLength(0);
  });

  it("sends a persistent notification with photo and link, and records it", async () => {
    const r = await sendBroadcast({ audience: "customers", title: "Weekend offer", body: "Free delivery", imageUrl: "/media/i/abc.webp", link: "/r/rest-1" }, admin.id);
    expect(r).toEqual({ ok: true, people: 2, devices: 3, delivered: 3 });
    expect(pushes.map((p) => p.endpoint).sort()).toEqual(["https://push.test/c1", "https://push.test/c2", "https://push.test/guest"]);
    const row = await prisma.pushBroadcast.findFirstOrThrow();
    // tapping it opens the message page (which shows the photo and the link as a button)
    expect(pushes[0].payload).toMatchObject({ title: "Weekend offer", body: "Free delivery", url: `/m/${row.id}`, requireInteraction: true });
    expect(String(pushes[0].payload.image)).toMatch(/\/media\/i\/abc\.webp$/);
    expect(row).toMatchObject({ audience: "customers", recipients: 2, devices: 3, delivered: 3, createdById: admin.id, link: "/r/rest-1", imageUrl: "/media/i/abc.webp" });
    expect(await prisma.notification.count({ where: { type: "BROADCAST" } })).toBe(0); // customers: no dashboard copy
    expect(await canSeeBroadcast(row, row.id, null)).toBe(true);
  });

  it("restaurant broadcasts land in the dashboard notifications with the photo, visible only to them", async () => {
    const r = await sendBroadcast({ audience: "restaurants", title: "New feature", body: "Upload reels in HD", imageUrl: "/media/i/promo.webp" }, admin.id);
    expect(r).toMatchObject({ ok: true });
    const row = await prisma.pushBroadcast.findFirstOrThrow();
    expect(pushes.map((p) => p.payload.url)).toEqual([`/m/${row.id}`]);
    const n = await prisma.notification.findFirstOrThrow({ where: { restaurantId: f.restaurant.id, type: "BROADCAST" } });
    expect(n).toMatchObject({ audience: "RESTAURANT", title: "New feature", body: "Upload reels in HD", imageUrl: "/media/i/promo.webp", link: `/m/${row.id}`, readAt: null });
    const owner = await prisma.user.findFirstOrThrow({ where: { staff: { some: { restaurantId: f.restaurant.id } } }, include: { roles: true } });
    expect(await canSeeBroadcast(row, row.id, { id: owner.id, roles: owner.roles.map((x) => x.role) })).toBe(true);
    expect(await canSeeBroadcast(row, row.id, { id: customer.id, roles: ["CUSTOMER"] })).toBe(false);
    expect(await canSeeBroadcast(row, row.id, null)).toBe(false);
    pushes.length = 0;
    // one restaurant: only that restaurant gets it and can open it
    const other = await makeRestaurant();
    await sendBroadcast({ audience: "restaurant", restaurantId: f.restaurant.id, title: "Just for you" }, admin.id);
    const one = await prisma.pushBroadcast.findFirstOrThrow({ where: { title: "Just for you" } });
    expect(await prisma.notification.count({ where: { link: `/m/${one.id}` } })).toBe(1);
    expect(await canSeeBroadcast(one, one.id, { id: other.user.id, roles: ["RESTAURANT"] })).toBe(false);
    expect(await canSeeBroadcast(one, one.id, { id: owner.id, roles: ["RESTAURANT"] })).toBe(true);
  });

  it("targets one restaurant's staff or one person by email", async () => {
    await sendBroadcast({ audience: "restaurant", restaurantId: f.restaurant.id, body: "Your invoice is ready" }, admin.id);
    expect(pushes.map((p) => p.endpoint)).toEqual(["https://push.test/owner"]);
    pushes.length = 0;
    await sendBroadcast({ audience: "user", email: customer.email, title: "Hello" }, admin.id);
    expect(pushes.map((p) => p.endpoint).sort()).toEqual(["https://push.test/c1", "https://push.test/c2"]);
    const hello = await prisma.pushBroadcast.findFirstOrThrow({ where: { title: "Hello" } });
    expect(await canSeeBroadcast(hello, hello.id, { id: customer.id, roles: ["CUSTOMER"] })).toBe(true);
    expect(await canSeeBroadcast(hello, hello.id, { id: admin.id, roles: ["ADMIN"] })).toBe(true);
    expect(await canSeeBroadcast(hello, hello.id, null)).toBe(false);
  });
});

describe("order notifications", () => {
  it("emails the restaurant for every new order", async () => {
    await prisma.restaurant.update({ where: { id: f.restaurant.id }, data: { email: "orders@burger.test" } });
    const o = await createOrder(orderPayload(f, "notif-order-1-xxxxxxxxxxxx"), { deviceKey: "dev-notif-1-aaaaaaaaa", ipHash: null, userId: customer.id });
    await settle();
    const mail = emails.filter((e) => e.subject.includes(o.reference));
    expect(mail.map((e) => e.to).sort()).toEqual([f.user.email, "orders@burger.test"].sort());
    expect(mail[0].text).toContain("2× Double Smash Burger (Extra cheese, BBQ sauce)");
    expect(mail[0].text).toContain(`/dashboard/orders?ref=${o.reference}`);
  });

  it("pushes each status change to the customer", async () => {
    const o = await createOrder(orderPayload(f, "notif-order-2-xxxxxxxxxxxx"), { deviceKey: "dev-notif-2-aaaaaaaaa", ipHash: null, userId: customer.id });
    const order = await prisma.order.findUniqueOrThrow({ where: { reference: o.reference } });
    await settle();
    pushes.length = 0;
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "ACCEPT", { etaMinutes: 30 });
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "DISPATCH");
    await restaurantOrderAction(f.restaurant.id, f.user.id, order.id, "COMPLETE");
    await settle();
    const toCustomer = pushes.filter((p) => p.endpoint === "https://push.test/c1");
    expect(toCustomer).toHaveLength(3);
    expect(toCustomer.every((p) => p.payload.url === `/order/${o.reference}`)).toBe(true);
  });
});
