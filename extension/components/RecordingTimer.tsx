import React, { useState, useEffect } from 'react';

interface Props {
  paused?: boolean;
}

export default function RecordingTimer({ paused = false }: Props) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (paused) return; // stop advancing while paused
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [paused]);

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
