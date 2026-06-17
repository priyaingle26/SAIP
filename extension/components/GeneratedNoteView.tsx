import React from 'react';
import type { ClinicalNote } from '../lib/schemas';
import { Card, Chip, INPUT_STYLE } from './ui';

interface Props {
  note: ClinicalNote;
  onNoteChange: (note: ClinicalNote) => void;
}

export default function GeneratedNoteView({ note, onNoteChange }: Props) {
  function handleChange(key: keyof ClinicalNote, value: string) {
    onNoteChange({ ...note, [key]: value });
  }

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Chip variant="primary">AI Generated</Chip>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-2)' }}>
          Review &amp; edit before autofilling
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <label
          htmlFor="saip-note-raw"
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-muted)',
          }}
        >
          Clinical Note
        </label>
        <textarea
          id="saip-note-raw"
          value={(note.raw || '') as string}
          onChange={(e) => handleChange('raw', e.target.value)}
          style={{
            ...INPUT_STYLE,
            minHeight: 240,
            resize: 'vertical',
            lineHeight: 'var(--leading-relaxed)',
            fontSize: 'var(--text-base)',
            padding: '10px 12px',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--color-primary)';
            e.target.style.boxShadow = '0 0 0 3px var(--color-ring)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--color-border)';
            e.target.style.boxShadow = 'none';
          }}
        />
      </div>
    </Card>
  );
}
