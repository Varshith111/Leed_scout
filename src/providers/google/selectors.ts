/**
 * Google Maps DOM selectors.
 *
 * Isolated here so a layout change only requires editing this file.
 * Selectors are ordered by the stage at which they are used.
 */

/** The scrollable results panel that contains all listing cards. */
export const RESULTS_PANEL = 'div[role="feed"]';

/** Individual listing card inside the results panel. */
export const RESULT_CARD = 'div[role="feed"] > div > div > a[href*="/maps/place/"]';

/** Consent / cookie dialog accept button (shown in some regions). */
export const CONSENT_BUTTON = 'button[aria-label="Accept all"]';

/** Business name on the detail panel. */
export const DETAIL_NAME = 'h1.DUwDvf';

/** Primary category label on the detail panel. */
export const DETAIL_CATEGORY = 'button[jsaction*="category"]';

/** Star rating text, e.g. "4.2". */
export const DETAIL_RATING = 'span[aria-hidden="true"].MW4etd';

/** Review count text, e.g. "(1,234)". */
export const DETAIL_REVIEW_COUNT = 'span[aria-label*="review"]';

/** Address row in the info section. */
export const DETAIL_ADDRESS = 'button[data-item-id="address"]';

/** Phone number row. */
export const DETAIL_PHONE = 'button[data-item-id^="phone:tel:"]';

/** Website row. */
export const DETAIL_WEBSITE = 'a[data-item-id="authority"]';

/** Marker rendered by Google Maps when all results have been loaded. */
export const END_OF_RESULTS = 'span.HlvSq';

/** Google Maps URL in the browser address bar (used to extract place ID). */
export const PLACE_URL_PATTERN = /\/maps\/place\//;
