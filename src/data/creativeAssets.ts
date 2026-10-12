/* Oct 12 2026: stocked from Unsplash (free to use under the Unsplash License).
   Photographer and source for every file: src/assets/creative/CREDITS.md.
   The old 4:5 poster (ad.jpg, a design-portfolio print with a made-up name on
   it) was never Copperline's ad, so it is no longer in the library. */
import squarePhoneTable from '../assets/creative/square-phone-table.jpg';
import squareCoins from '../assets/creative/square-coins.jpg';
import squarePhoneWall from '../assets/creative/square-phone-wall.jpg';
import portraitRedPhone from '../assets/creative/portrait-red-phone.jpg';
import portraitPhoneHands from '../assets/creative/portrait-phone-hands.jpg';
import verticalStreetCall from '../assets/creative/vertical-street-call.jpg';
import verticalPinkSweater from '../assets/creative/vertical-pink-sweater.jpg';
import verticalPhoneWhite from '../assets/creative/vertical-phone-white.jpg';
import verticalLaughing from '../assets/creative/vertical-laughing.jpg';
import wideKitchenCall from '../assets/creative/wide-kitchen-call.jpg';
import wideKitchenLaptop from '../assets/creative/wide-kitchen-laptop.jpg';
import wideCalculator from '../assets/creative/wide-calculator.jpg';
import searchCopperCoins from '../assets/creative/search-copper-coins.jpg';
import searchCoinStack from '../assets/creative/search-coin-stack.jpg';
import placementPlanner from '../assets/creative/placement-planner.jpg';
import placementLaptop from '../assets/creative/placement-laptop.jpg';
import coverHost from '../assets/creative/cover-host.jpg';
import coverMic from '../assets/creative/cover-mic.jpg';

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
  '1:1': [squarePhoneTable, squareCoins, squarePhoneWall],
  /* Portrait — the highest-performing Meta feed shape. */
  '4:5': [portraitRedPhone, portraitPhoneHands],
  /* Vertical — TikTok, Reels, Stories, Shorts. Where UGC lives. */
  '9:16': [verticalStreetCall, verticalPinkSweater, verticalPhoneWhite, verticalLaughing],
  /* Landscape — YouTube in-stream, display. */
  '16:9': [wideKitchenCall, wideKitchenLaptop, wideCalculator],
};

/**
 * The picture a NON-visual format genuinely carries -- not a master asset, so
 * it never goes in `src` (see the visual-only rule in creative.ts).
 *
 *   text  -> a Google Ads IMAGE ASSET: the square thumbnail a search ad can
 *            show beside its headline (Search campaigns support them).
 *   link  -> the PLACEMENT image a partner review or comparison page runs
 *            above the link.
 *   audio -> the SHOW'S cover art, which is what a podcast player displays
 *            while the host read plays.
 */
const EXTRA: Partial<Record<string, string[]>> = {
  text: [searchCopperCoins, searchCoinStack],
  link: [placementPlanner, placementLaptop],
  audio: [coverHost, coverMic],
};

/** The picture for a text, link or audio ad; undefined for any other kind. */
export function extraImageFor(kind: string, index: number): string | undefined {
  const list = EXTRA[kind];
  if (!list || list.length === 0) return undefined;
  return list[index % list.length];
}

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
