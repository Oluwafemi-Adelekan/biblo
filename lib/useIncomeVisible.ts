"use client";

import { useCallback, useSyncExternalStore } from "react";

/* Whether income figures are shown, anywhere they appear.

   One switch, and it lives on the Budget screen next to the number
   it most obviously governs. Individual rows in the expense list are
   never hidden: the point is that a glance should not hand over the
   headline, not that the list becomes unreadable.

   It lives in the browser rather than the database: it is about who
   might be looking over your shoulder right now, not about your money.

   Read through useSyncExternalStore so the server renders the same
   thing every time and the browser corrects it on hydration, instead
   of setting state inside an effect. */

export const INCOME_KEY = "biblo.showIncome";
export const INCOME_CHANGED = "biblo:income-visibility";
const KEY = INCOME_KEY;
const CHANGED = INCOME_CHANGED;

/* Falls back to memory when storage is blocked, so the toggle still
   works for the session even if it cannot be remembered. */
let memo = true;

function subscribe(notify: () => void) {
  // `storage` covers other tabs; the custom event covers this one,
  // since a tab does not hear its own storage writes. Both matter so
  // the figure and the eye beside it never disagree.
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGED, notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGED, notify);
  };
}

function read() {
  /* A device-level peek wins; with none, the account's own setting
     (carried on <body> by the layout) is the default. */
  try {
    const v = localStorage.getItem(KEY);
    if (v !== null) return v !== "0";
  } catch {
    return memo;
  }
  try {
    return document.body.dataset.hideIncome !== "1";
  } catch {
    return memo;
  }
}

export function useIncomeVisible() {
  const visible = useSyncExternalStore(subscribe, read, () => true);

  const toggle = useCallback(() => {
    const next = !read();
    memo = next;
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // memo above already carries it for this session
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  return { visible, toggle };
}
