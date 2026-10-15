"use client";

import { useEffect, useState } from "react";

/** Current time, refreshed every `intervalMs`. For presence dots and "5m ago" labels. */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
