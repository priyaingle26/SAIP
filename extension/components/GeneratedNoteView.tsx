import React, { useState } from 'react';
import type { ClinicalNote } from '../lib/schemas';
import { Card, Chip, INPUT_STYLE, Button } from './ui';

interface Props {
  note: ClinicalNote;
  onNoteChange: (note: ClinicalNote) => void;
}

/** Render raw markdown into clean HTML for professional display */
function renderMarkdown(raw: string): string {
  return raw
    // Normalise any legacy $$$$ / $$$ / $$ escapes that slipped through
    .replace(/\$\$\$\$/g, '##')
    .replace(/\$\$\$/g, '+')
    .replace(/\$\$/g, '*')
    // ## Section headers → styled h2
    .replace(/^## (.+)$/gm, '<h2 class="note-h2">$1</h2>')
    // # top-level header (fallback) → h2 as well
    .replace(/^# (.+)$/gm, '<h2 class="note-h2">$1</h2>')
    // Bold **text**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic *text*
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Numbered lists: "1. item"
    .replace(/^(\d+)\. (.+)$/gm, '<li class="note-li-num"><span class="note-li-num-badge">$1</span>$2</li>')
    // • bullet (AI output)
    .replace(/^• (.+)$/gm, '<li class="note-li">$1</li>')
    // Dash bullet (legacy) – convert
    .replace(/^- (.+)$/gm, '<li class="note-li">$1</li>')
    // Wrap consecutive <li> runs in <ul> / <ol>
    .replace(/(<li class="note-li(?:-num)?">[\s\S]+?<\/li>)(\n(?!<li))/g, (m) => `<ul class="note-ul">${m}</ul>\n`)
    // Paragraph: non-empty lines that aren't already HTML
    .replace(/^(?!<)(.+)$/gm, '<p class="note-p">$1</p>')
    // Cleanup double blanks
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function GeneratedNoteView({ note, onNoteChange }: Props) {
  const [editing, setEditing] = useState(false);

  function handleChange(value: string) {
    onNoteChange({ ...note, raw: value });
  }

  const raw = (note.raw || '') as string;

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Chip variant="primary">AI Generated</Chip>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-2)' }}>
            {editing ? 'Editing…' : 'Review & edit before autofilling'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing((v) => !v)}
            style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }}
          >
            {editing ? 'Preview' : 'Edit'}
          </Button>
        </div>
      </div>

      {/* Rendered / Edit toggle */}
      {editing ? (
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
            Clinical Note (raw)
          </label>
          <textarea
            id="saip-note-raw"
            value={raw}
            onChange={(e) => handleChange(e.target.value)}
            style={{
              ...INPUT_STYLE,
              minHeight: 300,
              resize: 'vertical',
              lineHeight: 'var(--leading-relaxed)',
              fontSize: 'var(--text-sm)',
              padding: '10px 12px',
              fontFamily: 'var(--font-mono, monospace)',
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
      ) : (
        <>
          <style>{`
            .note-rendered { font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-foreground); line-height: var(--leading-relaxed); }
            .note-rendered .note-h2 { font-size: var(--text-base); font-weight: 700; color: var(--color-primary); margin: 16px 0 6px; padding-bottom: 4px; border-bottom: 1px solid var(--color-primary-subtle-border); letter-spacing: 0.01em; }
            .note-rendered .note-h2:first-child { margin-top: 0; }
            .note-rendered .note-p { margin: 4px 0; }
            .note-rendered .note-ul { list-style: none; padding: 0; margin: 4px 0 8px; display: flex; flex-direction: column; gap: 3px; }
            .note-rendered .note-li { padding: 4px 8px 4px 18px; position: relative; color: var(--color-foreground); }
            .note-rendered .note-li::before { content: "•"; position: absolute; left: 6px; color: var(--color-primary); font-weight: 700; }
            .note-rendered .note-li-num { padding: 4px 8px 4px 32px; position: relative; color: var(--color-foreground); }
            .note-rendered .note-li-num-badge { position: absolute; left: 6px; font-weight: 700; color: var(--color-primary); min-width: 18px; }
          `}</style>
          <div
            className="note-rendered"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(raw) }}
            style={{
              background: 'var(--color-surface-2, var(--color-surface))',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 14px',
              minHeight: 200,
              overflowY: 'auto',
            }}
          />
        </>
      )}
    </Card>
  );
}
