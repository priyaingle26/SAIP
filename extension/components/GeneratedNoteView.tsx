import React from 'react';
import type { ClinicalNote } from '../lib/schemas';

interface Props {
  note: ClinicalNote;
  onNoteChange: (note: ClinicalNote) => void;
}

const FIELDS: Array<{ key: keyof ClinicalNote; label: string }> = [
  { key: 'chiefComplaint', label: 'Chief Complaint' },
  { key: 'subjective', label: 'Subjective (S)' },
  { key: 'objective', label: 'Objective (O)' },
  { key: 'assessment', label: 'Assessment (A)' },
  { key: 'plan', label: 'Plan (P)' },
  { key: 'mentalStatusExam', label: 'Mental Status Exam' },
  { key: 'riskAssessment', label: 'Risk Assessment' },
  { key: 'interventions', label: 'Interventions' },
  { key: 'goals', label: 'Goals' },
];

export default function GeneratedNoteView({ note, onNoteChange }: Props) {
  function handleChange(key: keyof ClinicalNote, value: string) {
    onNoteChange({ ...note, [key]: value });
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.badge}>AI Generated</span>
        <span style={styles.hint}>Review & edit before autofilling</span>
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Clinical Note</label>
        <textarea
          id="saip-note-raw"
          style={{ ...styles.textarea, minHeight: '300px' }}
          value={(note.raw || '') as string}
          onChange={(e) => handleChange('raw', e.target.value)}
        />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 12 },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  badge: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 1, color: '#805ad5',
    background: 'rgba(128,90,213,0.15)', padding: '3px 8px', borderRadius: 20,
    border: '1px solid rgba(128,90,213,0.3)',
  },
  hint: { fontSize: 11, color: '#4a5568' },
  field: { display: 'flex', flexDirection: 'column', gap: 5 },
  label: {
    fontSize: 11, fontWeight: 600, color: '#63b3ed',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  textarea: {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(99,179,237,0.2)',
    borderRadius: 8, padding: '10px 12px',
    color: '#e2e8f0', fontSize: 13, lineHeight: 1.6,
    resize: 'vertical', outline: 'none', fontFamily: 'Inter, sans-serif',
    transition: 'border-color 0.2s',
  },
};
