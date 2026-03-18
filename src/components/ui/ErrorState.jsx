/**
 * Shared error state component for data-loading pages.
 * Replaces 7+ different inline error patterns with a single consistent UI.
 *
 * Uses the existing .page-error CSS from App.css.
 */
export default function ErrorState({ title, message, error, className }) {
  return (
    <div className={className || 'page-error'}>
      <h2>{title || 'Unable to load data'}</h2>
      <p>{message || error?.message || 'Please try refreshing the page.'}</p>
    </div>
  )
}
