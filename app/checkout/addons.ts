/**
 * The two checkout add-ons, and the four packages they make with the base.
 *
 * Read by the checkout UI, by create-order (which CHARGES the total), by the
 * webhook (which reports it to Pabbly, GA4 and Meta) and by the thank-you
 * page. One file, so the price a buyer sees, the amount Razorpay takes and
 * the package name Pabbly routes on cannot disagree.
 *
 * No 'use client' and no React: the server routes import this.
 *
 * THE BROWSER NEVER SENDS AN AMOUNT. It sends which add-on ids it ticked, and
 * every total is recomputed from this file wherever it is needed. A tampered
 * request can choose add-ons; it cannot choose a price.
 *
 * ⚠️ The add-on copy below is NOT in COPY-SOURCE.md. It was written for this
 * build from the source copy's own language and needs Santosh's sign-off,
 * along with both prices (offer.ts) and the private call's format/duration.
 */
import {
  GA4_ITEM_ID,
  GUIDE_NAME,
  PRICE,
  PRICE_RUPEES,
  PRIVATE_CALL_PRICE_RUPEES,
  PRODUCT_NAME,
  RECORDING_PRICE_RUPEES,
} from '../_landing/offer';

export type AddonId = 'recording' | 'private_call';

export type Addon = {
  id: AddonId;
  /** The add-on's own product name: Pabbly, GA4 item_name, order summary. */
  name: string;
  /** Card headline. */
  title: string;
  /** One-line label for the phone's docked bar. */
  short: string;
  badge: string;
  blurb: string;
  points: string[];
  priceRupees: number;
  ga4ItemId: string;
};

const FIRST_NAME = GUIDE_NAME.split(' ')[0];

/* Display order, and the order ids are written in everywhere else, so
   "recording,private_call" is the only spelling the two-add-on case has. */
export const ADDONS: readonly Addon[] = [
  {
    id: 'recording',
    name: 'Challenge Recordings (All 5 Days)',
    title: 'Challenge recordings, all 5 days',
    short: 'Add all 5 recordings',
    badge: 'Recommended',
    blurb:
      'Attend live, then keep all five sessions for good. Rewatch the guided activities and revisit the plan-building whenever you need.',
    points: [
      'Full recordings of all 5 live sessions',
      'Shared on Day 5, right after the final live class',
      'Redo the guided therapeutic activities at your own pace',
      'Lifetime access, no expiry date',
      `Your live seat is still included in the ${PRICE}`,
    ],
    priceRupees: RECORDING_PRICE_RUPEES,
    ga4ItemId: `${GA4_ITEM_ID}-recordings`,
  },
  {
    id: 'private_call',
    name: `Private 1-on-1 Call with ${GUIDE_NAME}`,
    title: `Private 1-on-1 call with ${FIRST_NAME}`,
    short: `Add 1-on-1 call with ${FIRST_NAME}`,
    badge: 'One-on-one',
    blurb: `${FIRST_NAME} sir speaks with you personally. Bring your questions about applying music therapy, for yourself or towards your own practice, and get his direct guidance.`,
    points: [
      `A private call with ${FIRST_NAME}, not a group session`,
      'Ask your questions directly, with no group and no waiting',
      'Guidance on your next steps in music therapy',
      'Your private booking link arrives right after payment, by email & WhatsApp too',
      'Book your call slot anytime, at a time that suits you',
    ],
    priceRupees: PRIVATE_CALL_PRICE_RUPEES,
    ga4ItemId: `${GA4_ITEM_ID}-private-call`,
  },
];

const BY_ID = new Map(ADDONS.map((a) => [a.id, a]));

/** Accepts an array or a comma string, drops anything unknown, dedupes, and
 *  returns ids in catalogue order. Safe on any input, including undefined. */
export function parseAddons(input: unknown): AddonId[] {
  const raw = Array.isArray(input)
    ? input.map(String)
    : typeof input === 'string'
      ? input.split(',')
      : [];
  const wanted = new Set(raw.map((s) => s.trim()));
  return ADDONS.filter((a) => wanted.has(a.id)).map((a) => a.id);
}

/** The four routable package codes. Pabbly's router branches on this. */
export type PackageCode =
  | 'base'
  | 'base_recording'
  | 'base_private_call'
  | 'base_recording_private_call';

export type Package = {
  code: PackageCode;
  /** The full product name of what was bought, e.g. "… + Challenge Recordings". */
  name: string;
  baseName: string;
  addons: Addon[];
  addonIds: AddonId[];
  baseRupees: number;
  addonsRupees: number;
  totalRupees: number;
  totalPaise: number;
};

export function packageOf(ids: AddonId[]): Package {
  const addons = ids.map((id) => BY_ID.get(id)).filter((a): a is Addon => Boolean(a));
  const addonsRupees = addons.reduce((n, a) => n + a.priceRupees, 0);
  const totalRupees = PRICE_RUPEES + addonsRupees;
  return {
    code: (['base', ...addons.map((a) => a.id)].join('_') as PackageCode),
    name: [PRODUCT_NAME, ...addons.map((a) => a.name)].join(' + '),
    baseName: PRODUCT_NAME,
    addons,
    addonIds: addons.map((a) => a.id),
    baseRupees: PRICE_RUPEES,
    addonsRupees,
    totalRupees,
    totalPaise: totalRupees * 100,
  };
}

/** Where each package lands after payment. The base keeps the original
 *  /thank-you; each add-on combination has its own page and URL. */
export const THANK_YOU_PATH: Record<PackageCode, string> = {
  base: '/thank-you',
  base_recording: '/thank-you/recordings',
  base_private_call: '/thank-you/private-call',
  base_recording_private_call: '/thank-you/complete',
};

/** GA4 items for a package: the base line plus one line per add-on. */
export function ga4ItemsOf(pkg: Package) {
  return [
    { item_id: GA4_ITEM_ID, item_name: PRODUCT_NAME, price: pkg.baseRupees, quantity: 1 },
    ...pkg.addons.map((a) => ({
      item_id: a.ga4ItemId,
      item_name: a.name,
      price: a.priceRupees,
      quantity: 1,
    })),
  ];
}
