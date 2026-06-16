import React, { useState, useCallback } from 'react';
import { generateFormAnswers } from '../lib/apiClient';
import { FORM_FIELD_DEFINITIONS } from '../lib/constants';
import type { DetectedForm, FormAnswersResponse, ExtensionMessage } from '../lib/schemas';

// Supported form types for the manual-override dropdown
const ALL_FORM_TYPES = Object.keys(FORM_FIELD_DEFINITIONS);

interface Props {
  transcript: string;
  clinicalNote: string;
}

// ─── Step states ─────────────────────────────────────────────────────────────
type Step = 'detect' | 'generating' | 'review' | 'filling' | 'done' | 'error';

// ─── SVG Icons ───────────────────────────────────────────────────────────────
const CheckIcon = ({ color = '#68d391' }) => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5"
    strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const SpinnerIcon = () => (
  <div style={{
    width: 14, height: 14, border: '2px solid rgba(99,179,237,0.3)',
    borderTop: '2px solid #63b3ed', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite', flexShrink: 0,
  }} />
);

const WandIcon = ({ color = 'currentColor' }) => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M15 4V2" /><path d="M15 16v-2" /><path d="M8 9h2" /><path d="M20 9h2" />
    <path d="M17.8 11.8 19 13" /><path d="M15 9h0" /><path d="M17.8 6.2 19 5" />
    <path d="m3 21 9-9" /><path d="M12.2 6.2 11 5" />
  </svg>
);

const FillIcon = ({ color = 'currentColor' }) => (
  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const AlertIcon = ({ color = '#fc8181' }) => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" x2="12" y1="9" y2="13" /><line x1="12" x2="12.01" y1="17" y2="17" />
  </svg>
);

