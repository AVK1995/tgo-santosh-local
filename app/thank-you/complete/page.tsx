/** /thank-you/complete: challenge + recordings + private call. See ../view.tsx. */
import ThankYouView from '../view';

export default function CompleteThankYouPage() {
  return <ThankYouView addons={['recording', 'private_call']} />;
}
