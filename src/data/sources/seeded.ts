import type { DataSource, SourceData } from '../source';
import { SEEDED_PERIOD_END, generateSeeded } from '../metrics';

/**
 * The demo account, as a data source.
 *
 * Nothing about it is special any more: it implements the same interface Meta
 * will, and the product cannot tell the difference. Frozen on Aug 12, 2026 --
 * which is why decision grading reads "no new data" today, and says so.
 */
const data = (): SourceData => ({
  account: {
    name: 'Northbank', currency: 'USD', timezone: 'UTC', periodEnd: SEEDED_PERIOD_END,
  },
  rows: generateSeeded(),
});

const initial = data();

export const seededSource: DataSource = {
  id: 'seeded',
  label: 'Demo account (seeded)',
  initial,
  load: () => Promise.resolve(initial),
};
