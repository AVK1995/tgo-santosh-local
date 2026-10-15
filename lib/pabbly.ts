/**
 * Pabbly Connect: the fulfilment hand-off.
 *
 * Analytics tells Meta and GA4 that a sale happened. This tells the automation
 * who bought, so the buyer actually receives what they paid for: the WhatsApp
 * invite, the joining details, the guide downloads, the row in a sheet.
 *
 * It is fired from the Razorpay webhook and nowhere else, for the same reason
 * the Purchase event is: the webhook is the only place a payment is proven, and
 * UPI buyers routinely never return to the confirmation page. A browser-side
 * hand-off would silently skip most Indian buyers.
 *
 * Failure here must never fail the webhook. A gateway retries a non-200, and a
 * retry would re-fire Meta and GA4 and double-count the sale. So this reports
 * its own success and swallows its own errors: the caller logs the result and
 * still returns 200.
 *
 * ── Why this payload carries the Meta match keys too ──────────────────────
 * Pabbly is not only fulfilment; it is the ONLY place the full, unhashed
 * record of a sale exists. Meta receives hashes and nothing descriptive, GA4
 * receives no PII at all, and Razorpay holds only what it needs to charge a
 * card. So `fbc`, `fbp`, `client_ip_address`, `client_user_agent`,
 * `external_id` and `purchase_event_id` ride along here as well, they are
 * what makes it possible to rebuild, replay or reconcile a Meta event later
 * from the sheet, without which a mis-sent conversion is unrecoverable.
 */
import type { Package } from '@/app/checkout/addons';
import {
  CALL_BOOKING_URL,
  SESSION_TIMES,
  START_DATE,
  WHATSAPP_INVITE,
  WHATSAPP_RECORDINGS_INVITE,
} from '@/app/_landing/offer';

export const pabblyReady = () => Boolean(process.env.PABBLY_WEBHOOK_URL);

export type PabblyPurchase = {
  leadId: string;
  createdAt: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  /** "+91", kept apart from `phone`, which arrives as full E.164. */
  dialCode: string;
  countryCode: string;
  fbc: string;
  fbp: string;
  clientIp: string;
  clientUserAgent: string;
  externalId: string;
  eventSourceUrl: string;
  amountRupees: number;
  isTest: boolean;
  purchaseEventId: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmContent: string;
  utmTerm: string;
  fbclid: string;
  referrer: string;
  landingUrl: string;
  /* Beyond the agreed column set, kept because existing Pabbly steps already
     map them and removing a key silently blanks a column downstream. */
  paymentId: string;
  orderId: string;
  currency: string;
  occupation: string;
  /** What was bought: the base challenge plus any add-ons. */
  pkg: Package;
};

/* Every key is emitted on every call, empty string where unknown. Pabbly
   builds its field mapper from the FIRST payload it sees, so a key that is
   merely absent on the first test call cannot be mapped afterwards without
   re-running the trigger, an omitted key is far more expensive here than an
   empty one. */
const s = (v: unknown) => (v == null ? '' : String(v));

/* One constant behind both `type` and `event`, so a workflow branching on
   either takes the same path. This funnel emits one record type: the caller is
   the Razorpay webhook and it only fires on payment.captured. */
const RECORD_TYPE = 'purchase';

