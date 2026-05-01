import { useEventName } from '../store/useEventNamesStore';

interface EventNameProps {
  eventKey: string | undefined | null;
  /** Optional TBA API key; only needed if the active store doesn't have it. */
  apiKey?: string;
  /** Render the event_key alongside the name as a small mono suffix (default false). */
  showCode?: boolean;
  /** Fallback rendered while name is loading. Defaults to the event key. */
  fallback?: string;
  className?: string;
}

/**
 * Renders an event's friendly name (e.g. "Texas Robotics Invitational") in
 * place of its event_key (e.g. "2026txri"). Falls back to the key while
 * fetching or if the fetch fails. See useEventNamesStore for the cache.
 */
export function EventName({ eventKey, apiKey, showCode, fallback, className }: EventNameProps) {
  const name = useEventName(eventKey ?? '', apiKey);
  if (!eventKey) return null;
  const display = name && name !== eventKey ? name : (fallback ?? eventKey);
  return (
    <span className={className}>
      {display}
      {showCode && name && name !== eventKey && (
        <span className="ml-1 text-xs font-mono text-textMuted">({eventKey})</span>
      )}
    </span>
  );
}

export default EventName;
