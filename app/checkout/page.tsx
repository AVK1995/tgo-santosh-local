'use client';

/**
 * /checkout - 5-Day Music Therapy Practitioner Challenge.
 *
 * Built to the same pattern as the ankita-postpartum checkout, which is the
 * house standard for challenge funnels: header with a way back, a centred
 * masthead, then a two-column body with the form on the left and a STICKY order
 * summary on the right that collapses into a tap-to-open accordion on a phone.
 *
 * It imports the landing page's tokens instead of redeclaring them, so the two
 * pages cannot drift apart.
 *
 * PAYMENT IS RAZORPAY, AND IT IS A SHEET OVER THIS PAGE, NOT A REDIRECT.
 *
 * The pay button loads Razorpay's checkout SDK on demand, posts the form to
 * /api/razorpay/create-order, and opens the payment sheet on top of this page.
 * The buyer never leaves the site, so there is no return route to confirm
 * anything: the sheet's own handler moves them to /thank-you, and the webhook
 * is what proves the sale.
 *
 * Two consequences live in the code below:
 *   - InitiateCheckout fires immediately BEFORE the sheet opens, never on
 *     arrival. That is the moment intent is real: the details are valid and
 *     the buyer is committing. Arrival is AddToCart, in the effect above it.
 *   - the sheet's `ondismiss` resets the busy state, because a buyer who
 *     closes the sheet is still on this page and must be able to try again.
 *
 * PURCHASE IS NOT FIRED HERE. The success handler only navigates. The
 * Razorpay webhook owns Purchase, so a UPI payer who finishes inside their
 * bank app and never returns to this tab is still counted.
 *
 * The button degrades honestly when the gateway is unconfigured: create-order
 * reports `not-configured` and the form says so rather than failing silently.
 */

import Link from 'next/link';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  ArrowLeft,
  CaretDown,
  Check,
  CheckCircle,
  CreditCard,
  Lock,
  ShieldCheck,
} from '@phosphor-icons/react/dist/ssr';

import {
  BRAND,
  CTA_NOTE,
  PRICE_RUPEES,
  PRODUCT_NAME,
  SESSION_TIMES,
  START_DATE,
  STRIKE_PRICE,
  STRIKE_PRICE_RUPEES,
} from '../_landing/offer';
import { StartCountdown } from '../_landing/countdown';
import { asset } from '../_landing/asset-version';
import PaymentLogos from '@/components/PaymentLogos';
import SiteFooter from '@/components/SiteFooter';
import { collectSignals } from '@/lib/client-signals';
import {
  trackAddToCart,
  trackAddonAdded,
  trackBeginCheckout,
  trackInitiateCheckout,
} from '@/lib/track';

import { C } from '../_landing/shared';
import {
  ADDONS,
  THANK_YOU_PATH,
  packageOf,
  parseAddons,
  type Addon,
  type AddonId,
  type Package,
} from './addons';
import { RECAP, VALUE_TOTAL, inr } from './included';

/* Each add-on's tone, from the palette rather than the reference build's
   yellow and green: the recordings take the saffron accent with oxblood ink,
   the private call takes the logo's violet band. `ring` is the pulse colour
   (see .addon-card in globals.css), `dash` the unticked border. */
const TONE: Record<AddonId, { ink: string; bed: string; dash: string; ring: string }> = {
  recording: { ink: C.goldInk, bed: C.goldWash, dash: C.goldMid, ring: 'rgba(253,147,9,0.24)' },
  private_call: { ink: C.coralInk, bed: C.coralBed, dash: 'rgba(131,0,125,0.5)', ring: 'rgba(131,0,125,0.16)' },
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const RZP_SDK = 'https://checkout.razorpay.com/v1/checkout.js';

/* Loaded on demand rather than in the layout: it is ~100KB that only matters
   once someone actually presses pay. */
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RZP_SDK}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const el = document.createElement('script');
    el.src = RZP_SDK;
    el.async = true;
    el.onload = () => resolve(true);
    el.onerror = () => resolve(false);
    document.body.appendChild(el);
  });
}

/* Dial codes carry the ISO-2 alongside them because Meta's CAPI wants the
   COUNTRY as a hashed ISO 3166-1 alpha-2 code, not a dial code. India first,
   then the places this audience actually lives. */
const COUNTRIES: { iso: string; dial: string; label: string }[] = [
  { iso: 'in', dial: '+91', label: 'India (+91)' },
  { iso: 'ae', dial: '+971', label: 'UAE (+971)' },
  { iso: 'gb', dial: '+44', label: 'UK (+44)' },
  { iso: 'us', dial: '+1', label: 'USA (+1)' },
  { iso: 'ca', dial: '+1', label: 'Canada (+1)' },
  { iso: 'au', dial: '+61', label: 'Australia (+61)' },
  { iso: 'sg', dial: '+65', label: 'Singapore (+65)' },
  { iso: 'qa', dial: '+974', label: 'Qatar (+974)' },
  { iso: 'om', dial: '+968', label: 'Oman (+968)' },
  { iso: 'kw', dial: '+965', label: 'Kuwait (+965)' },
  { iso: 'sa', dial: '+966', label: 'Saudi Arabia (+966)' },
  { iso: 'nz', dial: '+64', label: 'New Zealand (+64)' },
  { iso: 'za', dial: '+27', label: 'South Africa (+27)' },
  { iso: 'my', dial: '+60', label: 'Malaysia (+60)' },
  { iso: 'de', dial: '+49', label: 'Germany (+49)' },
];

