"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/* On a phone these tools render where they are written - in the
   page's own title row. On desktop they teleport into the fixed
   header's slot, so the month picker and download live up top and
   never scroll away. One instance either way: state survives. */

export function HeaderPortal({
  children,
  slot = "header-tools",
}: {
  children: React.ReactNode;
  /** "header-tools" sits on the right; "header-lead" replaces the
   *  page title on the left, for a back arrow and a specific title. */
  slot?: "header-tools" | "header-lead";
}) {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 64rem)");
    const place = () =>
      setTarget(mq.matches ? document.getElementById(slot) : null);
    place();
    mq.addEventListener("change", place);
    return () => mq.removeEventListener("change", place);
  }, [slot]);

  return target ? createPortal(children, target) : <>{children}</>;
}