export async function sendPabblyPurchase(
  p: PabblyPurchase,
): Promise<{ ok: boolean; status: number }> {
  const url = process.env.PABBLY_WEBHOOK_URL ?? '';
  if (!url) {
    console.warn('[pabbly] PABBLY_WEBHOOK_URL not set, hand-off skipped');
    return { ok: false, status: 0 };
  }

  /* Flat keys, no nesting: Pabbly maps fields one level deep, and a nested
     object arrives as an unusable blob in the step mapper. */
  const payload = {
        lead_id: s(p.leadId),
        created_at: s(p.createdAt),
        first_name: s(p.firstName),
        last_name: s(p.lastName),
        email: s(p.email),
        phone: s(p.phone),
        city: s(p.city),
        dial_code: s(p.dialCode),
        country_code: s(p.countryCode),
        /* The record type, in the position the agreed column set puts it. It
           carries the SAME value as `event` below, from one constant, so the
           two can never disagree: this funnel hands off exactly one kind of
           record, a completed purchase, because the webhook is the only caller
           and it only fires on payment.captured. If the workflow ever means
           something else by `type` (a product class, paid vs free), it is one
           line here. */
        type: RECORD_TYPE,
        fbc: s(p.fbc),
        fbp: s(p.fbp),
        client_ip_address: s(p.clientIp),
        client_user_agent: s(p.clientUserAgent),
        external_id: s(p.externalId),
        event_source_url: s(p.eventSourceUrl),
        amount: p.amountRupees,
        /* Boolean, not the string "false": a Pabbly router condition on a
           non-empty string treats "false" as true and would route live sales
           down the test branch. */
        is_test: Boolean(p.isTest),
        purchase_event_id: s(p.purchaseEventId),
        utm_source: s(p.utmSource),
        utm_medium: s(p.utmMedium),
        utm_campaign: s(p.utmCampaign),
        utm_content: s(p.utmContent),
        utm_term: s(p.utmTerm),
        fbclid: s(p.fbclid),
        referrer: s(p.referrer),
        landing_url: s(p.landingUrl),

        event: RECORD_TYPE,
        payment_id: s(p.paymentId),
        order_id: s(p.orderId),
        name: `${s(p.firstName)} ${s(p.lastName)}`.trim(),
        currency: s(p.currency),
        occupation: s(p.occupation),

        /* ── WHAT WAS BOUGHT (2026-10-15) ───────────────────────────────
           `package` is the one field a Pabbly router should branch on, one
           of exactly four values:
             base | base_recording | base_private_call |
             base_recording_private_call
           `product` is the full name of that package (base name, then each
           add-on joined by " + "), so a plain base sale still reads exactly
           as it did before add-ons existed. `amount` above is the total
           Razorpay captured; the per-line amounts below are 0 when that
           line was not bought, never blank, so a sheet column sums cleanly. */
        package: p.pkg.code,
        product: p.pkg.name,
        base_product: p.pkg.baseName,
        base_amount: p.pkg.baseRupees,
        addons: p.pkg.addonIds.join(','),
        addon_names: p.pkg.addons.map((a) => a.name).join(' + '),
        addons_amount: p.pkg.addonsRupees,
        has_recording: p.pkg.addonIds.includes('recording'),
        recording_amount:
          p.pkg.addons.find((a) => a.id === 'recording')?.priceRupees ?? 0,
        has_private_call: p.pkg.addonIds.includes('private_call'),
        private_call_amount:
          p.pkg.addons.find((a) => a.id === 'private_call')?.priceRupees ?? 0,

        /* ── FOR THE CONFIRMATION MESSAGES (2026-10-15) ──────────────────
           Named exactly as the variables in the email / WhatsApp templates,
           so each maps one-to-one in Pabbly. `addon_amount` is the sum of
           the add-ons bought, `total_amount` the same captured total as
           `amount`. The two add-on links are filled ONLY when that add-on
           was bought and are '' otherwise, so a template can never hand a
           buyer the recordings group or the private booking link they did
           not pay for. */
        total_amount: p.amountRupees,
        addon_amount: p.pkg.addonsRupees,
        challenge_date: START_DATE,
        challenge_time: SESSION_TIMES,
        wa_group_base: WHATSAPP_INVITE,
        wa_group_recordings: p.pkg.addonIds.includes('recording') ? WHATSAPP_RECORDINGS_INVITE : '',
        call_booking_url: p.pkg.addonIds.includes('private_call') ? CALL_BOOKING_URL : '',
  };

  /* Full payload, unhashed, exactly as posted. The webhook url itself is not
     logged: it is the credential for the workflow. */
  const tag = `[pabbly] payment_id=${payload.payment_id}`;
  console.log(`${tag} REQUEST body=${JSON.stringify(payload)}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const resText = await res.text().catch(() => '');
    console.log(
      `${tag} RESPONSE ok=${res.ok} status=${res.status} body=${resText.slice(0, 500)}`,
    );
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error(`${tag} FAILED network error: ${String(e)}`);
    return { ok: false, status: 0 };
  }
}
