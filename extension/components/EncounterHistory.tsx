import React from 'react';
import type { Encounter } from '../lib/schemas';
import { HistoryIcon } from './ui';

interface Props {
  encounters: Encounter[];
  onSelect: (encounter: Encounter) => void;
}

type Status = Encounter['status'];

const STATUS_CONFIG: Record<Status, { label: string; bg: string; border: string; color: string }> = {
  pending:     { label: 'Pending',     bg: 'var(--color-warning-bg)',     border: 'var(--color-warning-border)',     color: 'var(--color-warning)' },
  transcribed: { label: 'Transcribed', bg: 'var(--color-primary-subtle)', border: 'var(--color-primary-subtle-border)', color: 'var(--color-primary)' },
  generated:   { label: 'Note Ready',  bg: 'var(--color-accent-subtle)',  border: 'var(--color-accent-subtle-border)', color: 'var(--color-accent)' },
  autofilled:  { label: 'Autofilled',  bg: 'var(--color-success-bg)',     border: 'var(--color-success-border)',     color: 'var(--color-success)' },
};

export default function EncounterHistory({ encounters, onSelect }: Props) {
  if (!encounters.length) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-8) var(--space-5)',
          color: 'var(--color-muted-2)',
          textAlign: 'center',
        }}
      >
        <HistoryIcon size={28} />
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 500 }}>
          No encounters yet
        </p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted-2)' }}>
          Recorded sessions will appear here.
        </p>
      </div>
    );
  }

  return (
    <div
      role="list"
      aria-label="Encounter history"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
    >
      {encounters.map((enc) => {
        const sc = STATUS_CONFIG[enc.status] ?? STATUS_CONFIG.pending;
        return (
          <button
            key={enc.id}
            id={`saip-encounter-${enc.id}`}
            role="listitem"
            onClick={() => onSelect(enc)}
            style={{
              display: 'block',
              textAlign: 'left',
              width: '100%',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3)',
              cursor: 'pointer',
              color: 'var(--color-foreground)',
              transition: 'border-color var(--motion-fast), box-shadow var(--motion-fast)',
              boxShadow: 'var(--shadow-sm)',
              outline: 'none',
            }}
            onFocus={(e) => {
              (e.target as HTMLElement).style.outline = '2px solid var(--color-ring)';
              (e.target as HTMLElement).style.outlineOffset = '2px';
            }}
            onBlur={(e) => {
              (e.target as HTMLElement).style.outline = 'none';
            }}
            onMouseEnter={(e) => {
              (e.currentTarget).style.borderColor = 'var(--color-primary-subtle-border)';
              (e.currentTarget).style.boxShadow = 'var(--shadow-md)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget).style.borderColor = 'var(--color-border)';
              (e.currentTarget).style.boxShadow = 'var(--shadow-sm)';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-1)' }}>
              <span style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-foreground)' }}>
                {enc.clientName || 'Session'}
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  background: sc.bg,
                  color: sc.color,
                  border: `1px solid ${sc.border}`,
                  flexShrink: 0,
                  marginLeft: 'var(--space-2)',
                }}
              >
                {sc.label}
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-2)', marginBottom: 'var(--space-1)' }}>
              {new Date(enc.date).toLocaleString()}
            </div>
            {enc.transcript && (
              <div
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-muted)',
                  lineHeight: 'var(--leading-normal)',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const,
                }}
              >
                {enc.transcript.slice(0, 120)}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
