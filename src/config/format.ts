// Number formatting — extracted verbatim from the prototype's fmt / $$.
// PLAN.md Phase 0 replaces this with the full K→Dc suffix ladder; keep every
// call site on these two functions so that swap stays a one-file change.

export function fmt(n: number): string {
  return n >= 1e12 ? (n / 1e12).toFixed(2) + "T"
    : n >= 1e9 ? (n / 1e9).toFixed(2) + "B"
    : n >= 1e6 ? (n / 1e6).toFixed(2) + "M"
    : n >= 1e3 ? (n / 1e3).toFixed(1) + "K"
    : Math.floor(n).toString();
}

export function fmtMoney(n: number): string {
  return "$" + fmt(n);
}
