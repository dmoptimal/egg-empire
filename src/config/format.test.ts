// Phase 0 formatter: K → Dc suffix ladder, three significant figures,
// scientific notation beyond 1e36.

import { describe, expect, it } from "vitest";
import { fmt, fmtMoney } from "./format";

describe("fmt", () => {
  it("floors below 1K", () => {
    expect(fmt(0)).toBe("0");
    expect(fmt(999)).toBe("999");
    expect(fmt(999.9)).toBe("999");
  });

  it("keeps three significant figures through the ladder", () => {
    expect(fmt(1000)).toBe("1.00K");
    expect(fmt(1234)).toBe("1.23K");
    expect(fmt(12345)).toBe("12.3K");
    expect(fmt(123456)).toBe("123K");
    expect(fmt(165888)).toBe("166K"); // the PLAN's ostrich-worth example
    expect(fmt(2500)).toBe("2.50K");
  });

  it("rolls to the next suffix instead of showing 1000K", () => {
    expect(fmt(999499)).toBe("999K");
    expect(fmt(999500)).toBe("1.00M");
  });

  it("walks the full suffix ladder to 1e33", () => {
    expect(fmt(1e6)).toBe("1.00M");
    expect(fmt(1e9)).toBe("1.00B");
    expect(fmt(1e12)).toBe("1.00T");
    expect(fmt(1e15)).toBe("1.00Qa");
    expect(fmt(1e18)).toBe("1.00Qi");
    expect(fmt(1e21)).toBe("1.00Sx");
    expect(fmt(1e24)).toBe("1.00Sp");
    expect(fmt(1e27)).toBe("1.00Oc");
    expect(fmt(1e30)).toBe("1.00No");
    expect(fmt(1e33)).toBe("1.00Dc");
    expect(fmt(3.33e12)).toBe("3.33T");
  });

  it("goes scientific past the ladder", () => {
    expect(fmt(1e36)).toBe("1.00e36");
    expect(fmt(1.234e40)).toBe("1.23e40");
  });

  it("prefixes money with $", () => {
    expect(fmtMoney(0)).toBe("$0");
    expect(fmtMoney(2500)).toBe("$2.50K");
    expect(fmtMoney(1.5e12)).toBe("$1.50T");
  });
});
