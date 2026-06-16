import React from 'react';

interface Props {
  transcript: string;
}

export default function TranscriptView({ transcript }: Props) {
  return (
    <div style={styles.wrap}>
      <p style={styles.text}>{transcript || 'Awaiting transcript…'}</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(99,179,237,0.15)',
    borderRadius: 10, padding: '12px 14px',
    maxHeight: 200, overflowY: 'auto',
  },
  text: {
    fontSize: 13, lineHeight: 1.7, color: '#a0aec0',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
  },
};
