import React, { useState, useCallback, useEffect } from 'react';
import { generateFormAnswers, generateEvaluation } from '../lib/apiClient';
import { sendToFormFrame } from '../lib/frameResolver';
import { ALL_FORM_PROFILE_IDS, getProfileById } from '../lib/form-profiles';
import { getCachedEvaluation, setCachedEvaluation, clearCachedEvaluation } from '../lib/evaluationCache';
import { getLastFillLog } from '../lib/fillLog';
import type { DetectedForm, FormAnswersResponse, ExtensionMessage, FillLogEntry } from '../lib/schemas';
import {
  Button, Card, Chip, StatusDots, Banner, Label, Divider, Spinner,
  WandIcon, FillIcon, ScanIcon, RefreshIcon, BugIcon, CheckIcon,
  INPUT_STYLE,
} from './ui';

const ALL_FORM_TYPES = ALL_FORM_PROFILE_IDS;

interface Props {
  transcript: string;
  clinicalNote: string;
  /** ID of the selected patient — sent to the backend so it can inject confirmed
   *  profile values into the AI prompt and return them for silent form fill. */
  patientId?: string;
  /** Confirmed patient profile values (fieldKey → value). Silently pre-fills
   *  matching form fields without showing the "complete manually" note. */
  confirmedProfileValues?: Record<string, string>;
}

type Step = 'detect' | 'generating' | 'review' | 'filling' | 'done' | 'error';

function toLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

