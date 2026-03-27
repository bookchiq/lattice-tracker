export function clampInt(val, fallback, max) {
  const n = parseInt(val || String(fallback), 10);
  return Math.min(Math.max(isNaN(n) ? fallback : n, 1), max);
}

export function clampOffset(val) {
  const n = parseInt(val || '0', 10);
  return Math.max(isNaN(n) ? 0 : n, 0);
}
