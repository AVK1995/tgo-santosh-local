import crypto from 'crypto';

import { NextResponse } from 'next/server';

import { ATTR_COOKIE, packJsonNote, readAttrCookie } from '@/lib/attribution-edge';
import { CHECKOUT_CONFIG, isTestMode } from '@/lib/checkout-config';
import { readClientIp, readClientUserAgent, readRequestCookie } from '@/lib/request-signals';
import { packageOf, parseAddons } from '@/app/checkout/addons';

/**
 * Creates the Razorpay order the browser then pays.
 *
 * Called with the Razorpay REST API over fetch rather than the `razorpay` npm
 * package: order creation is one authenticated POST, and avoiding the package
 * keeps a dependency (and its transitive tree) out of this project.
 *
 * THE NOTES ARE THE POINT. Everything Meta needs to match the eventual
 * Purchase to a person and a campaign is written into the order here, because
 * the webhook that fires Purchase receives only what Razorpay stores. Signals
 * not written now are gone by then: the buyer may complete inside a bank app
 * and never return to a page that could report them.
 *
 * This is ALSO the last request the buyer's own browser makes before the
 * payment sheet takes over, which makes it the only honest place to read their
 * IP and user agent. The webhook that fires Purchase is a request from
 * Razorpay, so reading those headers there would record Razorpay's server as
 * the buyer's device. See lib/request-signals.ts.
 *
 * Razorpay allows 15 note keys at 256 chars each and REJECTS the order if
 * either limit is passed. Since 2026-09-22 the record is written ONE FIELD PER
 * KEY, with two small packJsonNote bundles, rather than one JSON blob sliced
 * across ten keys: an oversized value can then only cost its own field.
 */

const truncate = (v: unknown, max = 256) => {
  const s = v == null ? '' : String(v);
  return s.length > max ? s.slice(0, max) : s;
};

