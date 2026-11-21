import { describe, expect, it } from "vitest";
import { compactNumber } from "@/lib/utils";

describe("short counts (followers, views)", () => {
  it("rounds down to one decimal: 2,350 → 2.3K, never more than the real number", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(999)).toBe("999");
    expect(compactNumber(1000)).toBe("1K");
    expect(compactNumber(2048)).toBe("2K");
    expect(compactNumber(2350)).toBe("2.3K");
    expect(compactNumber(2399)).toBe("2.3K");
    expect(compactNumber(6640)).toBe("6.6K");
    expect(compactNumber(999_999)).toBe("999.9K");
    expect(compactNumber(1_250_000)).toBe("1.2M");
    expect(compactNumber(3_000_000_000)).toBe("3B");
  });
});
