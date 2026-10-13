/**
 * Above the fold: the announcement strip, the hero stage, the stat bar that
 * straddles the seam beneath it, and the affiliation strip.
 *
 * A pure Server Component (no 'use client', no hooks) so it paints from static
 * HTML with zero JavaScript on the critical path.
 *
 * COPY IS VERBATIM from COPY-SOURCE.md. Where a run-on line is split across
 * elements the words and their order are untouched; nothing is re-voiced,
 * shortened or added.
 *
 * The stage is LIGHT (24 Sep 2026). The page has no dark band at all: navy
 * survives as the colophon footer and as two contained objects inside light
 * bands. Every token in this file that was picked to carry on navy has stepped
 * to its light-ground variant, and each of those is commented at its call site
 * because the failure mode is silent: the page still looks plausible.
 */
import {
  ArrowRight,
  CalendarBlank,
  Clock,
  Hourglass,
  Lock,
  ShieldCheck,
  Star,
  Trophy,
  VideoCamera,
} from '@phosphor-icons/react/dist/ssr';
import Image from 'next/image';
import Link from 'next/link';

import { asset } from './asset-version';
import { legoBrick, legoDelay } from './lego-style';
import {
  CHECKOUT_HREF,
  CTA_LABEL,
  CTA_LABEL_STICKY,
  CTA_NOTE,
  PRICE,
  PRODUCT_NAME,
  RECOGNITION_YEAR,
  SESSION_TIMES,
  START_DATE,
  STRIKE_PRICE,
  STUDENTS_TRAINED,
  YEARS_IN_FIELD,
} from './offer';
import { Art, C, MediaPlaceholder } from './shared';

/* ══ 0 · Announcement strip ════════════════════════════════════════════════
   A slim strip with one live saffron dot and a slow shine, so it reads as
   alive rather than as a static red sale bar. It names a specific price, a
   specific anchor and a specific date, never "limited time".

   Dark oxblood rail so it pulls the eye above the light stage. Price tokens
   are saffron (7.2:1 on oxblood). */
