/**
 * /thank-you: the BASE package (challenge only). The page itself lives in
 * ./view.tsx, shared with the three add-on confirmation routes beside this
 * one; with no add-ons it renders exactly the original page.
 */
import ThankYouView from './view';

export default function ThankYouPage() {
  return <ThankYouView addons={[]} />;
}