// ─── Helper: human-readable field label ──────────────────────────────────────
function toLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function FormAssistant({ transcript, clinicalNote }: Props) {
  const [step, setStep] = useState<Step>('detect');
  const [detectedForm, setDetectedForm] = useState<DetectedForm | null>(null);
  const [selectedFormType, setSelectedFormType] = useState('');
  const [formContext, setFormContext] = useState('');
  const [formAnswers, setFormAnswers] = useState<FormAnswersResponse | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [fillResult, setFillResult] = useState('');
  const [error, setError] = useState('');

  // ─── Detect form from the active tab ────────────────────────────────────────
  const handleDetect = useCallback(async () => {
    setError('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { setError('No active tab found.'); return; }

      const response = await chrome.tabs.sendMessage(tab.id, { type: 'DETECT_FORM_REQUEST' }) as ExtensionMessage;
      if (response?.type === 'FORM_DETECTED') {
        const payload = response.payload as DetectedForm & { formContext?: string };
        setDetectedForm({ formType: payload.formType, confidence: payload.confidence });
        setFormContext(payload.formContext ?? '');
        setSelectedFormType(payload.formType !== 'Unknown' ? payload.formType : '');
      } else {
        setError('Could not scan the current page. Make sure you have a Credible form open.');
      }
    } catch {
      setError('Content script unavailable. Open a Credible EHR page first.');
    }
  }, []);

  // ─── Generate form answers ───────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    const formType = selectedFormType;
    if (!formType) { setError('Please select a form type.'); return; }
    if (!transcript && !clinicalNote) { setError('Record an encounter first to generate answers.'); return; }

    setStep('generating');
    setError('');

    const result = await generateFormAnswers({
      formType,
      formContext,
      transcript,
      clinicalNote,
    });

    if (!result.success || !result.data) {
      setError(result.error ?? 'Generation failed.');
      setStep('detect');
      return;
    }

    setFormAnswers(result.data);
    setEditedFields(result.data.fields);
    setStep('review');
  }, [selectedFormType, formContext, transcript, clinicalNote]);

  // ─── Fill the EHR form ───────────────────────────────────────────────────────
  const handleFill = useCallback(async () => {
    if (!formAnswers) return;
    setStep('filling');
    setFillResult('');
    setError('');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { setError('No active tab found.'); setStep('review'); return; }

      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'AUTOFILL_FORM_REQUEST',
        payload: { formType: formAnswers.formType, fields: editedFields },
      }) as ExtensionMessage;

      if (response?.type === 'AUTOFILL_FORM_COMPLETE') {
        const r = response.payload as { filled: number; missed: string[] };
        const missedText = r.missed.length > 0 ? ` (${r.missed.length} fields not matched)` : '';
        setFillResult(`✓ ${r.filled} field${r.filled !== 1 ? 's' : ''} filled${missedText}`);
        setStep('done');
      } else {
        setError(response?.error ?? 'Autofill failed.');
        setStep('review');
      }
    } catch {
      setError('Could not reach the EHR page. Make sure the form is open.');
      setStep('review');
    }
  }, [formAnswers, editedFields]);

  // ─── Confidence badge colour ─────────────────────────────────────────────────
  const confColor = !detectedForm ? '#4a5568'
    : detectedForm.confidence >= 0.75 ? '#68d391'
    : detectedForm.confidence >= 0.5 ? '#ecc94b'
    : '#fc8181';

  const lowConfidence = !detectedForm || detectedForm.confidence < 0.6;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={s.root}>
      {/* ── Divider ─────────────────────────────────────────────────────────── */}
      <div style={s.divider} />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={s.header}>
        <span style={s.badge}>Form Assistant</span>
        <span style={s.hint}>Credible EHR Auto-Fill</span>
      </div>

      {/* ── Status indicators ───────────────────────────────────────────────── */}
      <div style={s.statusRow}>
        <StatusDot active={!!detectedForm} label="Form Detected" />
        <StatusDot active={step === 'review' || step === 'done' || step === 'filling'} label="Answers Ready" />
        <StatusDot active={step === 'done'} label="Form Filled" />
      </div>

      {/* ── Form Detection block ─────────────────────────────────────────────── */}
      <div style={s.card}>
        <div style={s.cardLabel}>Detected Form</div>

        {detectedForm ? (
          <div style={s.detectedRow}>
            <span style={{ ...s.formTypePill, borderColor: confColor + '55', color: confColor, background: confColor + '15' }}>
              {detectedForm.formType}
            </span>
            <span style={{ ...s.confBadge, color: confColor }}>
              {Math.round(detectedForm.confidence * 100)}% confidence
            </span>
          </div>
        ) : (
          <span style={s.dimText}>Not yet scanned</span>
        )}

        <button id="saip-detect-form-btn" style={s.ghostBtn} onClick={handleDetect}>
          🔍 Scan Active Tab
        </button>

        {/* Manual override when confidence is low or unknown */}
        {(lowConfidence || detectedForm?.formType === 'Unknown') && (
          <div style={{ marginTop: 8 }}>
            <div style={{ ...s.dimText, marginBottom: 4 }}>Select form type manually:</div>
            <select
              id="saip-form-type-select"
              style={s.select}
              value={selectedFormType}
              onChange={(e) => setSelectedFormType(e.target.value)}
            >
              <option value="">— Choose —</option>
              {ALL_FORM_TYPES.map((ft) => (
                <option key={ft} value={ft}>{ft}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Generate button ──────────────────────────────────────────────────── */}
      {(step === 'detect' || step === 'error') && (
        <button
          id="saip-generate-form-btn"
          style={{
            ...s.primaryBtn,
            opacity: (!selectedFormType || (!transcript && !clinicalNote)) ? 0.45 : 1,
            cursor: (!selectedFormType || (!transcript && !clinicalNote)) ? 'not-allowed' : 'pointer',
          }}
          disabled={!selectedFormType || (!transcript && !clinicalNote) || step === 'generating'}
          onClick={handleGenerate}
        >
          <WandIcon color="#fff" />
          Generate Form Answers
        </button>
      )}

      {step === 'generating' && (
        <div style={s.processingRow}>
          <SpinnerIcon />
          <span>Generating answers…</span>
        </div>
      )}

      {/* ── Review / Edit form answers ───────────────────────────────────────── */}
      {(step === 'review' || step === 'filling' || step === 'done') && formAnswers && (
        <div style={s.card}>
          <div style={s.cardLabel}>Form Answers — Review &amp; Edit</div>
          <div style={s.fieldList}>
            {Object.entries(editedFields).map(([key, val]) => (
              <div key={key} style={s.fieldRow}>
                <label style={s.fieldLabel}>{toLabel(key)}</label>
                <textarea
                  id={`saip-form-field-${key}`}
                  style={s.fieldTextarea}
                  value={val}
                  rows={3}
                  onChange={(e) =>
                    setEditedFields((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>

          <div style={s.fillActions}>
            <button
              id="saip-fill-form-btn"
              style={{ ...s.primaryBtn, background: 'linear-gradient(135deg,#48bb78,#2f855a)', opacity: step === 'filling' ? 0.6 : 1 }}
              disabled={step === 'filling'}
              onClick={handleFill}
            >
              {step === 'filling' ? <SpinnerIcon /> : <FillIcon color="#fff" />}
              Fill Form
            </button>

            <button
              id="saip-regen-form-btn"
              style={s.ghostBtn}
              onClick={() => { setStep('detect'); setFormAnswers(null); setEditedFields({}); setFillResult(''); }}
            >
              ↺ Regenerate
            </button>
          </div>
        </div>
      )}

      {/* ── Fill result ──────────────────────────────────────────────────────── */}
      {fillResult && (
        <div style={s.successRow}>
          <CheckIcon />
          <span>{fillResult}</span>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && (
        <div style={s.errorRow}>
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ─── Status dot sub-component ────────────────────────────────────────────────
function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
        background: active ? '#68d391' : '#2d3748',
        boxShadow: active ? '0 0 6px rgba(104,211,145,0.6)' : 'none',
        transition: 'background 0.3s',
      }} />
      <span style={{ color: active ? '#68d391' : '#4a5568' }}>{label}</span>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 10 },
  divider: {
    height: 1, background: 'linear-gradient(90deg,transparent,rgba(99,179,237,0.2),transparent)',
    margin: '8px 0',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
    color: '#4299e1', background: 'rgba(66,153,225,0.15)', padding: '3px 8px',
    borderRadius: 20, border: '1px solid rgba(66,153,225,0.3)',
  },
  hint: { fontSize: 11, color: '#4a5568' },
  statusRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  card: {
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,179,237,0.12)',
    borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
  },
  cardLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.8, color: '#4a5568',
  },
  detectedRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  formTypePill: {
    fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
    border: '1px solid', letterSpacing: 0.3,
  },
  confBadge: { fontSize: 11, fontWeight: 600 },
  dimText: { fontSize: 11, color: '#4a5568' },
  select: {
    width: '100%', padding: '7px 10px', borderRadius: 8,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(99,179,237,0.2)',
    color: '#e2e8f0', fontSize: 12, outline: 'none',
  },
  ghostBtn: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(99,179,237,0.2)',
    borderRadius: 8, color: '#90cdf4', fontSize: 12, cursor: 'pointer',
    padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6,
    transition: 'background 0.2s',
  },
  primaryBtn: {
    width: '100%', padding: '12px', borderRadius: 10,
    background: 'linear-gradient(135deg,#4299e1,#805ad5)',
    color: '#fff', border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 600, letterSpacing: 0.3,
    boxShadow: '0 4px 18px rgba(66,153,225,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    transition: 'opacity 0.2s',
  },
  processingRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    color: '#90cdf4', fontSize: 13, padding: '8px 0',
  },
  fieldList: { display: 'flex', flexDirection: 'column', gap: 10 },
  fieldRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: {
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: 0.8, color: '#63b3ed',
  },
  fieldTextarea: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,179,237,0.2)',
    borderRadius: 8, padding: '8px 10px', color: '#e2e8f0',
    fontSize: 12, lineHeight: 1.55, resize: 'vertical', outline: 'none',
    fontFamily: 'Inter, sans-serif', transition: 'border-color 0.2s',
  },
  fillActions: { display: 'flex', gap: 8, flexDirection: 'column' },
  successRow: {
    display: 'flex', alignItems: 'center', gap: 7,
    color: '#68d391', fontSize: 12, fontWeight: 500,
    background: 'rgba(104,211,145,0.1)', border: '1px solid rgba(104,211,145,0.25)',
    borderRadius: 8, padding: '8px 12px',
  },
  errorRow: {
    display: 'flex', alignItems: 'center', gap: 7,
    color: '#fc8181', fontSize: 12,
    background: 'rgba(252,129,129,0.08)', border: '1px solid rgba(252,129,129,0.2)',
    borderRadius: 8, padding: '8px 12px',
  },
};
