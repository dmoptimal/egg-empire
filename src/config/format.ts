// Big-number formatting (PLAN.md Phase 0). Suffix ladder K → Dc
// (1e3 … 1e33), then scientific ("1.23e36") beyond. Three significant
// figures everywhere. Plain floats are fine to ~1e308 — no big-number
// library. This is THE one formatter: HUD, popups, node costs, shop.

export const SUFFIXES = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];

export function fmt(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  if (n < 0) return "-" + fmt(-n);
  if (n < 1000) return Math.floor(n).toString();
  let k = Math.floor(Math.log10(n) / 3);
  let m = n / Math.pow(1000, k);
  if (m >= 999.5) {
    // 999950 reads as "1000K" without this bump — roll to the next suffix.
    k++;
    m /= 1000;
  }
  if (k > SUFFIXES.length) return n.toExponential(2).replace("e+", "e");
  const digits = m >= 99.95 ? 0 : m >= 9.995 ? 1 : 2;
  return m.toFixed(digits) + SUFFIXES[k - 1];
}

export function fmtMoney(n: number): string {
  return "$" + fmt(n);
}
