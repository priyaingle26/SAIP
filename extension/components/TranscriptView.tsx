import React from 'react';

interface Props {
  transcript: string;
}

export default function TranscriptView({ transcript }: Props) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        maxHeight: 200,
        overflowY: 'auto',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <p
        style={{
          fontSize: 'var(--text-sm)',
          lineHeight: 'var(--leading-relaxed)',
          color: transcript ? 'var(--color-muted)' : 'var(--color-muted-2)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {transcript || 'Awaiting transcript…'}
      </p>
    </div>
  );
}
