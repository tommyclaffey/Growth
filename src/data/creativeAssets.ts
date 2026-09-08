import poster45 from '../assets/creative/ad.jpg';

/**
 * The asset library. Drop a file in `src/assets/creative/`, import it, add it
 * to the list for its shape. That is the whole procedure.
 *
 * ⚠️ Keyed by ASPECT RATIO, not by channel or campaign. A 9:16 asset is a 9:16
 * asset whether it runs as a TikTok in-feed, a Meta story or a YouTube Short --
 * which is how ad accounts actually organise creative, and it means adding one
 * vertical file lights it up everywhere vertical is served rather than in one
 * campaign.
 *
 * Each list CYCLES by index, so three ad sets running the same format show
 * three different assets instead of the same picture three times. With one
 * asset in a list every slot shows it, which is honest -- it is genuinely the
 * only file there.
 *
 * ⚠️ VIDEO NEEDS A POSTER FRAME, not a video file. Nothing here plays; the
 * card shows a still with a duration on it, which is exactly what Ads Manager
 * shows in a list view. Export a frame from the cut and treat it as an image.
 *
 * Empty list -> the card falls back to the labelled placeholder frame. That is
 * deliberate: a missing asset should look missing, not be papered over with a
 * stand-in that implies something was uploaded.
 */
const LIBRARY: Record<string, string[]> = {
  /* Square — Meta feed, podcast cover art. */
  '1:1': [],
  /* Portrait — the highest-performing Meta feed shape. */
  '4:5': [poster45],
  /* Vertical — TikTok, Reels, Stories, Shorts. Where UGC lives. */
  '9:16': [],
  /* Landscape — YouTube in-stream, display. */
  '16:9': [],
};

/**
 * The asset for one slot, or undefined when that shape has none yet.
 *
 * `index` is the creative's position within its campaign, so the cycling is
 * stable -- the same ad shows the same asset on every visit. A random pick
 * would mean a screenshot could not be reproduced.
 */
export function assetFor(ratio: string | undefined, index: number): string | undefined {
  if (!ratio) return undefined;
  const list = LIBRARY[ratio];
  if (!list || list.length === 0) return undefined;
  return list[index % list.length];
}

/** How many shapes still have nothing in them — surfaced in the UI, not hidden. */
export function missingRatios(): string[] {
  return Object.entries(LIBRARY).filter(([, v]) => v.length === 0).map(([k]) => k);
}
