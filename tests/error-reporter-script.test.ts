import { describe, expect, it } from "vitest";
import { ERROR_REPORTER_SCRIPT } from "@/lib/error-reporter-script";

describe("error reporter script (inlined in every page)", () => {
  it("is valid JavaScript: a syntax error would silently switch off error reporting", () => {
    expect(() => new Function(ERROR_REPORTER_SCRIPT)).not.toThrow();
  });
});