/* Two options and no "other": a two-way split is the point of the question,
   and an audience containing both answers cannot be targeted as one. The VALUE
   is what travels to the webhook and into custom_data, so keep it stable even
   if the label is reworded. Adding a third option means changing the
   `Occupation` union in lib/meta-capi.ts, which is deliberately a review. */
const OCCUPATIONS = [
  { value: 'working_professional', label: 'Working professional' },
  { value: 'homemaker', label: 'Homemaker' },
];

type Fields = {
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  country: string; // ISO-2
  phone: string;
  occupation: string;
};

export default function CheckoutPage() {
  const [f, setF] = useState<Fields>({
    firstName: '',
    lastName: '',
    email: '',
    city: '',
    country: 'in',
    phone: '',
    occupation: '',
  });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');

  /* The ticked order bumps, always in catalogue order. Everything priced on
     this page reads `pkg`; the server recomputes the same package from the
     ids, so the two cannot disagree on the amount. */
  const [addons, setAddons] = useState<AddonId[]>([]);
  const pkg = useMemo(() => packageOf(addons), [addons]);
  /* The struck "was" figure: the base's full price plus the add-ons at their
     own price. Add-ons carry no discount, so none is implied for them. */
  const strikeTotal = STRIKE_PRICE_RUPEES + pkg.addonsRupees;
  const toggleAddon = (id: AddonId) => {
    const on = addons.includes(id);
    if (!on) trackAddonAdded(id);
    setAddons(parseAddons(on ? addons.filter((x) => x !== id) : [...addons, id]));
  };

  /* The phone's docked bar repeats the add-ons as compact rows, but only while
     the full cards are OFF screen: the same choice twice in one view is noise.
     The bottom margin keeps a card that is hidden behind the bar counted as
     not visible. */
  const addonsRef = useRef<HTMLDivElement>(null);
  const [addonsInView, setAddonsInView] = useState(false);
  useEffect(() => {
    const el = addonsRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setAddonsInView(e.isIntersecting), {
      rootMargin: '0px 0px -240px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* Arrival at the checkout. GA4 gets begin_checkout, Meta gets AddToCart.
     Meta's InitiateCheckout deliberately does NOT fire here: it waits until the
     details are valid and the payment sheet actually opens, which is a far
     stronger buying signal than a page load and is what the ads optimise on.

     This is also the only Meta event a DIRECT arrival ever gets. Someone who
     opens /checkout from an email, a retargeting ad or a bookmark never touches
     the landing page, so without this they were invisible to Meta until the pay
     tap. Ref-guarded so StrictMode's double effect and a remount cannot inflate
     the count. */
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    trackBeginCheckout();
    trackAddToCart();
  }, []);

  const v = useMemo(() => {
    const digits = f.phone.replace(/\D/g, '');
    return {
      firstName: f.firstName.trim().length > 1,
      lastName: f.lastName.trim().length > 0,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()),
      city: f.city.trim().length > 1,
      /* The dial code is chosen from the picker, so this validates the SUBSCRIBER
         number only: 7 to 12 digits covers every country in the list without
         pulling in libphonenumber-js. India is the strict case at exactly 10. */
      phone: f.country === 'in' ? digits.length === 10 : digits.length >= 7 && digits.length <= 12,
      occupation: f.occupation !== '',
    };
  }, [f]);
  const valid =
    v.firstName && v.lastName && v.email && v.city && v.phone && v.occupation;

  const dial = COUNTRIES.find((c) => c.iso === f.country)?.dial ?? '+91';
  /* E.164 without the plus, which is what both Meta and Razorpay expect. */
  const e164 = `${dial}${f.phone}`.replace(/\D/g, '');

  const startPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setFailed('');
    if (!valid) {
      // The sticky bar submits from below the form, so bring the errors into view.
      document.getElementById('checkout-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (busy) return;
    setBusy(true);

    /* Meta InitiateCheckout + GA4 add_payment_info, plus QualifiedLead as a
       separate call for the qualifying occupation only. Fired before the sheet
       opens rather than after payment, because this is the moment intent is
       real: details are valid and the buyer is committing.

       lib/track posts it with keepalive: true, so it survives the navigation
       the success handler causes a moment later. */
    trackInitiateCheckout({
      email: f.email.trim(),
      phone: e164,
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      city: f.city.trim(),
      country: f.country,
      occupation: f.occupation,
    }, addons);

    try {
      const sdk = await loadRazorpay();
      if (!sdk) throw new Error('sdk');

      const res = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: f.firstName.trim(),
          lastName: f.lastName.trim(),
          email: f.email.trim(),
          phone: e164,
          /* Sent SEPARATELY as well as being folded into e164 above. Once the
             two are concatenated there is no reliable way to split them back
             apart: +1 and +91 both start with a 1, so a leading-digits guess
             gets it wrong for exactly the countries that share a prefix. */
          dialCode: dial,
          city: f.city.trim(),
          country: f.country,
          occupation: f.occupation,
          /* Ids only. create-order prices them itself. */
          addons,
          ...collectSignals(),
        }),
      });
      const order = await res.json();

      if (!res.ok || !order?.ok) {
        setBusy(false);
        setFailed(
          order?.reason === 'not-configured'
            ? 'Payments are not switched on yet. Nothing has been charged.'
            : 'We could not start the payment. Please try again.',
        );
        return;
      }

      const rzp = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: order.currency,
        /* ⚠️ The name the buyer reads at the top of the payment sheet. It MUST
           match the business name on the Razorpay account: a different name
           over a card form is the single most common reason a buyer abandons
           at the sheet. This is the trade name from the copy source, which has
           not been confirmed against the merchant record. */
        name: BRAND,
        /* Absolute: the sheet is an iframe on checkout.razorpay.com, where a
           relative path would resolve against their host and 404. */
        image: `${window.location.origin}${asset('/brand/anahat-square.png')}`,
        description: pkg.addons.length ? `${PRODUCT_NAME} + add-ons` : PRODUCT_NAME,
        prefill: {
          name: `${f.firstName.trim()} ${f.lastName.trim()}`.trim(),
          email: f.email.trim(),
          contact: e164,
        },
        theme: { color: C.navyDeep },
        modal: { ondismiss: () => setBusy(false) },
        /* Purchase is NOT fired here. The webhook owns it, so a UPI payer who
           finishes in their bank app and never returns is still counted. This
           handler only moves the buyer on. */
        handler: (r: { razorpay_payment_id: string }) => {
          /* Each package has its own confirmation page (THANK_YOU_PATH), so
             the next steps match what was bought and each page can be its
             own conversion URL. */
          window.location.href = `${THANK_YOU_PATH[pkg.code]}?p=${encodeURIComponent(r.razorpay_payment_id)}`;
        },
      });
      rzp.open();
    } catch {
      setBusy(false);
      setFailed('We could not start the payment. Please try again.');
    }
  };

  return (
    <main className="min-h-screen" style={{ background: C.canvasAlt }}>
      <Header />

      <section className="py-8 md:py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-5 md:px-8">
          <div className="mb-8 text-center sm:mb-10 md:mb-12">
            <span
              className="inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em]"
              style={{ background: C.goldWash, color: C.goldInk }}
            >
              <CheckCircle weight="fill" className="h-3 w-3 shrink-0" />
              5-Day Music Therapy Practitioner Challenge
            </span>

            <h1
              className="mt-4 font-display text-[22px] font-semibold leading-tight sm:text-[28px] md:text-[34px]"
              style={{ color: C.ink, textWrap: 'balance' } as React.CSSProperties}
            >
              Add your details to confirm your seat.
            </h1>
            <p className="mt-3 text-[13px] sm:text-[13.5px]" style={{ color: C.inkSoft }}>
              Starts {START_DATE} · Live on Zoom · {SESSION_TIMES}
            </p>
          </div>

          {/* Form left, summary right. The summary is sticky on desktop so the
              price stays in view while the form is filled, and collapses to an
              accordion on a phone so it never pushes the fields below the fold. */}
          <div className="grid gap-8 lg:grid-cols-[1fr_minmax(320px,380px)] lg:items-start lg:gap-10">
            <form
              id="checkout-form"
              onSubmit={startPayment}
              noValidate
              className="rounded-2xl p-6 sm:p-8"
              style={{ background: C.canvas, border: `1px solid ${C.line}` }}
            >
              <p
                className="text-[10.5px] font-bold uppercase tracking-[0.2em]"
                style={{ color: C.goldInk }}
              >
                Your details
              </p>
              <h2
                className="mt-2 font-display text-[20px] font-semibold leading-snug sm:text-[22px]"
                style={{ color: C.ink }}
              >
                Where should we send your seat?
              </h2>
              <p className="mt-2 text-[12.5px] sm:text-[13px]" style={{ color: C.inkSoft }}>
                Your Zoom link, reminders and all three resources go to these.
              </p>

              <div className="mt-6 flex flex-col gap-4">
                {/* First and last are separate fields, not one "Full name"
                    split on a space. Splitting guesses: it gives a two-word
                    surname to the first name, and a single-word entry no last
                    name at all. Meta hashes fn and ln independently, so a bad
                    guess is a permanently worse match. */}
                <div className="grid grid-cols-2 gap-4">
                  <Field
                    label="First name"
                    type="text"
                    autoComplete="given-name"
                    placeholder="First name"
                    value={f.firstName}
                    onChange={(x) => setF((s) => ({ ...s, firstName: x }))}
                    bad={touched && !v.firstName}
                  />
                  <Field
                    label="Last name"
                    type="text"
                    autoComplete="family-name"
                    placeholder="Last name"
                    value={f.lastName}
                    onChange={(x) => setF((s) => ({ ...s, lastName: x }))}
                    bad={touched && !v.lastName}
                  />
                </div>

                <Field
                  label="Email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={f.email}
                  onChange={(x) => setF((s) => ({ ...s, email: x }))}
                  bad={touched && !v.email}
                />

                <Field
                  label="Town / City"
                  type="text"
                  autoComplete="address-level2"
                  placeholder="Your town or city"
                  value={f.city}
                  onChange={(x) => setF((s) => ({ ...s, city: x }))}
                  bad={touched && !v.city}
                />

                {/* The dial code is its own control rather than something the
                    buyer types, so the number that reaches Meta and Razorpay is
                    always a clean E.164 and the country arrives as an ISO-2 we
                    can hash. */}
                {/* A div, not a <label>: a label wrapping the themed picker
                    would re-click its trigger whenever an option is tapped.
                    The number input carries its own accessible name instead. */}
                <div className="block">
                  <span
                    id="whatsapp-label"
                    className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.16em]"
                    style={{ color: C.inkSoft }}
                  >
                    WhatsApp number
                  </span>
                  <div className="flex gap-2">
                    <ThemedSelect
                      ariaLabel="Country dialling code"
                      options={COUNTRIES.map((c) => ({
                        value: c.iso,
                        label: c.label,
                        /* ISO code beside the dial code, because +1 alone is
                           both USA and Canada. GB reads as "UK" to a buyer. */
                        short: `${c.iso === 'gb' ? 'UK' : c.iso.toUpperCase()} ${c.dial}`,
                      }))}
                      value={f.country}
                      onChange={(x) => setF((s) => ({ ...s, country: x }))}
                      bad={false}
                      compact
                      className="w-[124px] shrink-0"
                      listClassName="w-[240px] max-w-[calc(100vw-48px)]"
                    />
                    <input
                      aria-labelledby="whatsapp-label"
                      className="w-full rounded-xl px-4 py-3 text-[15px] outline-none"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="98XXX XXXXX"
                      value={f.phone}
                      onChange={(e) => setF((s) => ({ ...s, phone: e.target.value }))}
                      aria-invalid={(touched && !v.phone) || undefined}
                      style={{
                        background: C.canvasAlt,
                        color: C.ink,
                        border: `1px solid ${touched && !v.phone ? C.coralInk : C.line}`,
                      }}
                    />
                  </div>
                  <span className="mt-1.5 block text-[11.5px]" style={{ color: C.inkSoft }}>
                    Your session reminders go here.
                  </span>
                </div>

                <div>
                  <span
                    id="occupation-label"
                    className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.16em]"
                    style={{ color: C.inkSoft }}
                  >
                    Are you a working professional or a homemaker?
                  </span>
                  {/* A themed listbox rather than a native <select>: the
                      browser draws a native option list in its own grey and
                      ignores page styles. Same options, same values. */}
                  <ThemedSelect
                    labelledBy="occupation-label"
                    placeholder="Select one"
                    options={OCCUPATIONS}
                    value={f.occupation}
                    onChange={(x) => setF((s) => ({ ...s, occupation: x }))}
                    bad={touched && !v.occupation}
                  />
                </div>
              </div>

              {/* ── The two order bumps. Optional, unticked by default, and
                  each one says exactly what it adds to the total. ───────── */}
              <div ref={addonsRef} id="checkout-addons" className="mt-8">
                <p
                  className="text-[10.5px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: C.goldInk }}
                >
                  Optional add-ons
                </p>
                <h3
                  className="mt-2 font-display text-[18px] font-semibold leading-snug sm:text-[20px]"
                  style={{ color: C.ink }}
                >
                  Make the most of your 5 days
                </h3>
                <div className="mt-4 flex flex-col gap-3.5">
                  {ADDONS.map((a) => (
                    <AddonCard
                      key={a.id}
                      addon={a}
                      on={addons.includes(a.id)}
                      onToggle={() => toggleAddon(a.id)}
                    />
                  ))}
                </div>
              </div>

              {touched && !valid && (
                <p className="mt-4 text-[12.5px]" style={{ color: C.coralInk }}>
                  Please add your name, a working email and a valid number.
                </p>
              )}
              {failed && (
                <p className="mt-4 text-[12.5px]" style={{ color: C.coralInk }}>
                  {failed}
                </p>
              )}

              {/* The pay button takes the LIGHT-page tone, the same decision
                  PrimaryCTA makes in ./_landing/shared: deep ink fill, canvas
                  label, gold only in the shimmer. The gold fill is the tone
                  reserved for the dark hero stage, and this button has to match
                  the CTA the buyer just clicked to get here. */}
              <button
                type="submit"
                disabled={busy}
                className="lego-press cta-shimmer mt-7 inline-flex min-h-[58px] w-full items-center justify-center rounded-2xl px-6 text-[15.5px] font-bold disabled:opacity-60"
                style={{
                  background: C.ink,
                  color: C.canvas,
                  ['--shimmer' as string]: 'rgba(255,255,255,0.24)',
                }}
              >
                {/* The label is wrapped, exactly as PrimaryCTA wraps its own.
                    `.cta-shimmer > *` is what lifts a child to z-index 2 above
                    the z-index 1 sweep, and a bare text node is not a child it
                    can select, so the highlight would pass OVER the words
                    instead of behind them. */}
                <span>
                  {busy ? (
                    'Taking you to payment…'
                  ) : (
                    <>
                      Pay{' '}
                      <s className="mr-1 font-semibold opacity-70 decoration-2">{inr(strikeTotal)}</s>
                      <span key={pkg.totalRupees} className="total-bump">
                        {inr(pkg.totalRupees)}
                      </span>{' '}
                      &amp; Book My Spot
                    </>
                  )}
                </span>
              </button>

              <p className="mt-3 text-center text-[12.5px] font-semibold leading-snug" style={{ color: C.ink }}>
                <ShieldCheck
                  weight="fill"
                  aria-hidden
                  className="mr-1.5 inline-block h-4 w-4 align-[-3px]"
                  style={{ color: C.goldInk }}
                />
                {CTA_NOTE}
              </p>

              <div className="mt-4 flex flex-col items-center gap-2">
                <p
                  className="text-[10.5px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: C.goldDeep }}
                >
                  Challenge starts in
                </p>
                <StartCountdown />
              </div>

              {/* The three pointers that sit under every checkout CTA we ship.
                  Dot-separated on one line, each nowrap so a narrow phone wraps
                  BETWEEN them rather than mid-phrase. */}
              <div
                className="mt-4 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[10.5px] sm:text-[11px]"
                style={{ color: C.inkSoft }}
              >
                <span className="inline-flex items-center gap-1 whitespace-nowrap sm:gap-1.5">
                  <Lock weight="fill" className="h-3 w-3 shrink-0" style={{ color: C.goldInk }} />
                  Razorpay Secured
                </span>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap">SSL Encrypted</span>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap">100% Money-Back Guarantee</span>
              </div>

              <p
                className="mt-5 text-center text-[12px] leading-relaxed"
                style={{ color: C.inkSoft }}
              >
                Your personal data will be used to process your order, support
                your experience, and for other purposes described in our{' '}
                <Link
                  href="/privacy-policy"
                  className="font-semibold underline"
                  style={{ color: C.goldInk }}
                >
                  privacy policy
                </Link>
                .
              </p>

              <PaymentMethods />
            </form>

            {/* Phones see what they are paying for before the form. */}
            <div className="order-first lg:order-none lg:sticky lg:top-8">
              <OrderSummary pkg={pkg} strikeTotal={strikeTotal} />
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />

      {/* Phones only: room for the docked bar (sized for its tallest state,
          add-on rows showing), then the bar itself. */}
      <div aria-hidden className="lg:hidden" style={{ height: 'calc(236px + env(safe-area-inset-bottom))' }} />
      <div
        className="kz-dock fixed inset-x-0 bottom-0 z-50 lg:hidden"
        style={{
          background: C.canvas,
          borderTop: `1px solid ${C.lineStrong}`,
          boxShadow: '0 -8px 28px rgba(48, 68, 67, 0.18)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <p
          className="px-4 py-1.5 text-center text-[12px] font-semibold"
          style={{ background: C.goldDeep, color: C.onDark }}
        >
          Starts in <StartCountdown size="inline" />
        </p>

        {/* The add-on rows fold away while the full cards are on screen. The
            0fr/1fr grid row animates the height without measuring it. */}
        <div
          className="mx-auto grid max-w-6xl px-3 transition-[grid-template-rows,opacity] duration-300 ease-out"
          style={{
            gridTemplateRows: addonsInView ? '0fr' : '1fr',
            opacity: addonsInView ? 0 : 1,
          }}
          aria-hidden={addonsInView || undefined}
        >
          <div className="overflow-hidden">
            <div className="flex flex-col gap-2 pt-2.5">
              {ADDONS.map((a) => (
                <AddonRow
                  key={a.id}
                  addon={a}
                  on={addons.includes(a.id)}
                  onToggle={() => toggleAddon(a.id)}
                  hidden={addonsInView}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-3 pb-2 pt-2.5">
          <button
            type="submit"
            form="checkout-form"
            disabled={busy}
            className="lego-press cta-shimmer cta-breath inline-flex min-h-[54px] w-full items-center justify-center rounded-2xl px-4 text-center text-[15.5px] font-bold leading-tight disabled:opacity-60"
            style={{
              background: C.ink,
              color: C.canvas,
              ['--shimmer' as string]: 'rgba(255,255,255,0.24)',
            }}
          >
            <span>
              {busy ? (
                'Opening…'
              ) : (
                <>
                  Book My Spot ·{' '}
                  <span key={pkg.totalRupees} className="total-bump tabular-nums">
                    {inr(pkg.totalRupees)}
                  </span>
                </>
              )}
            </span>
          </button>
          <p className="mt-1.5 text-center text-[11px] font-semibold" style={{ color: C.goldInk }}>
            <ShieldCheck weight="fill" aria-hidden className="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" />
            {CTA_NOTE}
          </p>
        </div>
      </div>
    </main>
  );
}

/* ── Header. A way back, and nothing else: every other link is a way to not
      pay. No logo here: its maroon and teal do not read on this dark strip. ── */
function Header() {
  return (
    <header
      className="px-4 py-4 sm:px-6"
      style={{ background: C.navyDeep, color: C.onDark }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold"
          style={{ color: C.onDarkMute }}
        >
          <ArrowLeft weight="bold" className="h-3.5 w-3.5" />
          Back
        </Link>
      </div>
    </header>
  );
}

/* ── Order summary. Ported from the ankita-postpartum checkout, which is the
      house standard. Same blocks in the same order: lead item, included list,
      subtotal / bonus value, the ruled Total, the method tile, then the
      guarantee line. Accordion below lg, always open from lg up. ────────── */
function OrderSummary({ pkg, strikeTotal }: { pkg: Package; strikeTotal: number }) {
  const [open, setOpen] = useState(false);
  const [lead, ...bonuses] = RECAP;
  const bonusValue = VALUE_TOTAL - lead.value;

  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{ background: C.canvas, border: `1px solid ${C.line}` }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="order-summary-details"
        className="flex w-full items-center justify-between gap-3 text-left lg:pointer-events-none"
      >
        <span className="min-w-0">
          <span
            className="block text-[10.5px] font-bold uppercase tracking-[0.2em]"
            style={{ color: C.goldInk }}
          >
            Order summary
          </span>
          <span
            className="mt-2 block font-display text-[20px] font-semibold leading-snug sm:text-[22px]"
            style={{ color: C.ink }}
          >
            The 5-Day Challenge, in full
          </span>
          <span className="mt-1 block text-[12px] lg:hidden" style={{ color: C.inkSoft }}>
            {open ? 'Tap to hide details' : 'Tap to view what is included'}
          </span>
        </span>
        {/* Phones: the live total sits on the collapsed header, so the price
            is visible before anything is opened. */}
        <span className="flex shrink-0 items-center gap-2 lg:hidden">
          <span
            key={pkg.totalRupees}
            className="total-bump font-display text-[18px] font-semibold tabular-nums"
            style={{ color: C.goldDeep }}
          >
            {inr(pkg.totalRupees)}
          </span>
          <span
            className="grid h-7 w-7 place-items-center rounded-full"
            style={{ background: C.goldPale }}
          >
            <CaretDown
              weight="bold"
              className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              style={{ color: C.goldInk }}
            />
          </span>
        </span>
      </button>

      {/* Lead item, always visible: it is the thing being bought. */}
      <div
        className="mt-5 flex items-start gap-3 rounded-2xl p-3"
        style={{ background: C.canvasAlt, border: `1px solid ${C.line}` }}
      >
        <span
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl sm:h-14 sm:w-14"
          style={{ background: C.navyDeep }}
        >
          <span
            className="font-display text-[10px] font-bold uppercase tracking-[0.16em]"
            style={{ color: C.gold }}
          >
            Live
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p
            className="text-[13.5px] font-semibold leading-snug sm:text-[14px]"
            style={{ color: C.ink }}
          >
            {lead.title}
          </p>
          <p className="mt-0.5 text-[11px] sm:text-[11.5px]" style={{ color: C.inkSoft }}>
            {START_DATE} · {SESSION_TIMES}
          </p>
        </div>
        <div
          className="shrink-0 text-right font-display text-[14px] font-semibold tabular-nums sm:text-[15px]"
          style={{ color: C.ink }}
        >
          {inr(lead.value)}
        </div>
      </div>

      {/* Ticked add-ons, always visible like the lead item: they are part of
          what is being bought, not detail. */}
      {pkg.addons.map((a) => (
        <div
          key={a.id}
          className="addon-line-in mt-2 flex items-center gap-3 rounded-2xl p-3"
          style={{ background: TONE[a.id].bed, border: `1px solid ${C.line}` }}
        >
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl sm:h-14 sm:w-14"
            style={{ background: TONE[a.id].ink }}
          >
            <span
              className="text-center font-display text-[9px] font-bold uppercase leading-tight tracking-[0.12em]"
              style={{ color: C.onDark }}
            >
              Add
              <br />
              on
            </span>
          </span>
          <p
            className="min-w-0 flex-1 text-[13px] font-semibold leading-snug sm:text-[13.5px]"
            style={{ color: C.ink }}
          >
            {a.name}
          </p>
          <span
            className="shrink-0 font-display text-[14px] font-semibold tabular-nums sm:text-[15px]"
            style={{ color: TONE[a.id].ink }}
          >
            +{inr(a.priceRupees)}
          </span>
        </div>
      ))}

      <div id="order-summary-details" className={`${open ? 'block' : 'hidden'} lg:block`}>
        <div className="mt-4 space-y-1.5">
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.16em]"
            style={{ color: C.inkSoft }}
          >
            Free bonuses included
          </p>
          <ul className="space-y-1.5 text-[12px] sm:text-[12.5px]" style={{ color: C.inkSoft }}>
            {bonuses.map((r) => (
              <li key={r.title} className="flex items-start gap-2">
                <CheckCircle
                  weight="fill"
                  className="mt-[3px] h-3.5 w-3.5 shrink-0"
                  style={{ color: C.coralInk }}
                />
                <span className="flex-1 leading-snug">{r.title}</span>
                <span className="shrink-0 font-medium tabular-nums">{inr(r.value)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="my-5 h-px" style={{ background: C.line }} />

        <div className="space-y-2 text-[13.5px]">
          <div className="flex justify-between" style={{ color: C.inkSoft }}>
            <span>Full price</span>
            <span className="tabular-nums">{STRIKE_PRICE}</span>
          </div>
          <div className="flex justify-between font-semibold" style={{ color: C.ink }}>
            <span>Launch discount</span>
            <span className="tabular-nums">−{inr(STRIKE_PRICE_RUPEES - PRICE_RUPEES)}</span>
          </div>
          {pkg.addons.map((a) => (
            <div key={a.id} className="flex justify-between gap-3" style={{ color: C.ink }}>
              <span className="min-w-0">{a.name}</span>
              <span className="shrink-0 tabular-nums">+{inr(a.priceRupees)}</span>
            </div>
          ))}
          <div className="flex justify-between" style={{ color: C.inkSoft }}>
            <span>Total bonus value</span>
            <s
              className="decoration-[2.5px] underline-offset-2 tabular-nums"
              style={{ color: C.inkSoft, textDecorationColor: C.coralInk }}
            >
              {inr(bonusValue)}
            </s>
          </div>
        </div>
      </div>

      <div className="my-4 h-px" style={{ background: C.line }} />

      {/* The ruled Total. Gold appears here and nowhere else on the page. */}
      <div
        className="flex items-baseline justify-between gap-3 rounded-2xl px-4 py-3.5"
        style={{ background: C.goldWash, border: `1px solid ${C.lineStrong}` }}
      >
        <span
          className="font-display text-[13px] font-bold uppercase tracking-[0.12em] sm:text-[14px] sm:tracking-[0.14em]"
          style={{ color: C.ink }}
        >
          Total
        </span>
        <div className="flex items-baseline gap-2 text-right">
          <s
            className="text-[15px] font-semibold tabular-nums decoration-2 sm:text-[17px]"
            style={{ color: C.inkSoft }}
          >
            {inr(strikeTotal)}
          </s>
          <span
            key={pkg.totalRupees}
            className="total-bump font-display text-[26px] font-semibold leading-none tabular-nums sm:text-[32px]"
            style={{ color: C.goldDeep }}
          >
            {inr(pkg.totalRupees)}
          </span>
        </div>
      </div>

      {/* Method */}
      <div
        className="mt-5 flex items-start gap-3 rounded-2xl p-3"
        style={{ background: C.canvasAlt, border: `1px solid ${C.line}` }}
      >
        <CreditCard weight="duotone" className="h-5 w-5 shrink-0" style={{ color: C.goldInk }} />
        <div className="text-[12.5px]">
          <p className="font-semibold" style={{ color: C.ink }}>
            UPI · Cards · NetBanking
          </p>
          <p className="mt-0.5" style={{ color: C.inkSoft }}>
            Pay securely via Razorpay.
          </p>
        </div>
      </div>

      <p className="mt-4 text-center text-[12px]" style={{ color: C.inkSoft }}>
        <ShieldCheck
          weight="fill"
          aria-hidden
          className="mr-1.5 inline-block h-3.5 w-3.5 align-[-2px]"
          style={{ color: C.goldInk }}
        />
        {CTA_NOTE}
      </p>
    </div>
  );
}

/* ── Add-ons. A div with role="checkbox" rather than a <button>, because the
      card holds block content (a list) that a button may not contain. Space
      and Enter toggle it, as they would a native checkbox. ────────────── */
const checkboxKeys = (onToggle: () => void) => (e: React.KeyboardEvent) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    onToggle();
  }
};

function AddonTick({ on, tone, size = 22 }: { on: boolean; tone: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-md"
      style={{
        width: size,
        height: size,
        background: on ? tone : C.canvas,
        border: `2px solid ${tone}`,
      }}
    >
      {on && <Check weight="bold" className="addon-tick h-3/4 w-3/4" style={{ color: C.onDark }} />}
    </span>
  );
}

/* The pill with the live dot: the same pulse the landing page's eyebrows use. */
function AddonPill({ addon, small }: { addon: Addon; small?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold uppercase ${
        small ? 'px-2 py-[3px] text-[8.5px] tracking-[0.12em]' : 'px-2.5 py-1 text-[9.5px] tracking-[0.16em]'
      }`}
      style={{ background: TONE[addon.id].ink, color: C.onDark }}
    >
      <span
        className="lego-pulse-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: C.gold, ['--dot-pulse' as string]: 'rgba(253,147,9,0.6)' }}
      />
      {addon.badge}
    </span>
  );
}

function AddonCard({ addon, on, onToggle }: { addon: Addon; on: boolean; onToggle: () => void }) {
  const t = TONE[addon.id];
  return (
    <div
      role="checkbox"
      aria-checked={on}
      aria-label={`${addon.title}, add for ${inr(addon.priceRupees)}`}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={checkboxKeys(onToggle)}
      className="addon-card cursor-pointer select-none rounded-2xl p-4 sm:p-5"
      style={{
        background: on ? t.bed : C.canvas,
        border: on ? `2px solid ${t.ink}` : `2px dashed ${t.dash}`,
        ['--addon-ring' as string]: t.ring,
      }}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5">
          <AddonTick on={on} tone={t.ink} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <AddonPill addon={addon} />
            <span
              className="shrink-0 font-display text-[16px] font-bold tabular-nums sm:text-[17px]"
              style={{ color: t.ink }}
            >
              +{inr(addon.priceRupees)}
            </span>
          </div>
          <p
            className="mt-2.5 font-display text-[16px] font-semibold leading-snug sm:text-[17px]"
            style={{ color: C.ink }}
          >
            {addon.title}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed sm:text-[13px]" style={{ color: C.inkSoft }}>
            {addon.blurb}
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {addon.points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-[12.5px] leading-snug" style={{ color: C.ink }}>
                <Check weight="bold" className="mt-[2px] h-3.5 w-3.5 shrink-0" style={{ color: t.ink }} />
                {p}
              </li>
            ))}
          </ul>
          <p
            className="mt-3 text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: on ? t.ink : C.coralInk }}
          >
            {on ? (
              <>✓ Added to your order · Tap to remove</>
            ) : (
              <>
                <span aria-hidden className="addon-nudge mr-1.5">👉</span>
                Tap to add for {inr(addon.priceRupees)} more
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/* The compact version for the phone's docked bar. */
function AddonRow({
  addon,
  on,
  onToggle,
  hidden,
}: {
  addon: Addon;
  on: boolean;
  onToggle: () => void;
  hidden: boolean;
}) {
  const t = TONE[addon.id];
  return (
    <div
      role="checkbox"
      aria-checked={on}
      aria-label={`${addon.short}, ${inr(addon.priceRupees)}`}
      tabIndex={hidden ? -1 : 0}
      onClick={onToggle}
      onKeyDown={checkboxKeys(onToggle)}
      className="addon-card flex min-h-[44px] cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2"
      style={{
        background: on ? t.bed : C.canvas,
        border: on ? `1.5px solid ${t.ink}` : `1.5px dashed ${t.dash}`,
        ['--addon-ring' as string]: t.ring,
      }}
    >
      <AddonTick on={on} tone={t.ink} size={20} />
      <AddonPill addon={addon} small />
      <span className="min-w-0 flex-1 text-[12.5px] font-semibold leading-tight" style={{ color: C.ink }}>
        {addon.short}
      </span>
      <span className="shrink-0 text-[13px] font-bold tabular-nums" style={{ color: t.ink }}>
        +{inr(addon.priceRupees)}
      </span>
    </div>
  );
}

/* ── Themed select. A button that opens a listbox in the page palette, with
      the keyboard behaviour of a native select: Arrow keys move, Enter or
      Space picks, Escape and Tab close, a click outside closes. ────────── */
function ThemedSelect({
  labelledBy,
  ariaLabel,
  placeholder = '',
  options,
  value,
  onChange,
  bad,
  className = '',
  listClassName = 'inset-x-0',
  compact = false,
}: {
  /** Tighter padding, for a narrow box like the dialling code. */
  compact?: boolean;
  /** Id of a visible label, or `ariaLabel` when there is none. */
  labelledBy?: string;
  ariaLabel?: string;
  placeholder?: string;
  /** `short` is what the closed box shows, for a box narrower than the label. */
  options: { value: string; label: string; short?: string }[];
  value: string;
  onChange: (v: string) => void;
  bad: boolean;
  className?: string;
  /** Width/position of the open panel. Defaults to the trigger's width. */
  listClassName?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus({ preventScroll: true });

    /* Below lg the docked bar covers the bottom ~250px of the screen, and a
       list opening low on the page would slide under it. Scroll just enough
       to show the whole list above the bar. */
    const btn = btnRef.current;
    const list = listRef.current;
    if (btn && list) {
      const bottom = btn.getBoundingClientRect().bottom + 8 + list.offsetHeight;
      const room = window.innerHeight - (window.innerWidth < 1024 ? 250 : 16);
      if (bottom > room) window.scrollBy({ top: bottom - room, behavior: 'smooth' });
    }

    const away = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  /* A long list scrolls, so keep the highlighted row on screen as the arrows
     (or typed letters) move it. */
  useEffect(() => {
    if (open) document.getElementById(`${id}-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);

  const openList = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const pick = (i: number) => {
    onChange(options[i].value);
    setOpen(false);
    btnRef.current?.focus();
  };

  const onButtonKey = (e: React.KeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      openList();
    }
  };
  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (/^[a-z]$/i.test(e.key)) {
      /* Type-to-jump, as a native select does: a letter moves to the next
         option starting with it, wrapping, so "U" steps UAE, UK, USA. */
      const k = e.key.toLowerCase();
      for (let n = 1; n <= options.length; n += 1) {
        const i = (active + n) % options.length;
        if (options[i].label.toLowerCase().startsWith(k)) {
          setActive(i);
          break;
        }
      }
    }
  };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={ariaLabel ? `${ariaLabel}: ${selected?.label ?? placeholder}` : undefined}
        aria-labelledby={labelledBy ? `${labelledBy} ${id}-value` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onButtonKey}
        className={`flex w-full items-center justify-between rounded-xl py-3 text-left text-[15px] outline-none transition-[border-color,box-shadow] duration-200 focus-visible:ring-2 ${
          compact ? 'gap-1.5 pl-3 pr-2' : 'gap-3 px-4'
        }`}
        style={{
          background: C.canvasAlt,
          color: selected ? C.ink : C.inkSoft,
          border: `1px solid ${bad ? C.coralInk : open ? C.goldInk : C.line}`,
          boxShadow: open ? '0 0 0 3px rgba(74,0,8,0.08)' : undefined,
          ['--tw-ring-color' as string]: 'rgba(74,0,8,0.25)',
        }}
      >
        <span id={`${id}-value`} className="truncate">
          {selected ? (selected.short ?? selected.label) : placeholder}
        </span>
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
          style={{ background: C.goldPale }}
        >
          <CaretDown
            weight="bold"
            className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            style={{ color: C.goldInk }}
          />
        </span>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelledBy}
          aria-label={labelledBy ? undefined : ariaLabel}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKey}
          className={`addon-line-in absolute left-0 top-full z-30 mt-2 max-h-[280px] overflow-y-auto overscroll-contain rounded-xl p-1.5 outline-none ${listClassName}`}
          style={{
            background: C.canvas,
            border: `1px solid ${C.lineStrong}`,
            boxShadow: '0 18px 40px -16px rgba(48,68,67,0.35)',
            /* The list takes focus only to receive arrow keys; the active row
               is the focus indicator, so the global focus ring is suppressed. */
            outline: 'none',
          }}
        >
          {options.map((o, i) => {
            const isSel = o.value === value;
            const isActive = i === active;
            return (
              <li
                key={o.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={isSel}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className="flex cursor-pointer select-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors duration-150"
                style={{
                  background: isActive ? C.goldPale : 'transparent',
                  color: isSel ? C.goldInk : C.ink,
                  fontWeight: isSel ? 600 : 400,
                }}
              >
                {o.label}
                {isSel && <Check weight="bold" className="h-4 w-4 shrink-0" style={{ color: C.goldInk }} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── One field. Kept as a component so every input carries the same label
      treatment, the same error state and the same focus ring. ──────────── */
function Field({
  label,
  type,
  autoComplete,
  placeholder,
  value,
  onChange,
  bad,
  note,
}: {
  label: string;
  type: string;
  autoComplete: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  bad: boolean;
  note?: string;
}) {
  return (
    <label className="block">
      <span
        className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.16em]"
        style={{ color: C.inkSoft }}
      >
        {label}
      </span>
      <input
        className="w-full rounded-xl px-4 py-3 text-[15px] outline-none"
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={bad || undefined}
        style={{
          background: C.canvasAlt,
          color: C.ink,
          border: `1px solid ${bad ? C.coralInk : C.line}`,
        }}
      />
      {note && (
        <span className="mt-1.5 block text-[11.5px]" style={{ color: C.inkSoft }}>
          {note}
        </span>
      )}
    </label>
  );
}

function PaymentMethods() {
  return (
    <div
      className="mt-6 rounded-2xl p-4"
      style={{ background: C.canvasAlt, border: `1px solid ${C.line}` }}
    >
      <p
        className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.16em]"
        style={{ color: C.inkSoft }}
      >
        100% Secure &amp; Safe Payments
      </p>
      <PaymentLogos size="full" />
    </div>
  );
}
