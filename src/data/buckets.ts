/**
 * Weeks and months across a window, for the table's Week / Month view.
 * Pure: ISO dates in, index ranges out -- tested on its own.
 */

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Bucket { start: number; end: number; label: string; days: number; full: boolean }

/**
 * Split a window's days (ISO dates, oldest first) into weeks or months.
 *
 * Weeks count BACK from the last day, so the newest column is always a whole
 * "last week"; only the OLDEST can be short, and it says so. Months are
 * calendar months; the first and last can be partial.
 */
export function bucketsOf(iso: string[], by: 'week' | 'month'): Bucket[] {
  const md = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return { m: d.getUTCMonth(), d: d.getUTCDate(), y: d.getUTCFullYear() }; };
  const out: Bucket[] = [];
  if (by === 'week') {
    for (let end = iso.length; end > 0; end -= 7) {
      const start = Math.max(0, end - 7);
      const a = md(iso[start]); const b = md(iso[end - 1]);
      const label = a.m === b.m ? `${MONTH_SHORT[a.m]} ${a.d}–${b.d}` : `${MONTH_SHORT[a.m]} ${a.d} – ${MONTH_SHORT[b.m]} ${b.d}`;
      out.unshift({ start, end, label, days: end - start, full: end - start === 7 });
    }
    return out;
  }
  let start = 0;
  for (let i = 1; i <= iso.length; i++) {
    if (i === iso.length || iso[i].slice(0, 7) !== iso[start].slice(0, 7)) {
      const a = md(iso[start]);
      const last = new Date(Date.UTC(a.y, a.m + 1, 0)).getUTCDate();
      const full = a.d === 1 && md(iso[i - 1]).d === last;
      out.push({ start, end: i, label: `${MONTH_SHORT[a.m]} ${a.y}`, days: i - start, full });
      start = i;
    }
  }
  return out;
}