export function AnnouncementBar() {
  const segments = [
    <>
      <span className="font-bold">Special Offer:</span> {PRODUCT_NAME} for{' '}
      <span style={{ color: C.gold }}>{PRICE}</span>
    </>,
    <>100% Money-Back Guarantee</>,
    <>
      Live · Starts {START_DATE} · {SESSION_TIMES}
    </>,
  ];

  /* One copy of the strip, rendered twice inside the track, which is what makes
     a -50% translate loop seamlessly: at the reset the second copy sits exactly
     where the first began. The duplicate is decorative, so it is hidden from
     assistive tech rather than read out twice. */
  const strip = (copy: '1' | '2') => (
    <ul
      key={copy}
      data-marquee-copy={copy}
      aria-hidden={copy === '2' ? true : undefined}
      className="flex shrink-0 items-center gap-x-3 whitespace-nowrap pr-3 text-[12.5px] leading-snug sm:text-[13.5px]"
    >
      {segments.map((seg, i) => (
        <li key={i} className="inline-flex items-center gap-3 pr-3">
          {i === 0 ? (
            <span
              className="lego-pulse-dot inline-block h-[7px] w-[7px] shrink-0 rounded-full"
              style={{
                background: C.coral,
                ['--dot-pulse' as string]: 'rgba(253,147,9,0.6)',
              }}
            />
          ) : (
            <span aria-hidden style={{ color: 'rgba(255,255,255,0.35)' }}>
              |
            </span>
          )}
          <span>{seg}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div
      className="cta-shimmer w-full py-2.5"
      style={{
        background: C.goldDeep,
        color: C.onDark,
        ['--shimmer' as string]: 'rgba(255,255,255,0.14)',
      }}
    >
      {/* The mask lives on this inner element, NOT on the bar. A mask applies to
          the element's own background as well as its content, so masking the bar
          fades the strip's own fill and lets the page behind show through at
          both ends. */}
      <div className="kz-marquee">
        <div className="kz-marquee-track">
          {strip('1')}
          {strip('2')}
        </div>
      </div>
    </div>
  );
}

/* ══ 1 · Hero ══════════════════════════════════════════════════════════════ */

/**
 * The mobile client banner. `ratio` must match the file's own dimensions:
 * object-cover in a mismatched box crops, and a banner is usually carrying type.
 */
const BANNER: { src: string | null; ratio: string; alt: string } = {
  src: '/system/offer-stack.webp',
  ratio: '4 / 3',
  alt: 'Santosh Ghatpande · 5-Day Music Therapy Practitioner Challenge',
};

const HERO_FACTS = [
  { icon: CalendarBlank, text: `Starts ${START_DATE}` },
  { icon: Clock, text: SESSION_TIMES },
  { icon: VideoCamera, text: 'Live, Expert-Led Music Therapy Sessions' },
];

export function Hero() {
  return (
    <>
      <section data-hero className="kz-stage pb-24 pt-8">
        {/* The header mark. The file is the logo on its own white ground, so
            .kz-mark multiplies it into the stage: the white drops out over the
            blooms instead of showing as a box. It only works on a DIRECT child
            of .kz-stage, because every child there is its own stacking context
            and would otherwise blend against nothing. */}
        <div className="kz-mark mx-auto flex max-w-[1180px] justify-center px-5 md:px-8 lg:justify-start">
          <Image
            src={asset('/brand/anahat-logo.png')}
            alt="Anahat Transformations"
            width={2258}
            height={2098}
            sizes="120px"
            loading="eager"
            className="h-[76px] w-auto sm:h-[92px] lg:h-[104px]"
          />
        </div>

        <div className="mx-auto grid max-w-[1180px] items-center gap-9 px-5 pt-6 sm:gap-12 md:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16 lg:pt-8">
          {/* ══ LEFT ══════════════════════════════════════════════════════ */}
          <div className="text-center lg:text-left">
            {/* The gate line: who this is for, said before anything is sold. */}
            {/* The SectionEyebrow treatment (goldPale bed, oxblood type) plus a
                saffron hairline so it reads as a pill rather than as a block
                of shaded text. */}
            <span
              className="inline-flex max-w-[560px] items-start gap-2.5 rounded-3xl px-4 py-2.5 text-left text-[11px] font-bold uppercase leading-[1.5] tracking-[0.12em]"
              style={{
                background: C.goldPale,
                border: `1px solid ${C.goldMid}`,
                color: C.goldInk,
              }}
            >
              <span
                className="lego-pulse-dot mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: C.coral,
                  ['--dot-pulse' as string]: 'rgba(253,147,9,0.6)',
                }}
              />
              For Music Lovers Who Want To Turn Their Passion Into A Practical
              Skill, Additional Income or A New Sense Of Purpose
            </span>

            {/* ONE lit token in the headline, the same .kz-accent every
                SectionHeading uses. The second line is the copy's own
                qualifier, set smaller so the promise still leads. */}
            <h1
              className="mt-6 font-display text-[39px] font-semibold leading-[1.06] sm:text-[51px] lg:text-[62px]"
              style={{ color: C.ink }}
            >
              Build A Practical{' '}
              <span className="kz-accent">Music Therapy Skill</span>
              <span
                className="mt-4 block text-[21px] font-normal leading-[1.35] sm:text-[24px] lg:text-[26px]"
                style={{ color: C.inkSoft }}
              >
                In Just <strong className="font-bold" style={{ color: C.ink }}>5 Days</strong>, Even If You&apos;ve
                Never Studied <mark className="kz-boxword">Psychology</mark>,{' '}
                <mark className="kz-boxword">Medicine</mark> Or{' '}
                <mark className="kz-boxword">Music Professionally</mark>
              </span>
            </h1>

            {/* ══ THE MOBILE CLIENT BANNER ═════════════════════════════════
                Phone and tablet only, directly under the headline.

                It exists because of what the two layouts do differently. From
                `lg` up the offer card sits in the right column level with the
                headline, so the screen already has its one large image and a
                second here would be a repeat. Below `lg` that card is stacked a
                long way down, so the top of a phone screen is pure type from
                the announcement bar to the CTA. This is what breaks that up.

                `lg:hidden`, not `md:hidden`: THIS grid goes two-column at `lg`
                (see the wrapper above), so the banner has to persist through
                the whole single-column range or a tablet gets the wall of type
                the phone had. Read from the wrapper, not assumed.

                `sizes="100vw"` because in this range it genuinely is the full
                width, and NO `priority`: the LCP candidate on a phone is the
                headline, and preloading a multi-megabyte banner pushes the text
                it sits under further out. */}
            {BANNER.src ? (
              <Art
                src={asset(BANNER.src)}
                alt={BANNER.alt}
                ratio={BANNER.ratio}
                sizes="100vw"
                className="mt-7 lg:hidden"
              />
            ) : (
              <MediaPlaceholder
                ratio={BANNER.ratio}
                label="Mobile hero banner · 16:9"
                className="mt-7 lg:hidden"
              />
            )}

            <p
              className="mx-auto mt-6 max-w-[600px] text-[16px] leading-[1.7] lg:mx-0"
              style={{ color: C.inkSoft }}
            >
              A live, expert-led, 5-day music therapy challenge that combines
              music-and-brain science, guided therapeutic activities, real-life
              applications and personalised plan-building to help you practically
              apply music therapy and start building the foundation of your own
              practice. Starts {START_DATE}, live on Zoom.
            </p>

            <div className="mt-9 flex justify-center lg:justify-start">
              {/* Shimmer, but no breath: the offer card beside it is the page's
                  focal action and carries the one breathing CTA. Two breathing
                  buttons on one screen is two primaries, which is none. */}
              <Link
                href={CHECKOUT_HREF}
                data-cta
                className="lego-press cta-shimmer group inline-flex min-h-[58px] w-full items-center justify-center gap-2.5 rounded-full px-8 py-4 font-body text-[15.5px] font-bold sm:w-auto"
                style={{
                  /* Saffron is 2.25:1 against the stage, so the pill's edge is
                     carried by its shadow: an ink-tinted drop plus a saffron
                     spread. Label is oxblood, 7.2:1 on the fill. */
                  background: C.ctaGold,
                  color: C.onCta,
                  boxShadow:
                    '0 14px 30px -16px rgba(48,68,67,0.42), 0 10px 28px -10px rgba(253,147,9,0.5)',
                  ['--shimmer' as string]: 'rgba(255,255,255,0.55)',
                }}
              >
                <span className="inline-flex items-center gap-2.5">
                  {CTA_LABEL}
                  <ArrowRight
                    weight="bold"
                    className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </div>

            {/* Welded to the button, never floated away from it. */}
            <p
              className="mt-4 flex items-center justify-center gap-2 text-[13.5px] font-medium lg:justify-start"
              style={{ color: C.inkSoft }}
            >
              {/* coralInk (violet, 9.3:1), not coral: saffron is 2.25:1 on
                  white and this glyph carries meaning. */}
              <ShieldCheck weight="fill" className="h-4 w-4 shrink-0" style={{ color: C.coralInk }} />
              {CTA_NOTE}
            </p>

            {/* The three facts, on a hairline rule rather than in boxes. */}
            <ul
              className="mt-9 flex flex-col items-stretch gap-px overflow-hidden rounded-2xl sm:flex-row"
              style={{
                /* This background IS the 1px rules: the rows sit on gap-px and
                   it shows through between them, so it must be darker than
                   the rows. */
                background: C.lineStrong,
                border: `1px solid ${C.line}`,
              }}
            >
              {HERO_FACTS.map(({ icon: Icon, text }, idx) => (
                <li
                  key={text}
                  data-lego=""
                  className="flex flex-1 items-center justify-center gap-2.5 px-4 py-3.5 text-center text-[13px] font-semibold"
                  style={{
                    ...legoDelay(idx, 90),
                    /* Opaque, or the dot grid reads through the type. */
                    background: C.canvas,
                    color: C.ink,
                  }}
                >
                  <Icon weight="bold" className="h-4 w-4 shrink-0" style={{ color: C.goldInk }} />
                  {text}
                </li>
              ))}
            </ul>
          </div>

          {/* ══ RIGHT · the offer card ════════════════════════════════════
              The page's single focal object. There is no video and no
              photography yet, so the offer itself is what catches the light.

              The floor ramp has warmed by the time it reaches the card, and
              the card keeps the strong hairline, the saffron ring and the drop
              shadow. The offer-stack image sits above the eyebrow. */}
          <div>
            <div
              data-lego=""
              /* Centred on mobile, left from lg up. On a phone the card is the
                 whole screen and a centred stack reads as one deliberate
                 object; on desktop it sits beside a left-aligned headline, and
                 centring it there would break that shared edge. */
              className="rounded-[28px] p-7 text-center sm:p-8 lg:text-left"
              style={{
                ...legoDelay(2, 90),
                background: C.canvas,
                border: `1px solid ${C.lineStrong}`,
                boxShadow:
                  '0 0 0 8px rgba(253,147,9,0.12), 0 28px 60px -34px rgba(48,68,67,0.42)',
              }}
            >
              <Art
                src={asset('/system/offer-stack-animated.webp')}
                alt="Santosh with the 5 day cards and the 3 resources"
                ratio="1 / 1"
                sizes="(min-width: 1024px) 460px, 100vw"
                className="mb-6"
              />
              <span
                className="inline-flex items-center rounded-full px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.18em]"
                style={{ background: C.goldPale, color: C.goldInk }}
              >
                LIVE ON ZOOM · 2 SESSION TIMINGS
              </span>

              <h2
                className="mt-4 font-display text-[30px] font-semibold leading-[1.12]"
                style={{ color: C.ink }}
              >
                {PRODUCT_NAME}
              </h2>
              <p className="mt-2 text-[14px]" style={{ color: C.inkSoft }}>
                Live experiential sessions · Zoom · 2 session timings
              </p>

              <div
                className="mt-6 flex items-baseline justify-center gap-3 border-t pt-6 lg:justify-start"
                style={{ borderColor: C.line }}
              >
                <s
                  className="font-display text-[26px] font-semibold leading-none tabular-nums decoration-2"
                  style={{ color: C.inkSoft }}
                >
                  {STRIKE_PRICE}
                </s>
                <span className="kz-lit font-display text-[53px] font-semibold leading-none">
                  {PRICE}
                </span>
                <span className="text-[13px]" style={{ color: C.inkSoft }}>
                  one-time
                </span>
              </div>

              {/* THE breathing CTA. The only one on the page. */}
              <Link
                href={CHECKOUT_HREF}
                data-cta
                className="lego-press cta-shimmer cta-breath group mt-6 inline-flex min-h-[56px] w-full items-center justify-center gap-2.5 rounded-2xl font-body text-[15.5px] font-bold"
                style={{
                  background: C.ink,
                  color: C.canvas,
                  ['--shimmer' as string]: 'rgba(255,255,255,0.24)',
                }}
              >
                <span className="inline-flex items-center gap-2.5">
                  {CTA_LABEL_STICKY}
                  <ArrowRight
                    weight="bold"
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
                  />
                </span>
              </Link>

              <p
                className="mt-4 flex items-center justify-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: C.inkSoft }}
              >
                <Lock weight="fill" className="h-3.5 w-3.5" style={{ color: C.goldInk }} />
                100% Secure · UPI / Card / NetBanking
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="kz-stage-seam" aria-hidden />
      <StatBar />
      <AffiliationStrip />
    </>
  );
}

/* ══ 2 · The stat bar ══════════════════════════════════════════════════════
   Four figures on a ruled row, lifted so the card straddles the seam at the
   foot of the stage: the join is a designed object rather than a colour
   change. Both sides of that seam are light now, so the card is doing the work
   the value change used to do.

   The source copy sets these with emoji (⭐ 🛡️ 🏆). They render as
   matched-weight line icons instead: emoji as UI is the single loudest
   template tell and renders differently on every device the audience owns. The
   words are untouched. */
const STATS = [
  {
    icon: Star,
    big: STUDENTS_TRAINED,
    small: 'Students Trained',
    bed: C.goldPale,
    fg: C.goldInk,
  },
  /* An hourglass, not the group glyph this started with: the cell states a
     DURATION, and the people cell is the one directly before it. Two cells
     marked as "people" reads as one proof said twice. */
  {
    icon: Hourglass,
    big: YEARS_IN_FIELD,
    small: 'In Music Therapy',
    bed: C.coralBed,
    fg: C.coralInk,
  },
  {
    icon: ShieldCheck,
    big: '100%',
    small: 'Money-Back Guarantee',
    bed: C.navyBed,
    fg: C.ink,
  },
  {
    icon: Trophy,
    big: 'Top Music Therapy',
    small: `Service Provider in India · ${RECOGNITION_YEAR}`,
    bed: C.goldPale,
    fg: C.goldInk,
  },
];

function StatBar() {
  return (
    <div className="relative z-10 mx-auto -mt-14 max-w-[1120px] px-5 md:px-8">
      <ul
        className="grid grid-cols-2 gap-x-5 gap-y-7 rounded-3xl px-6 py-8 sm:px-9 lg:grid-cols-4"
        style={{
          background: C.canvas,
          border: `1px solid ${C.line}`,
          boxShadow: '0 26px 54px -30px rgba(48,68,67,0.35)',
        }}
      >
        {STATS.map(({ icon: Icon, big, small, bed, fg }, idx) => (
          /* lego-hover-icon: the whole row is the hover target so the hit area
             stays generous, but only the glyph moves. Lifting a figure drags
             the eye off the number, which is the one thing worth reading. */
          <li
            key={small}
            data-lego=""
            className="lego-hover-icon flex items-center gap-3.5"
            style={legoBrick(idx, 85)}
          >
            <span
              data-lego-stud=""
              className="lego-stud grid h-11 w-11 shrink-0 place-items-center rounded-full"
              style={{ ...legoBrick(idx, 85), background: bed }}
            >
              <Icon weight="fill" className="h-5 w-5" style={{ color: fg }} />
            </span>
            <span className="leading-tight">
              <span
                className="block font-display text-[23px] font-semibold"
                style={{ color: C.ink }}
              >
                {big}
              </span>
              <span className="mt-0.5 block text-[12.5px]" style={{ color: C.inkSoft }}>
                {small}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ══ 2b · Affiliated With ══════════════════════════════════════════════════ */
const AFFILIATIONS = [
  { src: '/brand/hssc.png', alt: 'Healthcare Sector Skill Council', w: 459, h: 232 },
  { src: '/brand/skill-india.png', alt: 'Skill India', w: 337, h: 291 },
];

function AffiliationStrip() {
  return (
    <section className="px-5 pb-4 pt-14 md:px-8" style={{ background: C.canvas }}>
      <div className="mx-auto max-w-[1000px] text-center">
        <p
          className="text-[10.5px] font-bold uppercase tracking-[0.22em]"
          style={{ color: C.goldInk }}
        >
          Affiliated With
        </p>
        {/* Equal halves so the divider (the first item's right border) sits on the page centre. */}
        <ul className="mt-6 grid grid-cols-2 items-center">
          {AFFILIATIONS.map((a, i) => (
            <li
              key={a.src}
              className={`flex px-6 sm:px-12 ${i === 0 ? 'justify-end border-r' : 'justify-start'}`}
              style={{ borderColor: C.line }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset(a.src)}
                alt={a.alt}
                width={a.w}
                height={a.h}
                loading="lazy"
                decoding="async"
                className="h-16 w-auto sm:h-20"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
