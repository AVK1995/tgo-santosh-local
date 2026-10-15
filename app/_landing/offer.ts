/**
 * Every date, time, price and destination on the page comes through this file.
 * Nothing below it should ever hard-code one again: when the cohort moves, one
 * edit here moves the announcement bar, the hero, the pills, the schedule
 * heading, the docked bar, the footer and the metadata together.
 */

/* `??` does NOT catch an empty string, and .env.example ships every key blank.
   So a copied-but-unfilled .env.local would give Number('') === 0: a page
   advertising ₹0 and a Razorpay order for zero paise, with nothing throwing.
   Guard on a positive number, not on null. */
const RAW_PRICE = Number(process.env.NEXT_PUBLIC_PRICE_RUPEES);
export const PRICE_RUPEES = Number.isFinite(RAW_PRICE) && RAW_PRICE > 0 ? RAW_PRICE : 497;
export const PRICE_PAISE = PRICE_RUPEES * 100;
export const PRICE = `₹${PRICE_RUPEES.toLocaleString('en-IN')}`;

/* ── The two checkout add-ons (order bumps) ───────────────────────────────
   Same guard as the base price: a blank env key must fall back, never charge
   ₹0. Read with the literal `process.env.NEXT_PUBLIC_…` so Next inlines them
   into the browser bundle. The catalogue (names, copy, package codes) lives in
   app/checkout/addons.ts; only the numbers live here, beside the base price. */
const priceOr = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
export const RECORDING_PRICE_RUPEES = priceOr(process.env.NEXT_PUBLIC_ADDON_RECORDING_RUPEES, 500);
export const PRIVATE_CALL_PRICE_RUPEES = priceOr(process.env.NEXT_PUBLIC_ADDON_CALL_RUPEES, 1500);

/* The price the announcement bar says it rises to, struck through against
   PRICE on the hero card and the checkout. */
export const STRIKE_PRICE_RUPEES = 1799;
export const STRIKE_PRICE = `₹${STRIKE_PRICE_RUPEES.toLocaleString('en-IN')}`;
/* Rounded down, so the label never claims more off than ₹1799 → PRICE gives. */
export const DISCOUNT_PCT = Math.floor(
  ((STRIKE_PRICE_RUPEES - PRICE_RUPEES) / STRIKE_PRICE_RUPEES) * 100,
);

export const START_DATE = '21st October';
/* The first session (6 AM IST on the start date). Drives the checkout countdown. */
export const START_AT = '2026-10-21T06:00:00+05:30';
export const SESSION_TIMES = '6AM & 7PM';

export const PRODUCT_NAME = '5-Day Music Therapy Practitioner Challenge';
/** The GA4 item id. One slug, read by the browser tracker and by the webhook's
 *  server-side purchase, so the two cannot describe different products. */
export const GA4_ITEM_ID = 'santosh-5day-music-therapy';
export const BRAND = 'Anahat Music Therapy';
export const GUIDE_NAME = 'Santosh Ghatpande';

/* Stat bar figures, all from the source copy. */
export const STUDENTS_TRAINED = '4000+';
export const YEARS_IN_FIELD = '15+ Years';
export const RECOGNITION_YEAR = 'SiliconIndia 2026';

/* The value-stack line items live in app/checkout/included.ts and the total is
   derived from them there, never typed. It comes to the ₹6,291 the source copy
   names. */

/**
 * The WhatsApp community invite. The thank-you page is built around joining it
 * as the single next step, so an empty value there shows the buyer a dead
 * button at the exact moment they have just paid.
 *
 * ⚠️ REQUIRED BEFORE LAUNCH. Create the group, take the invite link.
 */
export const WHATSAPP_INVITE = process.env.NEXT_PUBLIC_WHATSAPP_INVITE ?? '';

/**
 * The SEPARATE WhatsApp group the session recordings are shared in, joined
 * only by buyers of the recordings add-on (/thank-you/recordings and
 * /thank-you/complete). ⚠️ REQUIRED BEFORE LAUNCH if the add-on is on sale.
 */
export const WHATSAPP_RECORDINGS_INVITE = process.env.NEXT_PUBLIC_WHATSAPP_RECORDINGS_INVITE ?? '';

/**
 * The calendar link where a private-call buyer picks their slot (Calendly,
 * Google appointment schedule, etc.). Opens in a new tab from
 * /thank-you/private-call and /thank-you/complete.
 * ⚠️ REQUIRED BEFORE LAUNCH if the add-on is on sale.
 */
export const CALL_BOOKING_URL = process.env.NEXT_PUBLIC_CALL_BOOKING_URL ?? '';

/** The next click is a payment. Every CTA on the page, including the docked
 *  bar, points here. */
export const CHECKOUT_HREF = '/checkout';

/** The CTA label and its reassurance line. */
export const CTA_LABEL = `Start Your 5-Day Music Therapy Challenge · ${DISCOUNT_PCT}% Off Today`;
export const CTA_NOTE = 'Join Risk-Free · 100% Money-Back Guarantee';
/** The sticky offer card and the Option 2 card carry their own labels. */
export const CTA_LABEL_STICKY = 'Reserve My Spot';
export const CTA_LABEL_OPTION = `Take Action · ${DISCOUNT_PCT}% Off Today`;