export default function FormAssistant({ transcript, clinicalNote, patientId, confirmedProfileValues: confirmedProfileValuesProp }: Props) {
  const [step, setStep] = useState<Step>('detect');
  const [detectedForm, setDetectedForm] = useState<DetectedForm | null>(null);
  const [selectedFormType, setSelectedFormType] = useState('');
  const [formContext, setFormContext] = useState('');
  const [formAnswers, setFormAnswers] = useState<FormAnswersResponse | null>(null);
  const [editedFields, setEditedFields] = useState<Record<string, string>>({});
  const [fillResult, setFillResult] = useState('');
  const [error, setError] = useState('');
  const [lastLog, setLastLog] = useState<FillLogEntry | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  // Confirmed values: merge prop (pre-existing) with values returned by the backend
  const [backendConfirmed, setBackendConfirmed] = useState<Record<string, string>>({});
  const confirmedProfileValues = { ...confirmedProfileValuesProp, ...backendConfirmed };

  useEffect(() => {
    getLastFillLog().then(setLastLog);
  }, []);

  // ─── Detect form from the active tab ────────────────────────────────────────
  const handleDetect = useCallback(async () => {
    setError('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { setError('No active tab found.'); return; }

      const response = await sendToFormFrame<ExtensionMessage>(tab.id, { type: 'DETECT_FORM_REQUEST' });
      if (response?.type === 'FORM_DETECTED') {
        const payload = response.payload as DetectedForm & { formContext?: string };
        setDetectedForm({ formType: payload.formType, confidence: payload.confidence, fvid: payload.fvid, bundle: payload.bundle });
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

    const profile = getProfileById(formType);
    if (profile && profile.fields.length === 0) {
      const hasConfirmed = confirmedProfileValues && Object.keys(confirmedProfileValues).length > 0;
      if (!hasConfirmed) {
        setError(`${profile.displayName} requires clinician review. Use a recorded session to generate answers, then confirm each field in the patient profile first.`);
        return;
      }
    }

    if (!transcript && !clinicalNote) { setError('Record an encounter first to generate answers.'); return; }

    setStep('generating');
    setError('');

    const { bundle: bundleId, fvid } = detectedForm ?? {};

    if (bundleId && fvid) {
      let allFields: Record<string, string>;
      const cached = await getCachedEvaluation(fvid);
      if (cached) {
        allFields = cached.fields;
      } else {
        const result = await generateEvaluation({ bundleId, formContext, transcript, clinicalNote });
        if (!result.success || !result.data) {
          setError(result.error ?? 'Evaluation generation failed.');
          setStep('detect');
          return;
        }
        allFields = result.data.fields;
        await setCachedEvaluation(fvid, bundleId, allFields);
      }
      const subsetKeys = getProfileById(formType)?.fields.map((f) => f.key) ?? [];
      const subset = Object.fromEntries(subsetKeys.map((k) => [k, allFields[k] ?? '']));
      setFormAnswers({ formType, confidence: detectedForm?.confidence ?? 0, fields: subset });
      setEditedFields(subset);
      setStep('review');
      return;
    }

    const result = await generateFormAnswers({ formType, formContext, transcript, clinicalNote, patientId });
    if (!result.success || !result.data) {
      setError(result.error ?? 'Generation failed.');
      setStep('detect');
      return;
    }
    // Store confirmed values returned by backend so they flow into the autofill engine
    if (result.data.confirmedProfileValues) {
      setBackendConfirmed(result.data.confirmedProfileValues);
    }
    setFormAnswers(result.data);
    setEditedFields(result.data.fields);
    setStep('review');
  }, [selectedFormType, formContext, transcript, clinicalNote, detectedForm, patientId]);

  // ─── Fill the EHR form ───────────────────────────────────────────────────────
  const handleFill = useCallback(async () => {
    if (!formAnswers) return;
    setStep('filling');
    setFillResult('');
    setError('');

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) { setError('No active tab found.'); setStep('review'); return; }

      const response = await sendToFormFrame<ExtensionMessage>(tab.id, {
        type: 'AUTOFILL_FORM_REQUEST',
        payload: { formType: formAnswers.formType, fields: editedFields, confirmedProfileValues },
      });

      if (response?.type === 'AUTOFILL_FORM_COMPLETE') {
        const r = response.payload as FillLogEntry;
        const missedText = r.missed.length > 0 ? ` (${r.missed.length} fields not matched)` : '';
        const manualText = r.manualRequired.length ? ` • ${r.manualRequired.length} scored item(s) need manual entry` : '';
        setFillResult(`${r.filled} field${r.filled !== 1 ? 's' : ''} filled${missedText}${manualText}`);
        setLastLog(r);
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

  const confVariant = !detectedForm ? 'muted'
    : detectedForm.confidence >= 0.75 ? 'success'
    : detectedForm.confidence >= 0.5 ? 'warning'
    : 'destructive';

  const lowConfidence = !detectedForm || detectedForm.confidence < 0.6;
  const canGenerate = !!selectedFormType && (!!transcript || !!clinicalNote);

  const statusSteps = [
    { label: 'Form Detected', active: !!detectedForm },
    { label: 'Answers Ready', active: step === 'review' || step === 'done' || step === 'filling' },
    { label: 'Form Filled', active: step === 'done' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>

      {/* ── Section heading ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Chip variant="primary" style={{ fontSize: 'var(--text-xs)' }}>Form Assistant</Chip>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-2)' }}>Credible EHR Auto-Fill</span>
        </div>
      </div>

      {/* ── Progress ────────────────────────────────────────────────────────── */}
      <StatusDots steps={statusSteps} />

      {/* ── Detection card ──────────────────────────────────────────────────── */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <Label>Detected Form</Label>

        {detectedForm ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Chip variant="accent">{detectedForm.formType}</Chip>
            <Chip variant={confVariant}>{Math.round(detectedForm.confidence * 100)}% confidence</Chip>
            {detectedForm.bundle && (
              <Chip variant="primary" title={`Evaluation bundle: ${detectedForm.bundle} (fvid ${detectedForm.fvid})`}>
                {detectedForm.bundle}
              </Chip>
            )}
          </div>
        ) : (
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted-2)' }}>Not yet scanned</span>
        )}

        <Button
          id="saip-detect-form-btn"
          variant="ghost"
          size="sm"
          onClick={handleDetect}
          iconLeft={<ScanIcon size={13} />}
        >
          Scan Active Tab
        </Button>

        {(lowConfidence || detectedForm?.formType === 'Unknown') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
            <label htmlFor="saip-form-type-select" style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-muted)' }}>
              Select form type manually
            </label>
            <select
              id="saip-form-type-select"
              value={selectedFormType}
              onChange={(e) => setSelectedFormType(e.target.value)}
              style={{
                ...INPUT_STYLE,
                fontSize: 'var(--text-base)',
                padding: '7px 10px',
                cursor: 'pointer',
              }}
              onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-ring)'; }}
              onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none'; }}
            >
              <option value="">— Choose —</option>
              {ALL_FORM_TYPES.map((ft) => (
                <option key={ft} value={ft}>{ft}</option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {/* ── Generate button ──────────────────────────────────────────────────── */}
      {(step === 'detect' || step === 'error') && (
        <Button
          id="saip-generate-form-btn"
          variant="primary"
          size="md"
          fullWidth
          disabled={!canGenerate}
          onClick={handleGenerate}
          iconLeft={<WandIcon size={14} />}
        >
          Generate Form Answers
        </Button>
      )}

      {step === 'generating' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-muted)', fontSize: 'var(--text-sm)', padding: 'var(--space-2) 0' }}>
          <Spinner size={14} />
          <span>Generating answers…</span>
        </div>
      )}

      {/* ── Review / Edit answers ───────────────────────────────────────────── */}
      {(step === 'review' || step === 'filling' || step === 'done') && formAnswers && (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Label>Review &amp; Edit Answers</Label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {Object.entries(editedFields).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                <label
                  htmlFor={`saip-form-field-${key}`}
                  style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-primary)' }}
                >
                  {toLabel(key)}
                </label>
                <textarea
                  id={`saip-form-field-${key}`}
                  value={val}
                  rows={3}
                  onChange={(e) => setEditedFields((prev) => ({ ...prev, [key]: e.target.value }))}
                  style={{
                    ...INPUT_STYLE,
                    resize: 'vertical',
                    lineHeight: 'var(--leading-relaxed)',
                    fontSize: 'var(--text-base)',
                    padding: '8px 10px',
                    minHeight: 70,
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-ring)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            ))}
          </div>

          <Divider />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <Button
              id="saip-fill-form-btn"
              variant="success"
              size="md"
              fullWidth
              loading={step === 'filling'}
              disabled={step === 'filling'}
              onClick={handleFill}
              iconLeft={<FillIcon size={14} />}
            >
              Fill Form
            </Button>
            <Button
              id="saip-regen-form-btn"
              variant="ghost"
              size="sm"
              fullWidth
              onClick={() => {
                setStep('detect');
                setFormAnswers(null);
                setEditedFields({});
                setFillResult('');
                if (detectedForm?.fvid) clearCachedEvaluation(detectedForm.fvid);
              }}
              iconLeft={<RefreshIcon size={13} />}
            >
              Regenerate
            </Button>
          </div>
        </Card>
      )}

      {/* ── Fill result ──────────────────────────────────────────────────────── */}
      {fillResult && <Banner variant="success">{fillResult}</Banner>}

      {/* ── Error message ────────────────────────────────────────────────────── */}
      {error && (
        <Banner variant={error.includes('scored clinical instrument') ? 'info' : 'error'}>
          {error}
        </Banner>
      )}

      {/* ── Debug log (last run) ─────────────────────────────────────────────── */}
      {lastLog && (
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <button
            id="saip-debug-toggle-btn"
            aria-expanded={showDebug}
            onClick={() => setShowDebug((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-muted)',
              fontSize: 'var(--text-xs)',
              fontWeight: 600,
              padding: 0,
              gap: 'var(--space-2)',
              outline: 'none',
            }}
            onFocus={(e) => { (e.target as HTMLElement).style.outline = '2px solid var(--color-ring)'; (e.target as HTMLElement).style.outlineOffset = '2px'; (e.target as HTMLElement).style.borderRadius = '4px'; }}
            onBlur={(e) => { (e.target as HTMLElement).style.outline = 'none'; }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
              <BugIcon size={12} />
              Debug Log — last run ({lastLog.formType})
            </span>
            <span aria-hidden="true">{showDebug ? '▲' : '▼'}</span>
          </button>

          {showDebug && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                marginTop: 'var(--space-3)',
                paddingTop: 'var(--space-3)',
                borderTop: '1px solid var(--color-border-2)',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-muted)',
                lineHeight: 'var(--leading-relaxed)',
                wordBreak: 'break-word',
              }}
            >
              <div><strong style={{ color: 'var(--color-foreground)' }}>Filled:</strong> {lastLog.filled}</div>
              <div><strong style={{ color: 'var(--color-foreground)' }}>Missed ({lastLog.missed.length}):</strong> {lastLog.missed.join(', ') || '—'}</div>
              <div><strong style={{ color: 'var(--color-foreground)' }}>Manual required ({lastLog.manualRequired.length}):</strong> {lastLog.manualRequired.join(', ') || '—'}</div>
              <div><strong style={{ color: 'var(--color-foreground)' }}>Labels seen ({lastLog.labelsSeen.length}):</strong> {lastLog.labelsSeen.slice(0, 20).join(' | ') || '—'}</div>
              <div><strong style={{ color: 'var(--color-foreground)' }}>Frame URL:</strong> {lastLog.frameUrl || '—'}</div>
              <div><strong style={{ color: 'var(--color-foreground)' }}>Time:</strong> {new Date(lastLog.ts).toLocaleString()}</div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
