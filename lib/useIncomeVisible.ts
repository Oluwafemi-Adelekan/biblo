"use client";

import { useCallback, useSyncExternalStore } from "react";

/* Whether the budget screen shows its income figure.

   Deliberately scoped to that one screen. An earlier version hid
   income everywhere at once, which meant one tap changed three
   screens and it was never obvious which control had done it. The
   toggle now sits next to the thing it hides.

   It lives in the browser rather than the database: it is about who
   might be looking over your shoulder right now, not about your money.

   Read through useSyncExternalStore so the server renders the same
   thing every time and the browser corrects it on hydration, instead
   of setting state inside an effect. */

const KEY = "biblo.showBudgetIncome";
const CHANGED = "biblo:income-visibility";

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
  try {
    return localStorage.getItem(KEY) !== "0";
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
