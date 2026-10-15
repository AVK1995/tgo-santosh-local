import type { Metadata } from 'next';
import Link from 'next/link';

import LegalPageLayout from '@/components/LegalPageLayout';

import { LEGAL, LEGAL_DISCLAIMER, LEGAL_STRUCTURE_KNOWN } from '../_landing/legal';
import { PRICE, SESSION_TIMES, START_DATE } from '../_landing/offer';

export const metadata: Metadata = {
  title: `Terms and Conditions | ${LEGAL.brand}`,
  description: `The terms that apply when you join the ${LEGAL.product}.`,
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms and Conditions"
      effectiveDate={LEGAL.effectiveDate}
      intro={`These terms apply when you buy or take part in the ${LEGAL.product}. By completing checkout you agree to them.`}
    >
      {/* The legal structure is NAMED ONLY WHEN IT IS KNOWN. Asserting one in
          the terms decides who the counterparty is, who is liable, and which
          name has to match the PAN and the gateway's merchant record, so while
          LEGAL.structure is empty this sentence runs without the phrase, which
          asserts nothing untrue. Fill the field and the sentence reshapes
          itself around it. */}
      <h2>1. Who we are</h2>
      <p>
        The programme is provided by {LEGAL.entity}
        {LEGAL_STRUCTURE_KNOWN ? `, ${LEGAL.structure},` : ','} trading as{' '}
        {LEGAL.tradeName}, {LEGAL.address}.
      </p>

      <h2>2. What you are buying</h2>
      <p>
        Access to the {LEGAL.product}: five live expert-led sessions delivered
        on Zoom, starting {START_DATE}, with two session timings each day
        ({SESSION_TIMES}), together with the digital resources listed at
        checkout. The fee is {PRICE}.
      </p>

      <h2>3. Sessions and scheduling</h2>
      <ul>
        <li>
          Sessions run live at the advertised times. Session recordings are not
          included in the challenge fee; they are available only as a separately
          paid add-on chosen at checkout, and are shared on Day 5, after the
          final live class.
        </li>
        <li>
          We may move a session for reasons outside our control. Registered
          participants will be told as early as possible.
        </li>
        <li>You are responsible for your own internet access and device.</li>
      </ul>

      {/* The client's OWN disclaimer, the same string the footer renders, not
          a version rewritten for this page. It is legal copy and it names
          specific medical claims, so it is moved rather than paraphrased, and
          it lives in one place so the two surfaces cannot drift. */}
      <h2>4. Health disclaimer</h2>
      <p>{LEGAL_DISCLAIMER}</p>

      <h2>5. Your access</h2>
      <ul>
        <li>Access is personal to you and must not be shared or resold.</li>
        <li>
          Recording, redistributing or republishing any session or guide is not
          permitted.
        </li>
        <li>
          We may withdraw access without refund for abusive conduct toward staff
          or other participants.
        </li>
      </ul>

      <h2>6. Intellectual property</h2>
      <p>
        All session content, guides, recordings and materials remain the property
        of {LEGAL.entity}. You get a personal, non-transferable licence to use
        them for your own benefit.
      </p>

      <h2>7. Results and certification</h2>
      <p>
        We describe what participants commonly notice. We do not promise a
        specific outcome, and results vary with individual circumstances,
        consistency and health status.
      </p>
      <p>
        The Anahat Certificate of Completion and the national-level HSSC
        certification described on the site are part of the broader
        practitioner training pathway. They are{' '}
        <strong>not awarded through the {LEGAL.product} alone</strong>.
      </p>

      <h2>8. Payment and refunds</h2>
      <p>
        Payment is taken at checkout through our payment processor. Refunds are
        governed by our{' '}
        <Link href="/refund-policy">Refund Policy</Link>.
      </p>

      <h2>9. Liability</h2>
      <p>
        To the extent permitted by law, our total liability in connection with
        the programme is limited to the amount you paid for it. Nothing in these
        terms limits liability that cannot lawfully be limited.
      </p>

      <h2>10. Governing law</h2>
      <p>
        These terms are governed by the laws of India, and the courts of{' '}
        {LEGAL.jurisdiction} have exclusive jurisdiction.
      </p>

      <h2>11. Contact</h2>
      <p>
        {LEGAL.entity}, trading as {LEGAL.tradeName}, {LEGAL.address}.
        <br />
        <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
        {' · '}
        <a href={`tel:${LEGAL.phoneHref}`}>{LEGAL.phone}</a>
      </p>
    </LegalPageLayout>
  );
}