export async function POST(req: Request) {
  const { keyId, keySecret } = CHECKOUT_CONFIG.razorpay;
  if (!keyId || !keySecret) {
    console.error('[create-order] Razorpay keys not configured');
    return NextResponse.json(
      { ok: false, reason: 'not-configured' },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad-json' }, { status: 400 });
  }

  const firstName = truncate(body.firstName, 80).trim();
  const lastName = truncate(body.lastName, 80).trim();
  const email = truncate(body.email, 160).trim();
  const phone = truncate(body.phone, 20).replace(/\D/g, '');
  const city = truncate(body.city, 80).trim();
  const country = truncate(body.country, 2).trim().toLowerCase() || 'in';
  const occupation = truncate(body.occupation, 32).trim();

  if (!firstName || !lastName || !email || !phone || !city || !occupation) {
    return NextResponse.json({ ok: false, reason: 'missing-fields' }, { status: 400 });
  }

  const utm = (body.utm ?? {}) as Record<string, string | undefined>;

  /* The add-ons ticked at the checkout. Only the IDS come from the browser;
     the amount is recomputed from app/checkout/addons.ts, so a tampered body
     can pick add-ons but never a price. */
  const pkg = packageOf(parseAddons(body.addons));

  /* Identity for the fulfilment record. Minted HERE, before payment, so a
     lead can be tracked from the moment the form is submitted rather than
     only once money lands.

     THE TIMESTAMP THAT USED TO SIT HERE IS GONE (2026-09-22, Atul). The
     record now carries Razorpay's own `payment.created_at`, read off the
     webhook payload, so nothing has to ferry a date through the notes. */
  const leadId = crypto.randomUUID();

  /* Read from headers, never from the request body: the browser cannot know
     its own IP, and a user agent sent up in JSON is trivially forged. */
  const clientIp = readClientIp(req);
  const clientUserAgent = readClientUserAgent(req);

  /* ── THE COOKIES ON THIS VERY REQUEST (2026-09-22) ──────────────────────
     This route is same-origin, so the buyer's cookies arrive with it. Until
     now they were ignored and the body was trusted instead.

     `_fbc` is the one that hurt. If the pixel is blocked or still loading, or
     the in-app browser restricted the storage the client reader uses, the body
     comes up empty and Meta's click id is lost for good, while the cookie sat
     on the request the whole time. Body first (it may hold a value synthesised
     from an fbclid before Meta's own cookie existed), cookie as the catch. */
  const fbc = truncate(body.fbc) || truncate(readRequestCookie(req, '_fbc'));
  const fbp = truncate(body.fbp) || truncate(readRequestCookie(req, '_fbp'));

  /* The attribution the EDGE recorded, before any JavaScript ran. The body's
     copy comes from localStorage, which is exactly what the Instagram and
     Facebook in-app browsers restrict, so this is the reliable half and the
     body is the fallback rather than the other way round. See middleware.ts. */
  const edge = readAttrCookie(readRequestCookie(req, ATTR_COOKIE));

  /* 256, NOT 300: that is Razorpay's own per-note ceiling, and `lp` is one
     note. At 300 a landing url with a full campaign query (350 to 400 chars is
     normal on paid social) reached the repair loop below on EVERY order, which
     trimmed it to 256 anyway and logged a console.error while doing it. The
     value was never wrong, but the happy path was crying wolf at error level,
     which is how a real note failure would have gone unnoticed. Nothing is
     lost by cutting here instead: the tail beyond 256 is the query string, and
     every part of it that matters already rides in `utm` and `clid`. */
  const landingUrl = truncate(body.landingUrl, 256) || truncate(edge.landingUrl, 256);
  const referrer = truncate(body.referrer, 200) || truncate(edge.referrer, 200);
  const fbclid = truncate(body.fbclid, 200) || truncate(edge.fbclid, 200);
  const utmOf = (bodyVal: string | undefined, edgeVal: string | undefined) =>
    truncate(bodyVal, 100) || truncate(edgeVal, 100);

  /* ── ONE FIELD PER KEY, NOT ONE BLOB ACROSS TEN (2026-09-22) ────────────
     This used to be five readable keys plus `packContext`, which serialised
     twenty fields into a single JSON string and sliced it across `x0`..`x9`.

     THAT SHAPE FAILS ALL-OR-NOTHING. The slice cuts the JSON mid-string, the
     webhook's `JSON.parse` throws on the truncated text, and the handler falls
     back to an empty context: one oversized campaign name and ALL TWENTY
     fields arrive at Pabbly blank together. Which is exactly the symptom that
     sent us looking.

     Now each signal is its own key, so an oversized value can only ever cost
     its own field. The two bundles that remain are small and self-contained,
     and `packJsonNote` keeps each one valid by shortening its LONGEST value
     until it fits, never by cutting the finished JSON.

     FIFTEEN KEYS, Razorpay's exact limit: `addons` (2026-10-15) took the one
     spare. Adding another key now means folding something into a bundle.
     Ported from ResetByShruti, whose data has been clean on this shape. */
  const notes: Record<string, string> = {
    /* One constant, shared with the webhook that checks it. See the note on
       orderKind in lib/checkout-config.ts. */
    kind: CHECKOUT_CONFIG.orderKind,
    lead_id: leadId,
    /* Readable in the Razorpay dashboard, for whoever opens a payment at 11pm
       trying to work out whose refund it is. */
    name: truncate(`${firstName} ${lastName}`.trim()),
    email: truncate(email),
    /* NO `phone` KEY. Razorpay holds the number the buyer actually paid with
       (`payment.contact`) and the webhook reads it from there, so a copy here
       would only compete for the 256 characters these bundles need. */

    /* THE CAPS BELOW ARE THE REAL FIX, not packJsonNote.
       packJsonNote is the last resort: it shortens the LONGEST value until the
       bundle fits. Crowd eight fields at their theoretical maximum into one
       256-char note and it has to eat several of them to nothing, which is the
       all-or-nothing failure in miniature. Capping each field at a realistic
       length first means the bundle is comfortably under budget for real data,
       and packJsonNote only ever nibbles one unusually long value.

       Split into TWO bundles for the same reason: `xid` is a 36-character uuid
       and `cd` a 24-character timestamp, and neither survives being trimmed. */
    cust: packJsonNote({
      fn: truncate(firstName, 40),
      ln: truncate(lastName, 40),
      ct: truncate(city, 40),
      co: country,
      /* The dialling code kept apart from the number. `phone` reaches Pabbly
         as full E.164 from Razorpay, and +1 and +91 both begin with a 1, so
         the code cannot be recovered from the number afterwards by guessing
         how many leading digits to take. Six characters to carry, and it
         cannot be reconstructed if it is lost. */
      dl: truncate(body.dialCode, 6),
    }),
    /* NO `cd` TIMESTAMP (dropped 2026-09-22, Atul). The webhook now takes the
       date from Razorpay's own `payment.created_at`, so carrying one here was
       both a duplicate and a liability: a note that fails to pack could take
       the sale's date down with it. Twenty-four characters back. */
    meta: packJsonNote({
      oc: truncate(occupation, 32),
      xid: truncate(body.externalId, 40),
      ga: truncate(body.gaClientId, 40),
    }),
    /* ── TGO'S OWN UTM CONVENTION, NOT THE STANDARD ONE ─────────────────
       The ad URLs are built with Meta's dynamic parameters like this:

         utm_source  = {{placement}}       instagram_reels, facebook_feed
         utm_medium  = {{campaign.name}}
         utm_campaign= {{adset.name}}
         utm_term    = {{ad.id}}           the numeric id, ~16 digits
         utm_content = {{ad.name}}

       READ THAT BEFORE CHANGING A CAP. Three of the five carry Meta NAMES,
       which in an agency account run to forty or sixty characters, and the
       caps were originally sized for the standard convention where source and
       medium are words like "facebook" and "paid_social". Thirty characters
       would have cut every campaign and ad name in half.

       20/55/55/55/25 serialises to 246 of the 256 available, so there are ten
       characters of margin and packJsonNote only ever has to nibble a
       genuinely unusual name.

       THE AD ID GETS 25, NOT 20 (Atul, 2026-09-22). Meta's ids are 17 to 18
       digits today and have grown over the years; at 20 this field would
       start truncating the moment they reach 21, and a truncated ad id is
       worse than a missing one because it still looks like an id and will
       quietly join to nothing. The five characters come off the placement,
       which is a short fixed vocabulary (instagram_reels, facebook_feed,
       instagram_stories) with nothing near 20. */
    utm: packJsonNote({
      s: truncate(utmOf(utm.source, edge.utmSource), 20),
      m: truncate(utmOf(utm.medium, edge.utmMedium), 55),
      c: truncate(utmOf(utm.campaign, edge.utmCampaign), 55),
      n: truncate(utmOf(utm.content, edge.utmContent), 55),
      t: truncate(utmOf(utm.term, edge.utmTerm), 25),
    }),
    fbc,
    fbp,
    ip: clientIp,
    ua: truncate(clientUserAgent, 256),
    clid: fbclid,
    ref: referrer,
    lp: landingUrl,
    /* Which order bumps were bought: "recording", "private_call",
       "recording,private_call" or ''. The webhook rebuilds the whole package
       (code, name, amounts) from this one key. */
    addons: pkg.addonIds.join(','),
  };

  /* A REJECTED ORDER IS AN UNPAID BUYER, so both of Razorpay's limits are
     asserted rather than assumed, and both are repaired rather than merely
     logged. Fifteen keys are written above, so the key cap trips the moment
     anyone adds one more; the length cap can trip on a single long campaign
     url, and dropping a Razorpay order over one note value would cost a sale.

     packJsonNote already guarantees the two bundles fit. This is the guard for
     the plain values (`ua`, `lp`, `ref`, `clid`) whose caps are applied above
     but which nothing else re-checks after the fact. */
  for (const [k, v] of Object.entries(notes)) {
    if (v.length > 256) {
      console.error(`[create-order] note "${k}" over 256 chars (${v.length}), trimming`);
      notes[k] = v.slice(0, 256);
    }
  }
  if (Object.keys(notes).length > 15) {
    console.error('[create-order] notes over Razorpay 15-key cap', Object.keys(notes).length);
  }

  try {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: pkg.totalPaise,
        currency: CHECKOUT_CONFIG.currency,
        /* THIS CLIENT'S prefix, not the `kz_` one the scaffold was copied from.
           It is what a receipt is searched by in the Razorpay dashboard, so a
           previous client's initials on it sends whoever is reconciling a
           payment looking in the wrong account. Razorpay caps the receipt at
           40 characters; this is 17. */
        receipt: `dpp_${Date.now()}`,
        notes,
      }),
    });

    const order = await res.json();
    if (!res.ok || !order?.id) {
      /* Flattened onto ONE line on purpose. Logging the raw object makes the
         host's log viewer pretty-print it across many lines and truncate the
         tail, which is exactly where Razorpay puts `description` and `field`,
         the only two values that say what was actually wrong. */
      const err = order?.error ?? {};
      /* A 401 is never about the payload, so print the SHAPE of the credentials
         beside it. The key id is publishable by design (it is handed to the
         browser below), and a length plus a trimmed-flag says nothing about the
         secret's value while catching all four causes of a bad pair: mixed
         test/live modes, a stray space or quote pasted into the host's env UI,
         a regenerated secret, and the two values entered the wrong way round. */
      if (res.status === 401) {
        console.error(
          `[create-order] auth shape keyIdPrefix=${keyId.slice(0, 9)} ` +
            `keyIdLen=${keyId.length} (expect 23) secretLen=${keySecret.length} (expect 24) ` +
            `keyIdClean=${keyId === keyId.trim()} secretClean=${keySecret === keySecret.trim()} ` +
            `secretLooksLikeKeyId=${keySecret.startsWith('rzp_')}`,
        );
      }
      console.error(
        `[create-order] razorpay rejected http=${res.status} code=${err.code ?? '?'} ` +
          `step=${err.step ?? '?'} field=${err.field ?? '-'} desc=${err.description ?? JSON.stringify(order)}`,
      );
      return NextResponse.json({ ok: false, reason: 'gateway' }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      leadId,
      isTest: isTestMode(),
      orderId: order.id,
      package: pkg.code,
      amount: order.amount,
      currency: order.currency,
      keyId, // publishable by design: the browser needs it to open the sheet
    });
  } catch (e) {
    console.error('[create-order] failed', e);
    return NextResponse.json({ ok: false, reason: 'network' }, { status: 502 });
  }
}
