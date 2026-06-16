import React from 'react';
import type { Encounter } from '../lib/schemas';

interface Props {
  encounters: Encounter[];
  onSelect: (encounter: Encounter) => void;
}

// ─── SVG Icons ──────────────────────────────────────────────────────────────
const HistoryIcon = ({ size = 28, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

const STATUS_COLOR: Record<Encounter['status'], string> = {
  pending: '#ecc94b',
  transcribed: '#63b3ed',
  generated: '#68d391',
  autofilled: '#805ad5',
};

export default function EncounterHistory({ encounters, onSelect }: Props) {
  if (!encounters.length) {
    return (
      <div style={styles.empty}>
        <HistoryIcon size={28} color="#4a5568" />
        <p>No encounters yet.</p>
        <p style={styles.hint}>Recorded sessions will appear here.</p>
      </div>
    );
  }

  return (
    <div style={styles.list}>
      {encounters.map((enc) => (
        <button
          key={enc.id}
          id={`saip-encounter-${enc.id}`}
          style={styles.card}
          onClick={() => onSelect(enc)}
        >
          <div style={styles.cardTop}>
            <span style={styles.clientName}>{enc.clientName || 'Session'}</span>
            <span
              style={{
                ...styles.statusBadge,
                color: STATUS_COLOR[enc.status],
                borderColor: STATUS_COLOR[enc.status] + '55',
                background: STATUS_COLOR[enc.status] + '15',
              }}
            >
              {enc.status}
            </span>
          </div>
          <div style={styles.date}>
            {new Date(enc.date).toLocaleString()}
          </div>
          {enc.transcript && (
            <div style={styles.preview}>
              {enc.transcript.slice(0, 80)}…
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: {
    textAlign: 'left', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(99,179,237,0.15)', borderRadius: 10,
    padding: '12px 14px', cursor: 'pointer', color: '#e2e8f0',
    transition: 'border-color 0.2s, background 0.2s',
    width: '100%',
  },
  cardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  clientName: { fontSize: 14, fontWeight: 600 },
  statusBadge: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.8, padding: '2px 8px', borderRadius: 20,
    border: '1px solid',
  },
  date: { fontSize: 11, color: '#4a5568', marginBottom: 6 },
  preview: { fontSize: 12, color: '#718096', lineHeight: 1.5 },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    gap: 8, padding: '60px 20px', color: '#4a5568', textAlign: 'center',
  },
  hint: { fontSize: 12, color: '#2d3748' },
};
