import { useT } from '../lib/i18n.js';

// The app wordmark: "קליק חתימה" with the first word in the brand color.
export default function BrandName() {
  const t = useT();
  const [first, ...rest] = t('קליק חתימה').split(' ');
  return (
    <span className="brand-name brand-klik">
      <b>{first}</b> {rest.join(' ')}
    </span>
  );
}
