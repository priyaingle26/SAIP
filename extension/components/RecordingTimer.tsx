import React, { useState, useEffect } from 'react';

interface Props {
  paused?: boolean;
  /** Accumulated active recording time (ms), excluding paused spans. */
  recordedMs?: number;
  /** Epoch (ms) of the last start/resume; elapsed = recordedMs + (now - lastResumedAt). */
  lastResumedAt?: number;
}

export default function RecordingTimer({ paused = false, recordedMs = 0, lastResumedAt }: Props) {
  // A tick to force re-render every 250ms while running; the displayed value is
  // derived from the stopwatch props so it survives a panel close/reopen.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [paused, lastResumedAt]);

  const activeMs = paused || !lastResumedAt ? recordedMs : recordedMs + (Date.now() - lastResumedAt);
  const seconds = Math.max(0, Math.floor(activeMs / 1000));

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={paused ? `Recording paused at ${mm} minutes ${ss} seconds` : `Recording duration: ${mm} minutes ${ss} seconds`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: paused ? 'var(--color-warning, #b45309)' : 'var(--color-destructive)',
          animation: paused ? 'none' : 'saip-blink 1s step-start infinite',
        }}
      />
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: paused ? 'var(--color-warning, #b45309)' : 'var(--color-destructive)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 2,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {mm}:{ss}
      </span>
      {paused && (
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-warning, #b45309)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Paused
        </span>
      )}
    </div>
  );
}
