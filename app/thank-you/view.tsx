'use client';

/**
 * The confirmation page, shared by all four packages:
 *
 *   /thank-you                 base only (the original page, unchanged)
 *   /thank-you/recordings      + recordings: adds the recordings WhatsApp group
 *   /thank-you/private-call    + private call: adds the book-your-call card
 *   /thank-you/complete        both: community, recordings group, call card
 *
 * Each route passes its add-on ids in. Nothing is read from the URL but the
 * payment id, so the page a buyer sees is decided by the route the checkout
 * sent them to (THANK_YOU_PATH in app/checkout/addons.ts).
 *
 * With no add-ons this renders exactly the base page as it was before add-ons
 * existed: every add-on block below is conditional on the package.
 *
 * Copy and section order follow the ankita-postpartum thank-you page, which is
 * the house standard for a challenge funnel: confirmation → the WhatsApp join
 * as the ONE next step → what arrives inside → be early → the policy → prep →
 * final nudge. Skinned to this project's tokens.
 *
 * The page is built around the community join, not around the receipt. That is
 * the point of the design: the Zoom links live in the group, so a buyer who
 * never joins is a refund waiting to happen. Everything else on the page is
 * subordinate to that one button.
 *
 * ⚠️ COPY-SOURCE.md CARRIES NO THANK-YOU PAGE. Every string on this page that
 * is not the product name, the date, the session timings or the guarantee is
 * house standard rather than the client's, and the two lists that assert
 * something about how the challenge runs are flagged at the constant they
 * belong to. Have Santosh read them before launch.
 */

