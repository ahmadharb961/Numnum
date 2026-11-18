import { describe, expect, it } from "vitest";

describe("where restaurants pay (Whish)", () => {
  it("numnum's number when none, or the old demo placeholder, is saved; an admin's own is kept", async () => {
    const { realWhish } = await import("@/server/settings");
    const { transferNote } = await import("@/lib/whish");
    const demo = realWhish({ recipientName: "numnum Demo Account", whishNumber: "70 000 000", accountId: "NUMNUM-DEMO", instructions: "Send the exact amount due via Whish Money and include the invoice number in the transfer note." });
    expect(demo).toMatchObject({ recipientName: "numnum", whishNumber: "76066652", accountId: "" });
    expect(demo.instructions).toMatch(/restaurant name/);
    expect(realWhish({ recipientName: "", whishNumber: "", accountId: "", instructions: "" }).whishNumber).toBe("76066652");
    expect(realWhish({ recipientName: "Ahmad", whishNumber: "71 111 111", accountId: "", instructions: "Pay me" })).toMatchObject({ recipientName: "Ahmad", whishNumber: "71 111 111", instructions: "Pay me" });
    expect(transferNote(" Burger House ", "INV-1")).toBe("Burger House · INV-1");
  });
});
