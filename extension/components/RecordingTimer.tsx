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
    <div style={styles.wrap}>
      <div style={styles.dot} />
      <span style={styles.time}>{mm}:{ss}</span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
  },
  dot: {
    width: 10, height: 10, borderRadius: '50%', background: '#f56565',
    animation: 'blink 1s step-start infinite',
  },
  time: {
    fontSize: 22, fontWeight: 700, color: '#fc8181',
    fontVariantNumeric: 'tabular-nums', letterSpacing: 2,
  },
};
