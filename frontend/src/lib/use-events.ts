"use client";

import { useEffect, useRef } from "react";

/**
 * Subscribe to a server-sent-events channel (Phase 8a).
 *
 * Opens a single EventSource per channel and runs `onEvent` with every
 * decoded payload. Auto-reconnects via the browser's built-in
 * EventSource retry. Auth is handled by the cookie, same as every
 * other request.
 *
 * Usage:
 *   useEvents("occupancy", (evt) => {
 *     queryClient.invalidateQueries({ queryKey: keys.dashboard.summary() });
 *   });
 */
export function useEvents(channel: string, onEvent: (data: unknown) => void) {
  // Keep the latest handler in a ref so re-renders don't tear down the
  // EventSource — only the channel change should.
  const handlerRef = useRef(onEvent);
  useEffect(() => { handlerRef.current = onEvent; }, [onEvent]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = `/api/v1/events/stream?channel=${encodeURIComponent(channel)}`;
    let es: EventSource | null;
    try {
      es = new EventSource(url, { withCredentials: true });
    } catch {
      es = null;
    }
    if (!es) return;

    const handle = (evt: MessageEvent) => {
      try {
        handlerRef.current(JSON.parse(evt.data));
      } catch {
        handlerRef.current(evt.data);
      }
    };
    // Server names the event ("event: occupancy" / "event: notification"),
    // so we register the listener under that exact channel name.
    es.addEventListener(channel, handle as EventListener);
    es.addEventListener("error", () => {
      // Browser auto-reconnects; nothing to do.
    });

    return () => {
      es?.removeEventListener(channel, handle as EventListener);
      es?.close();
    };
  }, [channel]);
}
