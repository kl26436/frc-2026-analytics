import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useEffect } from 'react';
import { getEvent } from '../utils/tbaApi';

interface EventNamesState {
  /** eventKey → friendly name */
  names: Record<string, string>;
  /** Keys currently being fetched, to dedupe in-flight requests */
  inFlight: string[];
  /** Synchronously seed a name (used by AnalyticsStore when active event TBAEvent loads). */
  setName: (eventKey: string, name: string) => void;
  /** Asynchronously resolve a name via TBA `/event/{key}`. Cached forever (event names don't change). */
  resolve: (eventKey: string, apiKey?: string) => Promise<string>;
}

export const useEventNamesStore = create<EventNamesState>()(
  persist(
    (set, get) => ({
      names: {},
      inFlight: [],

      setName: (eventKey, name) => {
        if (!eventKey || !name) return;
        const existing = get().names[eventKey];
        if (existing === name) return;
        set(state => ({ names: { ...state.names, [eventKey]: name } }));
      },

      resolve: async (eventKey, apiKey) => {
        const cached = get().names[eventKey];
        if (cached) return cached;
        if (get().inFlight.includes(eventKey)) {
          // Wait briefly for the in-flight call to complete
          await new Promise(r => setTimeout(r, 200));
          return get().names[eventKey] ?? eventKey;
        }
        set(state => ({ inFlight: [...state.inFlight, eventKey] }));
        try {
          const event = await getEvent(eventKey, apiKey);
          set(state => ({
            names: { ...state.names, [eventKey]: event.name },
            inFlight: state.inFlight.filter(k => k !== eventKey),
          }));
          return event.name;
        } catch {
          set(state => ({ inFlight: state.inFlight.filter(k => k !== eventKey) }));
          return eventKey;
        }
      },
    }),
    {
      name: 'frc-event-names',
      partialize: state => ({ names: state.names }),
    },
  ),
);

/**
 * Returns the friendly name for an event key, fetching from TBA if not cached.
 * Returns the key itself as a fallback while fetching or if the fetch fails.
 */
export function useEventName(eventKey: string | undefined | null, apiKey?: string): string {
  const name = useEventNamesStore(state => (eventKey ? state.names[eventKey] : undefined));
  const resolve = useEventNamesStore(state => state.resolve);

  useEffect(() => {
    if (!eventKey) return;
    if (name) return;
    void resolve(eventKey, apiKey);
  }, [eventKey, name, resolve, apiKey]);

  return name ?? eventKey ?? '';
}
