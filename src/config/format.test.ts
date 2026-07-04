import { describe, expect, it } from "vitest";
import { fmt, fmtMoney } from "./format";

describe("fmt", () => {
  it("floors below 1K", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(999)).toBe("999");
    expect(fmt(999.9)).toBe("999");
  });

  it("uses one decimal for K and two for M/B/T", () => {
    expect(fmt(1000)).toBe("1.0K");
    expect(fmt(2500)).toBe("2.5K");
    expect(fmt(1e6)).toBe("1.00M");
    expect(fmt(7.5e6)).toBe("7.50M");
    expect(fmt(1e9)).toBe("1.00B");
    expect(fmt(3.33e12)).toBe("3.33T");
  });

  it("prefixes money with $", () => {
    expect(fmtMoney(0)).toBe("$0");
    expect(fmtMoney(2500)).toBe("$2.5K");
    expect(fmtMoney(30000)).toBe("$30.0K");
  });
});
