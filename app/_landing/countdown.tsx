'use client';

import { useEffect, useState } from 'react';

import { START_AT } from './offer';
import { C } from './shared';

const START_MS = new Date(START_AT).getTime();
const pad = (n: number) => String(n).padStart(2, '0');

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [
    { v: Math.floor(s / 86400), label: 'Days' },
    { v: Math.floor((s % 86400) / 3600), label: 'Hrs' },
    { v: Math.floor((s % 3600) / 60), label: 'Mins' },
    { v: s % 60, label: 'Secs' },
  ];
}

/* A boxed DD : HH : MM : SS timer to the first session. Renders nothing until
   mounted, so the server HTML and the first client render agree, and nothing
   once the challenge has started. */
export function StartCountdown({ size = 'md' }: { size?: 'md' | 'sm' | 'inline' }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (now === null || now >= START_MS) return null;

  if (size === 'inline') {
    const [d, h, m, s] = parts(START_MS - now);
    return (
      <span className="tabular-nums" role="timer">
        {pad(d.v)}d : {pad(h.v)}h : {pad(m.v)}m : {pad(s.v)}s
      </span>
    );
  }

  const sm = size === 'sm';
  return (
    <span className="inline-flex items-start gap-1.5" role="timer" aria-label="Time until the challenge starts">
      {parts(START_MS - now).map((p, i) => (
        <span key={p.label} className="inline-flex items-start gap-1.5">
          {i > 0 && (
            <span
              aria-hidden
              className={`font-display font-semibold ${sm ? 'text-[15px] leading-[30px]' : 'text-[20px] leading-[42px]'}`}
              style={{ color: C.goldDeep }}
            >
              :
            </span>
          )}
          <span className="inline-flex flex-col items-center">
            <span
              className={`grid place-items-center rounded-lg font-display font-semibold tabular-nums ${
                sm ? 'h-[30px] min-w-[34px] px-1 text-[15px]' : 'h-[42px] min-w-[46px] px-1.5 text-[20px]'
              }`}
              style={{ background: C.goldDeep, color: C.onDark }}
            >
              {pad(p.v)}
            </span>
            <span
              className={`mt-1 font-bold uppercase tracking-[0.08em] ${sm ? 'text-[8.5px]' : 'text-[9.5px]'}`}
              style={{ color: C.inkSoft }}
            >
              {p.label}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}
