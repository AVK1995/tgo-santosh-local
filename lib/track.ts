'use client';

import { GA4_ITEM_ID, PRICE_RUPEES, PRODUCT_NAME } from '@/app/_landing/offer';
import { ga4ItemsOf, packageOf, type AddonId } from '@/app/checkout/addons';
import { collectSignals } from '@/lib/client-signals';
import type { SendableEvent } from '@/lib/meta-capi';
import {
  ga4AddPaymentInfo,
  ga4AddToCart,
  ga4BeginCheckout,
  ga4Purchase,
  ga4ViewItem,
  once,
  type Ga4Item,
} from '@/lib/ga4';

/**
 * The one place a page calls to record something. Each function fires the
 * matching STANDARD event on both platforms: Meta by name via the CAPI route,
 * GA4 by its own recommended name.
 *
 * The two vocabularies differ and that is expected, Meta's InitiateCheckout
 * is GA4's begin_checkout. Mapping them here keeps that translation in one
 * file instead of every call site.
 */

const VALUE = PRICE_RUPEES;
const ITEM: Ga4Item = {
  item_id: GA4_ITEM_ID,
  item_name: PRODUCT_NAME,
  price: VALUE,
  quantity: 1,
};
const money = { value: VALUE, currency: 'INR', items: [ITEM] };

type Person = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  /** ISO 3166-1 alpha-2, from the checkout's country picker. */
  country?: string;
  /** `working_professional` | `homemaker`, from the checkout's select. */
  occupation?: string;
};

/**
 * Fire-and-forget: analytics must never block or fail a click.
 *
 * `eventName` is the closed union, not a string. The route already runs an
 * allow-list on the server, but a plain string here means a typo or a
 * well-meant new event name reaches the network before anything rejects it,
 * and on a health-adjacent offer the event name is one of the surfaces Meta
 * reads when it classifies a dataset. Typed, the mistake does not compile, and
 * adding a name is a review rather than an edit.
 */
function capi(eventName: SendableEvent, person: Person = {}, addons: AddonId[] = []) {
  const s = collectSignals();
  try {
    void fetch('/api/meta/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      /* Add-on IDS only: the route recomputes the value from them. */
      body: JSON.stringify({ eventName, ...s, ...person, addons }),
      keepalive: true, // survives the navigation a CTA click causes
    });
  } catch {
    /* ignore */
  }
}

/** Landing page: the offer has been seen. Once per SESSION, not per browser:
 *  a durable key would mean a returning visitor never produces another
 *  ViewContent, which starves the retargeting audience. */
export function trackViewItem() {
  once('view_item', () => {
    capi('ViewContent');
    ga4ViewItem(money);
  });
}

/**
 * Checkout ARRIVAL. Named for the Meta event it sends, not for where it once
 * fired: this used to run off a delegated [data-cta] click listener on the
 * landing page and was moved to the checkout's mount. Do not move it back. A
 * page with five to seven CTAs double-counts anyone who taps two of them, and a
 * click is not an arrival. See FunnelTracker for the full note.
 */
export function trackAddToCart() {
  capi('AddToCart');
  ga4AddToCart(money);
}

/** The checkout page has loaded. */
export function trackBeginCheckout() {
  ga4BeginCheckout(money);
}

/**
 * Details valid and the Razorpay sheet is opening. This is the real intent,
 * and it is the last thing this page reports: the success handler navigates to
 * /thank-you a moment later, which the call survives because capi() posts with
 * keepalive: true.
 */
export function trackInitiateCheckout(person: Person, addons: AddonId[] = []) {
  capi('InitiateCheckout', person, addons);

  /* QualifiedLead, for working professionals only, at the same instant.
     Not a new funnel stage: InitiateCheckout already marks this moment, but
     a separate event so the segment the client actually sells to can be
     optimised toward and seeded into a lookalike. Homemakers deliberately get
     no second event: a QualifiedLead audience that contains both answers
     cannot be targeted as one.

     ⚠️ WHICH HALF QUALIFIES IS UNCONFIRMED ON THIS FUNNEL. The source copy
     addresses homemakers and working professionals with equal weight, so
     `working_professional` is the house default rather than a stated client
     preference. Flip the test if Santosh says the other way round, and do it
     BEFORE any spend: the audience this seeds cannot be re-cut afterwards.

     Fired as its own call rather than folded into the one above because Meta
     dedupes on event_name + event_id, and the route derives a different id per
     name. Two calls, two events, no collision. */
  if (person.occupation === 'working_professional') {
    capi('QualifiedLead', person);
  }

  const pkg = packageOf(addons);
  ga4AddPaymentInfo({ value: pkg.totalRupees, currency: 'INR', items: ga4ItemsOf(pkg) });
}

/**
 * GA4 only: an order bump was ticked at the checkout. Meta gets nothing here;
 * the add-on reaches Meta as value on InitiateCheckout and on the Purchase.
 */
export function trackAddonAdded(id: AddonId) {
  const addon = packageOf([id]).addons[0];
  if (!addon) return;
  ga4AddToCart({
    value: addon.priceRupees,
    currency: 'INR',
    items: [{ item_id: addon.ga4ItemId, item_name: addon.name, price: addon.priceRupees, quantity: 1 }],
  });
}

/**
 * GA4 only. Meta's Purchase comes from the Razorpay webhook, where the payment
 * is proven, firing it here as well would double-count every sale.
 */
export function trackPurchase(transactionId: string, addons: AddonId[] = []) {
  const pkg = packageOf(addons);
  /* Keyed on the payment id, not a fixed string: a refresh, a back-forward, or
     the buyer reopening the confirmation link must not count the sale twice,
     but a genuine second purchase later must still count. Without this GA4
     revenue inflates every time someone reloads the page. */
  once(`purchase_${transactionId}`, () => {
    ga4Purchase({
      transactionId,
      value: pkg.totalRupees,
      currency: 'INR',
      items: ga4ItemsOf(pkg),
    });
  });
}
