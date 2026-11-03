"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* A guide's title bar. Under the photo it carries who put the guide
   together; once it sticks to the top, that line folds away and only
   the title stays. */
export function GuideBar({
  by,
  indent,
  children,
}: {
  by: string;
  /** Line the byline up with the title's words when a back arrow sits before them. */
  indent: boolean;
  children: ReactNode;
}) {
  const mark = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = mark.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) =>
      setStuck(!e.isIntersecting && e.boundingClientRect.top < 0),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div ref={mark} aria-hidden className="h-px" />
      <div className="sticky top-0 z-10 -mt-px border-b border-rule bg-sage-dim">
        <div className="mx-auto max-w-[44rem] px-5 py-3 sm:px-9">
          <div className="flex items-center justify-between gap-4">{children}</div>
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out-strong motion-reduce:transition-none ${
              stuck ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
            }`}
          >
            <p className={`overflow-hidden text-meta text-ink/60 ${indent ? "pl-7" : ""}`}>
              Put together by {by}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
