import { startTransition, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { PRINT_PREPARE_EVENT } from "./print";

// LONG LISTS WITHOUT A FROZEN SCREEN. A register of 150 lines, a sheet of 58
// operators by 20 skills, a year of files: building all of it in one go keeps
// a slow computer busy for seconds before anything shows. Instead the first
// lines are shown at once and the rest are added a batch at a time, between
// frames and at low priority — the page is readable and clickable straight
// away, and typing or scrolling is never held up by the lines still coming.
// Once every line is in, a line added later (Add Row) shows at once.
// Printing never waits on it: every line is put in before the page is measured
// for printing (utils/print.ts).

/** How many of `total` lines to show now; grows to `total` a batch at a time. */
export function useProgressiveCount(total: number, first = 40, batch = 60): number {
  const [count, setCount] = useState(() => Math.min(total, first));
  const complete = useRef(total <= first);
  if (count >= total) complete.current = true;

  useEffect(() => {
    if (complete.current || count >= total) return;
    const timer = window.setTimeout(() => startTransition(() => setCount((c) => Math.min(total, c + batch))), 16);
    return () => window.clearTimeout(timer);
  }, [count, total, batch]);

  useEffect(() => {
    if (complete.current || count >= total) return;
    const everything = () => flushSync(() => setCount(total));
    window.addEventListener(PRINT_PREPARE_EVENT, everything);
    return () => window.removeEventListener(PRINT_PREPARE_EVENT, everything);
  }, [count, total]);

  return complete.current ? total : Math.min(count, total);
}
