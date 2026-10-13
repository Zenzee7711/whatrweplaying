import { useCallback, useMemo, useSyncExternalStore } from "react";

// The shortlist: saved game IDs in this browser (public IDs only, nothing personal).
// useSyncExternalStore keeps the server render ("empty") and the browser render consistent.
const KEY = "wrwp:shortlist";
const listeners = new Set<() => void>();
let current: string | null = null;
let loaded = false;

function read(): string | null {
  if (!loaded) {
    loaded = true;
    try {
      current = localStorage.getItem(KEY);
    } catch {
      current = null;
    }
  }
  return current;
}

function write(ids: string[]) {
  current = JSON.stringify(ids);
  try {
    localStorage.setItem(KEY, current);
  } catch {
    // Blocked storage: the shortlist works for this visit only.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useShortlist(isKnown: (id: string) => boolean) {
  const raw = useSyncExternalStore(subscribe, read, () => null);
  const ids = useMemo(() => {
    try {
      const parsed = JSON.parse(raw ?? "[]");
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string" && isKnown(id)).slice(0, 20) : [];
    } catch {
      return [];
    }
  }, [raw, isKnown]);

  // Reads the latest saved list at click time, not the one from the last render, so two quick
  // clicks on different games can't overwrite each other.
  const toggle = useCallback((id: string) => {
    let latest: string[] = [];
    try {
      const parsed = JSON.parse(read() ?? "[]");
      latest = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
    } catch {
      latest = [];
    }
    write(latest.includes(id) ? latest.filter((x) => x !== id) : [...latest, id].slice(0, 20));
  }, []);
  const replace = useCallback((next: string[]) => write(next.slice(0, 20)), []);
  return { ids, toggle, replace };
}
