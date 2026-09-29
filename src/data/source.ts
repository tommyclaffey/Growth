import type { ChannelName } from '../styles/tokens';
import type { DayRow } from './metrics';

/**
 * ⭐ THE SEAM. What a data source -- the seeded demo, Meta, Google Ads --
 * has to provide for the whole product to run on it.
 *
 * Phase 3 of the beta plan: "the seeded generator becomes ONE implementation
 * of it." Adding Meta in Phase 4 means writing one object that satisfies this
 * interface; nothing downstream changes, because every total, delta, campaign,
 * decision and notification is derived from the rows loaded through `hydrate()`.
 *
 * ⚠️ ASYNC AT THE EDGE, SYNC INSIDE -- a deliberate departure from the plan's
 * "every read path becomes async". That would have turned ~40 pure functions
 * and ~470 tests into promise-returning code for no gain: the data a dashboard
 * computes over is loaded once per range change, not per read. The request is
 * async (and so has real loading / error / empty states); the arithmetic stays
 * synchronous, pure and testable. The same shape every serious dashboard uses:
 * fetch, then compute.
 */

export interface Account {
  /** Workspace / ad-account display name. */
  name: string;
  /** ISO 4217 -- "USD", "EUR". Every money figure is formatted in it. */
  currency: string;
  /** IANA zone the platform reports days in -- "America/Detroit". */
  timezone: string;
  /**
   * ISO date of the last COMPLETE day of data. The product's "today".
   * The seeded account is frozen on 2026-08-12; a live one is yesterday.
   */
  periodEnd: string;
}

export interface SourceData {
  account: Account;
  /** One row per day for the full history, oldest first, ending on periodEnd. */
  rows: Partial<Record<ChannelName, DayRow[]>>;
}

export interface DataSource {
  id: string;
  label: string;
  /**
   * Fetch everything the product computes over. Rejects on failure -- the
   * app shows its error state with the message.
   */
  load(signal?: AbortSignal): Promise<SourceData>;
  /**
   * Data available WITHOUT a request, for the first paint. The seeded source
   * has it; a network source does not, so the app starts in its loading state
   * instead of flashing demo numbers that are about to be replaced.
   */
  initial?: SourceData;
}
