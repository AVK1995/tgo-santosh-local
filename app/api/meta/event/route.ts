import { NextResponse } from 'next/server';

import { CHECKOUT_CONFIG, capiMissing, capiReady } from '@/lib/checkout-config';
import {
  sendCapiEvent,
  sha256Hex,
  type Occupation,
  type SendableEvent,
} from '@/lib/meta-capi';
import { readClientIp, readClientUserAgent } from '@/lib/request-signals';
import { packageOf, parseAddons } from '@/app/checkout/addons';

/**
 * One route for the four pre-payment events: ViewContent, AddToCart,
 * InitiateCheckout and QualifiedLead.
 *
 * Ankita uses a route per event. One route is fewer moving parts and the
 * payloads are identical apart from the name and the dedup key, but the
 * allow-list below is what keeps that from becoming a hole: only reviewed
 * names are accepted, and Purchase is explicitly NOT among them. Purchase is
 * only ever sent by the Razorpay webhook, where the payment is proven.
 *
 * The client IP and user agent are read from THIS request's headers, which is
 * the correct source: this is a fetch from the buyer's own browser. The
 * webhook's equivalent values have to travel in the order notes, because that
 * request comes from Razorpay.
 */
const ALLOWED: SendableEvent[] = [
  'ViewContent',
  'AddToCart',
  'InitiateCheckout',
  'QualifiedLead',
];

/* The two answers the checkout offers. Validated against this list rather than
   passed through, so a renamed form option cannot quietly ship a new string to
   Meta: an unrecognised value becomes undefined and the key is simply omitted,
   which is the safe failure. */
const OCCUPATIONS: Occupation[] = ['working_professional', 'homemaker'];

export async function POST(req: Request) {
  if (!capiReady()) {
    console.warn(`[meta-event] CAPI not configured, event skipped. Missing env: ${capiMissing()}`);
    return NextResponse.json({ ok: false, reason: 'capi-not-configured' });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad-json' }, { status: 400 });
  }

  const eventName = String(body.eventName ?? '') as SendableEvent;
  if (!ALLOWED.includes(eventName)) {
    return NextResponse.json(
      { ok: false, reason: 'event-not-allowed' },
      { status: 400 },
    );
  }

  const email = typeof body.email === 'string' ? body.email : '';
  const fbp = typeof body.fbp === 'string' ? body.fbp : undefined;

  const rawOccupation = String(body.occupation ?? '') as Occupation;
  const occupation = OCCUPATIONS.includes(rawOccupation)
    ? rawOccupation
    : undefined;

  /* QualifiedLead means exactly one thing: a working professional reached the
     payment sheet. Firing it without that answer would dilute the audience it
     exists to build, so the route refuses rather than sending a vaguer event. */
  if (eventName === 'QualifiedLead' && occupation !== 'working_professional') {
    return NextResponse.json(
      { ok: false, reason: 'not-qualified' },
      { status: 400 },
    );
  }

  /* Dedup keys, deterministic so Meta's 48h window collapses double-fires:
     by email where we have one, otherwise by the browser's _fbp. */
  const seed = email || fbp || `${Date.now()}_${Math.random()}`;
  const eventId = sha256Hex(`${seed}|${eventName}`);

  const result = await sendCapiEvent({
    pixelId: CHECKOUT_CONFIG.meta.pixelId,
    accessToken: CHECKOUT_CONFIG.meta.accessToken,
    eventName,
    eventId,
    eventSourceUrl:
      (typeof body.eventSourceUrl === 'string' && body.eventSourceUrl) ||
      CHECKOUT_CONFIG.fallbackEventSourceUrl,
    user: {
      email: email || undefined,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      firstName: typeof body.firstName === 'string' ? body.firstName : undefined,
      lastName: typeof body.lastName === 'string' ? body.lastName : undefined,
      /* Was hard-coded 'in'. The checkout now asks, so an overseas buyer is no
         longer reported as Indian, which is a wrong hashed value rather than a
         missing one: worse than sending nothing. Falls back to India for the
         landing-page events, which carry no form. */
      country:
        typeof body.country === 'string' && body.country.length === 2
          ? body.country.toLowerCase()
          : 'in',
      city: typeof body.city === 'string' ? body.city : undefined,
      externalId:
        typeof body.externalId === 'string' ? body.externalId : undefined,
      fbc: typeof body.fbc === 'string' ? body.fbc : undefined,
      fbp,
      /* Through lib/request-signals rather than reading x-forwarded-for here,
         so the create-order route and this one resolve the SAME address from
         the same headers. It prefers cf-connecting-ip and
         x-vercel-forwarded-for, which are single-value and already resolved,
         and only then falls back to the FIRST entry of the x-forwarded-for
         chain. Behind Cloudflare the raw chain can open with a value that is
         not the buyer, and a confidently wrong IP matches worse than none. */
      clientIp: readClientIp(req) || undefined,
      clientUserAgent: readClientUserAgent(req) || undefined,
    },
    /* The cart total once add-ons are ticked (InitiateCheckout carries the
       ids), the base price otherwise. Recomputed here from the ids, never
       taken as a number from the browser. */
    valueRupees: packageOf(parseAddons(body.addons)).totalRupees,
    currency: CHECKOUT_CONFIG.currency,
    /* Only ever set on the two events fired from the checkout form; the
       landing-page events have no answer to send. */
    occupation,
    /* No content_name, no UTMs, no order id. These three events happen before
       an order exists, so custom_data carries value and currency alone, see
       the classification note at the top of lib/meta-capi.ts. The UTMs the
       browser still sends in this body are read for nothing here on purpose;
       they reach the sale through the sealed context token and Pabbly
       instead. */
    testEventCode: CHECKOUT_CONFIG.meta.testEventCode || undefined,
  });

  return NextResponse.json({ ok: result.ok, eventName, eventId });
}