import Link from 'next/link';
import { Suspense, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

import {
  ArrowRight,
  CalendarBlank,
  CalendarCheck,
  ChatCircleDots,
  Check,
  CheckCircle,
  Clock,
  Confetti,
  Heart,
  Megaphone,
  MusicNotes,
  Notebook,
  ShieldCheck,
  VideoCamera,
  Warning,
  WhatsappLogo,
  X,
} from '@phosphor-icons/react/dist/ssr';

import { LEGAL } from '../_landing/legal';
import { packageOf, type AddonId } from '../checkout/addons';
import { inr } from '../checkout/included';
import {
  CALL_BOOKING_URL,
  GUIDE_NAME,
  PRODUCT_NAME,
  SESSION_TIMES,
  START_DATE,
  WHATSAPP_INVITE,
  WHATSAPP_RECORDINGS_INVITE,
} from '../_landing/offer';
import SiteFooter from '@/components/SiteFooter';
import { C } from '../_landing/shared';
import { trackPurchase } from '@/lib/track';

/* WhatsApp's own brand colours. These deliberately do NOT come from the page
   palette: the community button is the same green on every funnel we ship, so
   a buyer recognises what it opens before reading the label. */
const WA = { green: '#25D366', deep: '#128C7E' } as const;

/* The two action colours on these pages, shared by the step cards and the
   phone's sticky bar so a step looks the same in both places: WhatsApp green
   for a group join, black for the call calendar. */
const STEP_BG = {
  whatsapp: `linear-gradient(135deg, ${WA.deep}, ${WA.green})`,
  call: 'linear-gradient(135deg, #2B2B2B, #0A0A0A)',
} as const;

/* Semantic, not brand: green means good and amber means caution on every page
   we ship. These are the steps that read on the LIGHT ground this page sits
   on. The amber is the 700 rather than the 600, because it is small text on
   the #FEF3C7 chip below (5.3:1) rather than on the page. */
const GOOD_GREEN = '#059669';
const WARN_AMBER = '#B45309';

const COMMUNITY_BENEFITS: { icon: typeof CheckCircle; text: string }[] = [
  { icon: ChatCircleDots, text: 'Daily Zoom session links' },
  { icon: Megaphone, text: 'Session reminders before each session' },
  { icon: Notebook, text: 'Instructions for each day' },
  { icon: MusicNotes, text: 'Your guided activities and resources' },
  { icon: Heart, text: `Important updates from ${GUIDE_NAME}` },
];

/* ⚠️ HOUSE STANDARD, NOT THIS CLIENT'S COPY, and both lists assert something
   about how the challenge runs. They are plausible for a dated live challenge
   and they are unconfirmed. Have Santosh read them before launch.

   A "no refunds for missed live sessions" line is deliberately NOT here. It is
   not his copy, and it would flatly contradict the 100% Money-Back Guarantee
   the sales page promises five times. A buyer who reads the promise, pays, and
   then reads the contradiction on the very next screen has a dispute the
   merchant loses. Whatever refund terms come back from the client belong in
   app/refund-policy/page.tsx first. */
const POLICY_ITEMS = [
  'No rescheduling to future batches',
  'Recordings are not guaranteed',
];

const PREP_ITEMS = [
  'Be in a quiet, distraction-free space',
  'Keep a notebook and pen ready',
  'Join the community immediately',
];

/* The headline and lead line per package. Base keeps the original wording. */
const HERO: Record<string, { lead: string; accent: string; body: string }> = {
  base: {
    lead: 'Your 5-Day Music Therapy Challenge is',
    accent: 'Confirmed.',
    body: 'Please read this page carefully, your access depends on the next step.',
  },
  base_recording: {
    lead: 'Your Challenge & Session Recordings are',
    accent: 'Confirmed.',
    body: 'Your recordings of all 5 sessions are added to your order, and will be shared on Day 5, right after the final live class. Please complete both steps below: your live access and your recordings each come through their own group.',
  },
  base_private_call: {
    lead: `Your Challenge & Private Call with ${GUIDE_NAME.split(' ')[0]} are`,
    accent: 'Confirmed.',
    body: `Your private 1-on-1 call with ${GUIDE_NAME} is added to your order. Please complete both steps below: join the community, then book your call slot, anytime that suits you.`,
  },
  base_recording_private_call: {
    lead: 'Your Complete Challenge Package is',
    accent: 'Confirmed.',
    body: `Your seat, recordings of all 5 sessions and a private 1-on-1 call with ${GUIDE_NAME} are all on your order. The recordings are shared on Day 5, right after the final live class, and you can book your call anytime. Please complete all three steps below.`,
  },
};

export default function ThankYouView({ addons }: { addons: AddonId[] }) {
  return (
    <Suspense fallback={null}>
      <ThankYou addons={addons} />
    </Suspense>
  );
}

function ThankYou({ addons }: { addons: AddonId[] }) {
  const params = useSearchParams();
  const paymentId = params.get('p') ?? '';
  /* The package comes from the ROUTE, not the URL query: display and the GA4
     browser value only. The webhook reads the real add-ons off the order. */
  const pkg = useMemo(() => packageOf(addons), [addons]);
  const hasRecording = pkg.addonIds.includes('recording');
  const hasCall = pkg.addonIds.includes('private_call');
  const totalSteps = 1 + (hasRecording ? 1 : 0) + (hasCall ? 1 : 0);

  /* The phone's sticky bar: the same steps as the cards, in the same order. */
  const steps: { label: string; href: string; tone: 'whatsapp' | 'call' }[] = [
    { label: 'Join Challenge Community', href: WHATSAPP_INVITE, tone: 'whatsapp' },
    ...(hasRecording
      ? [{ label: 'Join Recordings Group', href: WHATSAPP_RECORDINGS_INVITE, tone: 'whatsapp' as const }]
      : []),
    ...(hasCall ? [{ label: 'Book My Call Slot', href: CALL_BOOKING_URL, tone: 'call' as const }] : []),
  ];
  const stickyHeading = hasCall
    ? `Complete ${totalSteps === 2 ? 'both' : `all ${totalSteps}`} steps`
    : hasRecording
      ? 'Join both WhatsApp groups'
      : 'Join the WhatsApp community';
  const hero = HERO[pkg.code];

  /* GA4 purchase only. Meta's Purchase and the server-side GA4 copy both come
     from the Razorpay webhook, where the payment is proven and where buyers
     who never return to this page are still counted, which for UPI is most of
     them.

     `p` is the razorpay_payment_id, put there by the checkout page's success
     handler. It is the same string the webhook uses as the Meta event_id and
     the GA4 transaction_id, so the two sources of this sale collapse into one
     wherever they meet. */
  useEffect(() => {
    if (paymentId) trackPurchase(paymentId, pkg.addonIds);
  }, [paymentId, pkg]);

  return (
    <main style={{ background: C.canvasAlt }}>
      {/* ── Confirmation ─────────────────────────────────────────────── */}
      <section className="px-5 pb-14 pt-12 text-center md:pb-20 md:pt-20">
        <div className="mx-auto max-w-3xl">
          <span
            className="mx-auto grid h-20 w-20 place-items-center rounded-full"
            style={{ background: C.goldWash, border: `1px solid ${C.lineStrong}` }}
          >
            <Confetti weight="duotone" className="h-10 w-10" style={{ color: C.goldInk }} />
          </span>

          <span
            className="mt-6 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em]"
            style={{ background: C.goldWash, color: C.goldInk }}
          >
            <Check weight="bold" className="h-3 w-3" />
            Congrats!
          </span>

          <h1
            className="mt-5 font-display text-[30px] font-semibold leading-[1.05] tracking-tight sm:text-[44px] lg:text-[52px]"
            style={{ color: C.ink, textWrap: 'balance' } as React.CSSProperties}
          >
            {hero.lead}{' '}
            <span style={{ color: C.goldDeep }}>{hero.accent}</span>
          </h1>

          <p
            className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed sm:text-[17px]"
            style={{ color: C.inkSoft }}
          >
            You are officially enrolled in the{' '}
            <strong style={{ color: C.ink }}>{PRODUCT_NAME}.</strong> {hero.body}
          </p>

          <div className="mx-auto mt-8 grid max-w-lg gap-3 sm:grid-cols-2">
            <DetailCard icon={CalendarBlank} label="Challenge starts" value={START_DATE} />
            <DetailCard
              icon={Clock}
              label="Live session timings"
              value={SESSION_TIMES}
              footnote="Pick whichever time fits your day"
            />
          </div>

          {/* The add-ons bought with the seat, each with what happens next,
              so nobody wonders where their recording or call went. */}
          {pkg.addons.length > 0 && (
            <ul className="mx-auto mt-4 grid max-w-lg gap-3 text-left">
              {pkg.addons.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-2xl p-4"
                  style={{ background: C.canvas, border: `1px solid ${C.line}` }}
                >
                  <CheckCircle
                    weight="fill"
                    className="mt-0.5 h-5 w-5 shrink-0"
                    style={{ color: GOOD_GREEN }}
                  />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold" style={{ color: C.ink }}>
                      {a.name} · Added
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug" style={{ color: C.inkSoft }}>
                      {a.id === 'recording'
                        ? 'Recordings of all 5 live sessions are shared in your recordings group on Day 5, right after the final live class. Join it below.'
                        : `Book your call with ${GUIDE_NAME.split(' ')[0]} anytime, at a time that suits you. Your private booking link is below, and in your email and WhatsApp.`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {paymentId && (
            <p
              className="mt-6 text-[11.5px] font-medium uppercase tracking-[0.14em]"
              style={{ color: C.inkSoft }}
            >
              Payment ID {paymentId} · {inr(pkg.totalRupees)} paid
            </p>
          )}
        </div>
      </section>

      {/* ── The next steps. Step 1 is always the challenge community; the
            recordings group and the call booking follow when bought. ──── */}
      <section id="next-steps" className="scroll-mt-6 px-5 pb-4 md:px-8">
        <div
          className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl p-8 text-center text-white md:p-10"
          style={{ background: `linear-gradient(135deg, ${WA.deep}, ${WA.green})` }}
        >
          <span
            aria-hidden
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 2px, transparent 2px 22px)',
            }}
          />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em]">
              <Warning weight="fill" className="h-3 w-3" />
              Important · Step 1 of {totalSteps}
            </span>

            <h2 className="mt-4 font-display text-[24px] font-semibold leading-tight sm:text-[34px]">
              Join the WhatsApp Community now.
            </h2>

            <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-white/90">
              All updates, Zoom links, reminders and daily instructions will be
              shared inside the WhatsApp Community.{' '}
              <strong className="text-white">
                Your access to the challenge depends on joining this group.
              </strong>
            </p>

            {/* THE CTA ALWAYS RENDERS. This card IS a CTA: the community join is
                the one post-purchase action, and a version of it with the button
                swapped out is not a quieter card, it is a different component
                that asks the buyer for nothing. The MISSING case is made loud
                for us instead of quiet for the buyer. */}
            <a
              href={WHATSAPP_INVITE || undefined}
              target={WHATSAPP_INVITE ? '_blank' : undefined}
              rel={WHATSAPP_INVITE ? 'noopener noreferrer' : undefined}
              aria-disabled={WHATSAPP_INVITE ? undefined : true}
              className={`group mt-7 inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-4 font-display text-[15px] font-semibold ${
                WHATSAPP_INVITE ? '' : 'cursor-not-allowed opacity-70'
              }`}
              style={{ color: WA.deep }}
            >
              <WhatsappLogo weight="fill" className="h-5 w-5" />
              Join the Community Here
              <ArrowRight
                weight="bold"
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </a>

            {WHATSAPP_INVITE ? (
              <p className="mt-4 text-[11.5px] text-white/80">
                Opens in WhatsApp · 1-click join
              </p>
            ) : (
              /* Actionable and true, rather than a promise of automation that
                 does not exist. The address is the monitored inbox from
                 legal.ts, so it moves with the client's real support address. */
              <p className="mt-4 text-[12px] font-semibold text-white/90">
                Having trouble joining? Write to {LEGAL.email} and we will send
                your invite.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ── Step 2: the recordings group (recordings buyers only) ──────── */}
      {hasRecording && (
        <section className="px-5 pb-4 pt-4 md:px-8">
          <StepCard
            tone="whatsapp"
            step={`Step 2 of ${totalSteps}`}
            icon={VideoCamera}
            title="Join the Recordings Group."
            body={
              <>
                Recordings of all 5 live sessions will be shared inside this
                separate WhatsApp group on{' '}
                <strong className="text-white">Day 5, right after the final live class</strong>.{' '}
                <strong className="text-white">
                  It is only for buyers of the recordings, so please join it as
                  well as the community above.
                </strong>
              </>
            }
            href={WHATSAPP_RECORDINGS_INVITE}
            cta="Join the Recordings Group"
            ctaIcon={WhatsappLogo}
            note="Opens in WhatsApp · Link also sent to your email & WhatsApp"
            missingNote={`Having trouble joining? Write to ${LEGAL.email} and we will send your recordings invite.`}
          />
        </section>
      )}

      {/* ── Last step: book the private call (call buyers only) ────────── */}
      {hasCall && (
        <section className="px-5 pb-4 pt-4 md:px-8">
          <StepCard
            tone="call"
            step={`Step ${totalSteps} of ${totalSteps}`}
            icon={CalendarCheck}
            title={`Book your private call with ${GUIDE_NAME.split(' ')[0]}.`}
            body={
              <>
                You can book anytime: choose a date and time that suits you
                from {GUIDE_NAME.split(' ')[0]} sir&rsquo;s calendar.{' '}
                <strong className="text-white">
                  Your 1-on-1 call is confirmed once you pick your slot.
                </strong>{' '}
                This booking link is private to you and is not shared in any
                group: it is here, and we have also sent it to your email and
                WhatsApp.
              </>
            }
            href={CALL_BOOKING_URL}
            cta="Book My Call Slot"
            ctaIcon={CalendarCheck}
            note="Opens the booking calendar in a new tab · Also sent to your email & WhatsApp"
            missingNote={`Having trouble booking? Write to ${LEGAL.email} and we will schedule your call with you.`}
          />
        </section>
      )}

      {/* ── What arrives inside ──────────────────────────────────────── */}
      <section className="px-5 py-16 md:px-8 md:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <SectionEyebrow text="What you'll receive inside" />
            <h2
              className="mt-3 font-display text-[24px] font-semibold leading-tight sm:text-[32px]"
              style={{ color: C.ink }}
            >
              What you&rsquo;ll receive in the{' '}
              <span style={{ color: C.goldDeep }}>community.</span>
            </h2>
          </div>

          <ul className="mt-10 space-y-3">
            {COMMUNITY_BENEFITS.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-center gap-4 rounded-2xl p-4"
                style={{ background: C.canvas, border: `1px solid ${C.line}` }}
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                  style={{ background: C.goldPale }}
                >
                  <Icon weight="duotone" className="h-5 w-5" style={{ color: C.goldInk }} />
                </span>
                <span className="text-[14.5px] font-medium" style={{ color: C.inkSoft }}>
                  {text}
                </span>
                <CheckCircle
                  weight="fill"
                  className="ml-auto h-5 w-5 shrink-0"
                  style={{ color: GOOD_GREEN }}
                />
              </li>
            ))}
          </ul>

          <p
            className="mt-6 rounded-xl p-4 text-center text-[13.5px] font-medium"
            style={{ background: '#FEF3C7', color: WARN_AMBER, border: '1px solid #FDE68A' }}
          >
            <Warning weight="fill" className="mr-1.5 inline-block h-4 w-4 align-text-bottom" />
            Please do <strong>not mute</strong> or{' '}
            <strong>exit the community</strong> during these <strong>5 days</strong>.
          </p>
        </div>
      </section>

      {/* ── Be available 5 min before ────────────────────────────────── */}
      <section className="px-5 pb-4 md:px-8">
        <div
          className="mx-auto max-w-3xl rounded-3xl p-7 md:p-9"
          style={{ background: C.canvas, border: `1px solid ${C.line}` }}
        >
          <div className="flex items-start gap-4">
            <span
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl"
              style={{ background: C.goldPale, border: `1px solid ${C.line}` }}
            >
              <Clock weight="duotone" className="h-6 w-6" style={{ color: C.goldInk }} />
            </span>
            <div className="min-w-0">
              <h3
                className="font-display text-[18px] font-semibold leading-snug sm:text-[20px]"
                style={{ color: C.ink }}
              >
                Please be available{' '}
                <span style={{ color: C.goldDeep }}>5 minutes before</span> each
                live session.
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed" style={{ color: C.inkSoft }}>
                These are <strong>live, expert-led sessions</strong> with guided
                activities you take part in. Arriving late may mean missing
                important instructions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Important policy ─────────────────────────────────────────── */}
      <section className="px-5 py-16 md:px-8 md:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <SectionEyebrow text="Please note" />
            <h2
              className="mt-3 font-display text-[24px] font-semibold leading-tight sm:text-[32px]"
              style={{ color: C.ink }}
            >
              Important <span style={{ color: C.goldDeep }}>policy.</span>
            </h2>
            <p className="mt-3 text-[14.5px]" style={{ color: C.inkSoft }}>
              Because this is a live, structured experience:
            </p>
          </div>

          {/* Column count tracks POLICY_ITEMS.length by hand, because Tailwind
              cannot build a class from a variable. Two items; put this back to
              sm:grid-cols-3 if a third is added. */}
          {/* A buyer who PAID for the recordings must not be told recordings
              are not guaranteed, so that line drops out and the grid closes
              to one column. */}
          <ul
            className={`mt-8 grid grid-cols-1 gap-3 ${
              pkg.addonIds.includes('recording') ? '' : 'sm:grid-cols-2'
            }`}
          >
            {POLICY_ITEMS.filter(
              (item) => !(pkg.addonIds.includes('recording') && /recording/i.test(item)),
            ).map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-2xl p-5 text-center"
                style={{ background: C.canvas, border: `1px solid ${C.line}` }}
              >
                <X weight="bold" className="mt-0.5 h-4 w-4 shrink-0" style={{ color: C.coralInk }} />
                <span
                  className="text-[13.5px] font-semibold leading-snug"
                  style={{ color: C.inkSoft }}
                >
                  {item}
                </span>
              </li>
            ))}
          </ul>

          <div
            className="mt-8 rounded-2xl p-5 text-center"
            style={{ background: C.canvasAlt, border: `1px solid ${C.line}` }}
          >
            <p className="font-display text-[15px] font-semibold" style={{ color: C.ink }}>
              Your spot has been reserved exclusively for you.
            </p>
            <p className="mt-1.5 text-[12.5px]" style={{ color: C.inkSoft }}>
              (The 100% Money-Back Guarantee you joined with is set out in our{' '}
              <Link href="/refund-policy" className="underline" style={{ color: C.goldInk }}>
                refund policy
              </Link>
              .)
            </p>
          </div>
        </div>
      </section>

      {/* ── Prep checklist ───────────────────────────────────────────── */}
      <section className="px-5 pb-16 md:px-8 md:pb-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <SectionEyebrow text="Quick prep" />
            <h2
              className="mt-3 font-display text-[24px] font-semibold leading-tight sm:text-[32px]"
              style={{ color: C.ink }}
            >
              What to do <span style={{ color: C.goldDeep }}>before Day One.</span>
            </h2>
            <p className="mt-3 text-[14.5px]" style={{ color: C.inkSoft }}>
              To get the most out of the five days, please:
            </p>
          </div>

          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PREP_ITEMS.map((item, i) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-2xl p-4"
                style={{ background: C.canvas, border: `1px solid ${C.line}` }}
              >
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full font-display text-[11.5px] font-bold"
                  style={{
                    background: `linear-gradient(135deg, ${C.goldMid}, ${C.goldDeep})`,
                    color: C.canvas,
                  }}
                >
                  {i + 1}
                </span>
                <span
                  className="text-[14px] font-medium leading-snug"
                  style={{ color: C.inkSoft }}
                >
                  {item}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-center text-[13.5px]" style={{ color: C.inkSoft }}>
            <ShieldCheck
              weight="fill"
              className="mr-1.5 inline-block h-4 w-4 align-text-bottom"
              style={{ color: C.goldInk }}
            />
            <strong style={{ color: C.ink }}>No prior training required.</strong>{' '}
            Even if you have never studied psychology, medicine or music
            professionally.
          </p>
        </div>
      </section>

      {/* ── Final nudge ──────────────────────────────────────────────── */}
      <section
        className="relative isolate overflow-hidden px-5 py-16 md:px-8 md:py-20"
        style={{ background: C.navyDeep }}
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-40"
          style={{
            background: `radial-gradient(ellipse at top, rgba(253,147,9,0.10) 0%, transparent 62%)`,
          }}
        />
        <div className="mx-auto max-w-3xl text-center">
          <h2
            className="font-display text-[26px] font-semibold leading-tight sm:text-[36px]"
            style={{ color: C.onDark }}
          >
            This is your <span style={{ color: C.gold }}>first step</span>
            <br className="hidden sm:block" /> toward a practical music therapy
            skill.
          </h2>
          <p className="mt-4 text-[14.5px]" style={{ color: C.onDarkMute }}>
            Now, join the community and we&rsquo;ll see you inside.
          </p>

          {/* Same rule as the card above: the closing band asks for the action
              in both states rather than ending the page on a paragraph. */}
          <div className="mt-8">
            <a
              href={WHATSAPP_INVITE || undefined}
              target={WHATSAPP_INVITE ? '_blank' : undefined}
              rel={WHATSAPP_INVITE ? 'noopener noreferrer' : undefined}
              aria-disabled={WHATSAPP_INVITE ? undefined : true}
              className={`group inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-4 font-display text-[15px] font-semibold shadow-2xl transition-transform duration-200 sm:w-auto sm:text-[16px] ${
                WHATSAPP_INVITE ? 'hover:-translate-y-0.5' : 'cursor-not-allowed opacity-70'
              }`}
              style={{ color: WA.deep }}
            >
              <WhatsappLogo weight="fill" className="h-5 w-5" />
              Join the Community
              <ArrowRight
                weight="bold"
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </a>
          </div>
        </div>
      </section>

      <SiteFooter />

      {/* ── Mobile sticky steps: every action this page asks for, numbered
            in the same order as the cards and in the cards' colours (green
            for a WhatsApp group, black for the call calendar). ──────────── */}
      <div
        aria-hidden
        className="md:hidden"
        style={{ height: `calc(${52 + steps.length * 60}px + env(safe-area-inset-bottom, 0px))` }}
      />
      <div
        className="kz-dock fixed inset-x-0 bottom-0 z-40 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          className="rounded-t-3xl border-t px-4 pb-3 pt-3 shadow-[0_-10px_30px_-12px_rgba(48,68,67,0.35)] backdrop-blur"
          style={{ background: 'rgba(255,255,255,0.96)', borderColor: C.line }}
        >
          <p
            className="mb-2.5 text-center font-display text-[14.5px] font-semibold"
            style={{ color: C.ink }}
          >
            <span aria-hidden className="addon-nudge mr-1.5">👇</span>
            {stickyHeading}
          </p>
          <div className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <a
                key={s.label}
                href={s.href || undefined}
                target={s.href ? '_blank' : undefined}
                rel={s.href ? 'noopener noreferrer' : undefined}
                aria-disabled={s.href ? undefined : true}
                className={`lego-press relative inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-full px-12 py-3 font-display text-[15px] font-semibold text-white ${
                  s.href ? '' : 'cursor-not-allowed opacity-60'
                }`}
                style={{
                  background: s.tone === 'whatsapp' ? STEP_BG.whatsapp : STEP_BG.call,
                  boxShadow:
                    s.tone === 'whatsapp'
                      ? '0 8px 22px -8px rgba(37,211,102,0.7)'
                      : '0 8px 22px -8px rgba(0,0,0,0.55)',
                }}
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold"
                  style={{ background: 'rgba(255,255,255,0.25)' }}
                >
                  {i + 1}
                </span>
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

/* ── A next-step card after the community one. Same build as that card (the
      house standard): striped gradient, step pill, headline, a white
      full-width button that ALWAYS renders, and a loud fallback when its
      link env var is missing. `whatsapp` uses WhatsApp's green so the
      buyer knows what it opens; `call` is black, as on the sticky bar. */
function StepCard({
  tone,
  step,
  icon: Icon,
  title,
  body,
  href,
  cta,
  ctaIcon: CtaIcon,
  note,
  missingNote,
}: {
  tone: 'whatsapp' | 'call';
  step: string;
  icon: typeof Clock;
  title: string;
  body: React.ReactNode;
  href: string;
  cta: string;
  ctaIcon: typeof Clock;
  note: string;
  missingNote: string;
}) {
  const bg = tone === 'whatsapp' ? STEP_BG.whatsapp : STEP_BG.call;
  const ink = tone === 'whatsapp' ? WA.deep : '#0A0A0A';
  return (
    <div
      className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl p-8 text-center text-white md:p-10"
      style={{ background: bg }}
    >
      <span
        aria-hidden
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0 2px, transparent 2px 22px)',
        }}
      />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em]">
          <Icon weight="fill" className="h-3 w-3" />
          Important · {step}
        </span>

        <h2 className="mt-4 font-display text-[24px] font-semibold leading-tight sm:text-[34px]">
          {title}
        </h2>

        <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-white/90">{body}</p>

        <a
          href={href || undefined}
          target={href ? '_blank' : undefined}
          rel={href ? 'noopener noreferrer' : undefined}
          aria-disabled={href ? undefined : true}
          className={`group mt-7 inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full bg-white px-7 py-4 font-display text-[15px] font-semibold ${
            href ? '' : 'cursor-not-allowed opacity-70'
          }`}
          style={{ color: ink }}
        >
          <CtaIcon weight="fill" className="h-5 w-5" />
          {cta}
          <ArrowRight
            weight="bold"
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
          />
        </a>

        {href ? (
          <p className="mt-4 text-[11.5px] text-white/80">{note}</p>
        ) : (
          <p className="mt-4 text-[12px] font-semibold text-white/90">{missingNote}</p>
        )}
      </div>
    </div>
  );
}

function DetailCard({
  icon: Icon,
  label,
  value,
  footnote,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  footnote?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 text-left"
      style={{ background: C.canvas, border: `1px solid ${C.line}` }}
    >
      <div className="flex items-center gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg"
          style={{ background: C.goldPale }}
        >
          <Icon weight="duotone" className="h-5 w-5" style={{ color: C.goldInk }} />
        </span>
        <div className="min-w-0">
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.16em]"
            style={{ color: C.inkSoft }}
          >
            {label}
          </p>
          <p
            className="mt-0.5 font-display text-[14px] font-semibold leading-snug"
            style={{ color: C.ink }}
          >
            {value}
          </p>
        </div>
      </div>
      {footnote && (
        <p className="mt-2 text-[11.5px]" style={{ color: C.inkSoft }}>
          {footnote}
        </p>
      )}
    </div>
  );
}

function SectionEyebrow({ text }: { text: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.2em]"
      style={{ background: C.goldWash, color: C.goldInk }}
    >
      <span
        aria-hidden
        className="inline-block h-1 w-1 rounded-full"
        style={{ background: C.goldInk }}
      />
      {text}
    </span>
  );
}
