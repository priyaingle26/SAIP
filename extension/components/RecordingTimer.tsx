import React, { useState, useEffect } from 'react';

export default function RecordingTimer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={`Recording duration: ${mm} minutes ${ss} seconds`}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)' }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--color-destructive)',
          animation: 'saip-blink 1s step-start infinite',
        }}
      />
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--color-destructive)',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: 2,
          fontFamily: 'var(--font-mono)',
        }}
      >
        {mm}:{ss}
      </span>
    </div>
  );
}
