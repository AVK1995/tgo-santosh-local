/**
 * GA4 Measurement Protocol, server-side `purchase`.
 *
 * The browser-side purchase on /thank-you only counts buyers who return to the
 * page. In India most of them do not: a UPI payer completes inside their bank
 * app and never comes back to the tab. That is the same reason Meta's Purchase
 * is sent from the webhook, and this closes the equivalent hole in GA4 so the
 * two platforms report the same number of sales.
 *
 * client_id is the catch. GA4 attributes a server event to a session only if
 * it carries the _ga cookie's client id, so that value is captured when the
 * payment request is created and carried to the webhook in the sealed context
 * token. Without it GA4 still records the revenue, but as a new unattributed
 * session, which breaks the funnel view.
 */

const ENDPOINT = 'https://www.google-analytics.com/mp/collect';

export const ga4ServerReady = () =>
  Boolean(process.env.NEXT_PUBLIC_GA4_ID && process.env.GA4_API_SECRET);

export async function sendGa4Purchase(params: {
  clientId: string;
  transactionId: string;
  valueRupees: number;
  currency: string;
  /** One line per thing bought: the base challenge, then each add-on. */
  items: { item_id: string; item_name: string; price: number; quantity: number }[];
}): Promise<{ ok: boolean; status: number }> {
  const measurementId = process.env.NEXT_PUBLIC_GA4_ID ?? '';
  const apiSecret = process.env.GA4_API_SECRET ?? '';
  if (!measurementId || !apiSecret) return { ok: false, status: 0 };

  const body = {
    /* A client_id is mandatory. Falling back to the transaction id keeps the
       revenue rather than dropping the event, at the cost of it landing as its
       own session. */
    client_id: params.clientId || `srv.${params.transactionId}`,
    non_personalized_ads: false,
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: params.transactionId,
          value: params.valueRupees,
          currency: params.currency,
          items: params.items,
        },
      },
    ],
  };

  const tag = `[ga4-mp] purchase transaction_id=${params.transactionId}`;
  console.log(`${tag} REQUEST body=${JSON.stringify(body)}`);

  try {
    const res = await fetch(
      `${ENDPOINT}?measurement_id=${measurementId}&api_secret=${apiSecret}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    // The MP endpoint returns 204 with no body on success.
    console.log(`${tag} RESPONSE ok=${res.ok} status=${res.status}`);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    console.error(`${tag} FAILED network error: ${String(e)}`);
    return { ok: false, status: 0 };
  }
}
