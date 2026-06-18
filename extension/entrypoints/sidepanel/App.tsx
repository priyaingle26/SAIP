import React, { useState, useEffect, useCallback, useRef } from 'react';
import { login, logout, getStoredUser } from '../../lib/auth';
import type {
  SaipUser, ClinicalNote, Encounter, ExtensionMessage,
  TranscriptTurn, StreamFinalizedPayload, Patient, ProfileField,
} from '../../lib/schemas';
import RecordingTimer from '../../components/RecordingTimer';
import TranscriptView from '../../components/TranscriptView';
import GeneratedNoteView from '../../components/GeneratedNoteView';
import EncounterHistory from '../../components/EncounterHistory';
import FormAssistant from '../../components/FormAssistant';
import { searchPatients, createPatient, fetchPatientProfile, confirmProfileField, getPatient, fetchEncounters } from '../../lib/apiClient';
import {
  TabBar, Button, Banner, Spinner, Divider,
  LogOutIcon, FileTextIcon, HistoryIcon, MicIcon, AlertIcon, UploadIcon,
  INPUT_STYLE,
} from '../../components/ui';

type Tab = 'record' | 'note' | 'history' | 'patient';

function PersonIcon({ size = 16 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="5" r="3" />
      <path d="M2 14c0-3.314 2.686-6 6-6s6 2.686 6 6" />
    </svg>
  );
}

const TABS = [
  { id: 'record',  label: 'Record',  icon: <MicIcon size={14} /> },
  { id: 'note',    label: 'Note',    icon: <FileTextIcon size={14} /> },
  { id: 'history', label: 'History', icon: <HistoryIcon size={14} /> },
  { id: 'patient', label: 'Patient', icon: <PersonIcon size={14} /> },
] as const;

// ─── Logo mark ────────────────────────────────────────────────────────────────
function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.5,
        fontWeight: 700,
        color: 'var(--color-primary-fg)',
        fontFamily: 'var(--font-heading)',
        flexShrink: 0,
      }}
    >
      S
    </div>
  );
}

// ─── Labeled transcript display ───────────────────────────────────────────────
function LabeledTranscriptView({
  turns,
  editable,
  onChange,
}: {
  turns: TranscriptTurn[];
  editable: boolean;
  onChange?: (turns: TranscriptTurn[]) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {turns.map((turn, i) => (
        <div key={i} style={{
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2) var(--space-3)',
          background: turn.speaker === 'Patient' ? 'var(--color-surface)' : 'var(--color-primary-subtle)',
          border: '1px solid var(--color-border)',
        }}>
          <span style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: turn.speaker === 'Patient' ? 'var(--color-muted)' : 'var(--color-primary)',
            display: 'block',
            marginBottom: 'var(--space-1)',
          }}>
            {turn.speaker}
          </span>
          {editable ? (
            <textarea
              value={turn.text}
              onChange={(e) => {
                if (!onChange) return;
                const updated = [...turns];
                updated[i] = { ...turn, text: e.target.value };
                onChange(updated);
              }}
              rows={Math.max(2, Math.ceil(turn.text.length / 60))}
              style={{
                ...INPUT_STYLE,
                width: '100%',
                resize: 'vertical',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-body)',
              }}
            />
          ) : (
            <p style={{ fontSize: 'var(--text-sm)', margin: 0, lineHeight: 1.5 }}>
              {turn.text}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<SaipUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [processingError, setProcessingError] = useState('');

  const [transcript, setTranscript] = useState('');
  const [generatedNote, setGeneratedNote] = useState<ClinicalNote | null>(null);
  const [currentEncounterId, setCurrentEncounterId] = useState<string | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('record');

  // ── Patient management state ────────────────────────────────────────────────
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patientSearching, setPatientSearching] = useState(false);
  const [showCreatePatient, setShowCreatePatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState('');
  const [newPatientDob, setNewPatientDob] = useState('');
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [patientProfile, setPatientProfile] = useState<Array<ProfileField>>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [confirmingField, setConfirmingField] = useState<string | null>(null);
  const [showPatientPicker, setShowPatientPicker] = useState(false);

  // ── Live streaming state ────────────────────────────────────────────────────
  const [isStreaming, setIsStreaming] = useState(false);       // backend WS is open
  const [liveCaption, setLiveCaption] = useState('');          // running delta text
  const [committedLines, setCommittedLines] = useState<string[]>([]); // completed utterances
  const [labeledTurns, setLabeledTurns] = useState<TranscriptTurn[]>([]);
  const [showLabeledTranscript, setShowLabeledTranscript] = useState(false);
  const captionEndRef = useRef<HTMLDivElement>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    getStoredUser().then(setUser);
    loadEncounters();
    // Restore the previously selected patient (persisted across SW restarts)
    chrome.storage.local.get('saip_selected_patient_id').then(async (r) => {
      const pid = r['saip_selected_patient_id'] as string | null | undefined;
      if (pid) {
        const res = await getPatient(pid);
        if (res.success && res.data) setSelectedPatient(res.data);
      }
    });
  }, []);

  // Auto-scroll live captions to bottom
  useEffect(() => {
    captionEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [liveCaption, committedLines]);

  // ─── Listen for background messages ──────────────────────────────────────
  useEffect(() => {
    const handler = (message: ExtensionMessage) => {
      switch (message.type) {
        case 'RECORDING_STARTED':
          setIsRecording(true);
          break;

        case 'RECORDING_STOPPED':
          setIsRecording(false);
          break;

        case 'STREAM_START':
          setIsStreaming(true);
          setLiveCaption('');
          setCommittedLines([]);
          break;

        case 'STREAM_DELTA': {
          const p = message.payload as { delta: string };
          setLiveCaption((prev) => prev + p.delta);
          break;
        }

        case 'STREAM_COMPLETED': {
          const p = message.payload as { completed: string };
          setCommittedLines((prev) => [...prev, p.completed]);
          setLiveCaption('');
          break;
        }

        case 'STREAM_ERROR':
          setIsStreaming(false);
          // Streaming failed — batch fallback kicks in; show a non-blocking hint
          setProcessingStep('Streaming unavailable, using batch transcription…');
          break;

        case 'STREAM_FINALIZED': {
          const p = message.payload as StreamFinalizedPayload;
          setCurrentEncounterId(p.encounterId);
          setTranscript(p.transcript);
          setLabeledTurns(p.turns);
          setShowLabeledTranscript(true);
          setIsStreaming(false);
          setProcessingStep('Generating clinical note…');
          break;
        }

        case 'TRANSCRIBE_COMPLETE': {
          const p = message.payload as { encounterId: string; transcript: string };
          setCurrentEncounterId(p.encounterId);
          setTranscript(p.transcript);
          setProcessingStep('Generating clinical note…');
          break;
        }

        case 'GENERATE_COMPLETE': {
          const p = message.payload as { note: ClinicalNote; encounterId: string };
          setGeneratedNote(p.note);
          setIsProcessing(false);
          setProcessingStep('');
          setActiveTab('note');
          loadEncounters();
          break;
        }

        case 'ERROR':
          setIsProcessing(false);
          setProcessingError(message.error ?? 'Unknown error');
          break;
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  async function loadEncounters() {
    const result = await chrome.storage.local.get('saip_encounters');
    const localList = (result['saip_encounters'] ?? []) as Encounter[];
    setEncounters(localList);

    // Merge backend encounters with local cache
    const apiResult = await fetchEncounters();
    if (apiResult.success && apiResult.data) {
      const backendList = apiResult.data as Encounter[];
      const backendById = new Map(backendList.map((e) => [e.id, e]));
      const localOnly = localList.filter((e) => !backendById.has(e.id));
      const merged = [...backendList, ...localOnly].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      
      setEncounters(merged);
      await chrome.storage.local.set({ saip_encounters: merged });
    }
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const u = await login(email, password);
      setUser(u);
      await loadEncounters();
    } catch {
      setLoginError('Invalid credentials. Please try again.');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setTranscript('');
    setGeneratedNote(null);
    setLabeledTurns([]);
    setShowLabeledTranscript(false);
  }

  // ─── Recording ───────────────────────────────────────────────────────────
  const handleStartRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());

      setIsRecording(true);
      setTranscript('');
      setGeneratedNote(null);
      setProcessingError('');
      setLiveCaption('');
      setCommittedLines([]);
      setLabeledTurns([]);
      setShowLabeledTranscript(false);

      const existing = await chrome.offscreen.hasDocument();
      if (!existing) {
        await chrome.offscreen.createDocument({
          url: chrome.runtime.getURL('offscreen.html'),
          reasons: [chrome.offscreen.Reason.USER_MEDIA],
          justification: 'Recording clinical audio for SAIP transcription',
        });
      }
      chrome.runtime.sendMessage({ target: 'offscreen', type: 'START_RECORDING' });
    } catch {
      alert('Microphone permission is required. Please allow microphone access in Chrome settings.');
    }
  }, []);

  const handleStopRecording = useCallback(() => {
    setIsRecording(false);
    setIsProcessing(true);
    setProcessingStep(isStreaming ? 'Finalizing & labeling transcript…' : 'Uploading & transcribing audio…');
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_RECORDING' });
  }, [isStreaming]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsRecording(false);
    setIsProcessing(true);
    setProcessingStep('Uploading & transcribing audio…');
    setTranscript('');
    setGeneratedNote(null);
    setProcessingError('');
    setLabeledTurns([]);
    setShowLabeledTranscript(false);

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      const mime = file.type || 'audio/webm';
      const port = chrome.runtime.connect({ name: 'saip-audio' });
      port.postMessage({ audioBase64: base64, mimeType: mime });
    };
    reader.onerror = () => {
      setIsProcessing(false);
      setProcessingError('Failed to read file');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  }, []);

  function handleSelectEncounter(encounter: Encounter) {
    if (encounter.transcript) setTranscript(encounter.transcript);
    if (encounter.generatedNote) setGeneratedNote(encounter.generatedNote);
    setCurrentEncounterId(encounter.id);
    setActiveTab('note');
  }

  // ─── Patient handlers ─────────────────────────────────────────────────────
  const handlePatientSearch = useCallback(async (q: string) => {
    setPatientQuery(q);
    if (!q.trim()) { setPatientResults([]); return; }
    setPatientSearching(true);
    const res = await searchPatients(q);
    setPatientSearching(false);
    if (res.success && res.data) setPatientResults(res.data);
  }, []);

  const handleSelectPatient = useCallback((patient: Patient | null) => {
    setSelectedPatient(patient);
    setPatientResults([]);
    setPatientQuery('');
    setShowPatientPicker(false);
    // Persist directly (survives SW restarts) AND notify background for immediacy.
    chrome.storage.local.set({ saip_selected_patient_id: patient?.id ?? null });
    chrome.runtime.sendMessage({ type: 'SET_PATIENT', payload: { patientId: patient?.id ?? null } });
  }, []);

  const handleCreatePatient = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim()) return;
    setCreatingPatient(true);
    const res = await createPatient(newPatientName.trim(), newPatientDob || undefined);
    setCreatingPatient(false);
    if (res.success && res.data) {
      setShowCreatePatient(false);
      setNewPatientName('');
      setNewPatientDob('');
      handleSelectPatient(res.data);
    }
  }, [newPatientName, newPatientDob, handleSelectPatient]);

  const loadPatientProfile = useCallback(async (patientId: string) => {
    setProfileLoading(true);
    const res = await fetchPatientProfile(patientId);
    setProfileLoading(false);
    if (res.success && res.data) setPatientProfile(res.data.fields);
  }, []);

  useEffect(() => {
    if (activeTab === 'patient' && selectedPatient) {
      void loadPatientProfile(selectedPatient.id);
    }
  }, [activeTab, selectedPatient, loadPatientProfile]);

  const handleConfirmField = useCallback(async (fieldKey: string) => {
    if (!selectedPatient) return;
    setConfirmingField(fieldKey);
    const res = await confirmProfileField(selectedPatient.id, fieldKey);
    setConfirmingField(null);
    if (res.success && res.data) {
      setPatientProfile((prev) =>
        prev.map((f) => f.fieldKey === fieldKey ? { ...f, provenance: res.data!.provenance } : f),
      );
    }
  }, [selectedPatient]);

  // ─── Render: Login ────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={loginWrap}>
        <div style={loginCard}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            <LogoMark size={32} />
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-primary)' }}>
              SAIP AI Scribe
            </span>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)', marginBottom: 'var(--space-6)' }}>
            Clinical AI Companion — Sign in to continue
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <label htmlFor="saip-email" style={fieldLabel}>Email</label>
              <input
                id="saip-email"
                type="email"
                placeholder="clinician@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{ ...INPUT_STYLE, fontSize: 'var(--text-md)' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-ring)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              <label htmlFor="saip-password" style={fieldLabel}>Password</label>
              <input
                id="saip-password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ ...INPUT_STYLE, fontSize: 'var(--text-md)' }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--color-primary)'; e.target.style.boxShadow = '0 0 0 3px var(--color-ring)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
            {loginError && <Banner variant="error">{loginError}</Banner>}
            <Button
              id="saip-login-btn"
              type="submit"
              variant="primary"
              size="lg"
              loading={loggingIn}
              fullWidth
              style={{ marginTop: 'var(--space-1)' }}
            >
              {loggingIn ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Render: Main Panel ───────────────────────────────────────────────────
  return (
    <div style={panelStyle}>
      {/* ── Header ── */}
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <LogoMark size={24} />
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-primary)' }}>
            SAIP AI Scribe
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
            {user.name || user.email}
          </span>
          <button
            id="saip-logout-btn"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            style={ghostIconBtn}
            onFocus={(e) => { (e.target as HTMLElement).style.outline = '2px solid var(--color-ring)'; (e.target as HTMLElement).style.outlineOffset = '2px'; }}
            onBlur={(e) => { (e.target as HTMLElement).style.outline = 'none'; }}
          >
            <LogOutIcon size={15} />
          </button>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <TabBar
        tabs={TABS as unknown as Array<{ id: string; label: string; icon: React.ReactNode }>}
        active={activeTab}
        onChange={(id) => setActiveTab(id as Tab)}
      />

      {/* ── Content ── */}
      <main
        id={`saip-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`saip-tab-${activeTab}`}
        style={contentStyle}
      >
        {/* ── Record Tab ── */}
        {activeTab === 'record' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>

            {/* ── Patient selector (compact) ── */}
            <div style={{ width: '100%', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', padding: 'var(--space-2) var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: selectedPatient ? 'var(--color-foreground)' : 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                  <PersonIcon size={14} />
                  <span style={{ fontWeight: selectedPatient ? 600 : 400 }}>
                    {selectedPatient ? selectedPatient.name : 'No patient selected (optional)'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                  {selectedPatient && (
                    <button type="button" aria-label="Clear patient" onClick={() => handleSelectPatient(null)} style={{ ...ghostIconBtn, width: 28, height: 28, fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                      ✕
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={showPatientPicker ? 'Close patient picker' : 'Select patient'}
                    onClick={() => setShowPatientPicker((v) => !v)}
                    style={{ ...ghostIconBtn, width: 28, height: 28, fontSize: 'var(--text-xs)', background: showPatientPicker ? 'var(--color-primary-subtle)' : 'transparent' }}
                  >
                    {showPatientPicker ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              {/* Patient search dropdown */}
              {showPatientPicker && (
                <div style={{ marginTop: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <input
                    type="text"
                    placeholder="Search by name or Credible ID…"
                    value={patientQuery}
                    onChange={(e) => void handlePatientSearch(e.target.value)}
                    autoFocus
                    style={{ ...INPUT_STYLE, fontSize: 'var(--text-sm)' }}
                  />
                  {patientSearching && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                      <Spinner size={12} /> Searching…
                    </div>
                  )}
                  {patientResults.length > 0 && (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', maxHeight: 160, overflowY: 'auto' }}>
                      {patientResults.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => handleSelectPatient(p)}
                            style={{ width: '100%', textAlign: 'left', padding: 'var(--space-1) var(--space-2)', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-bg)', cursor: 'pointer', fontSize: 'var(--text-sm)' }}
                          >
                            <span style={{ fontWeight: 500 }}>{p.name}</span>
                            {p.dob && <span style={{ color: 'var(--color-muted)', marginLeft: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>{p.dob}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!showCreatePatient ? (
                    <button type="button" onClick={() => setShowCreatePatient(true)} style={{ alignSelf: 'flex-start', fontSize: 'var(--text-xs)', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      + Create new patient
                    </button>
                  ) : (
                    <form onSubmit={(e) => void handleCreatePatient(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', padding: 'var(--space-2)', background: 'var(--color-primary-subtle)', borderRadius: 'var(--radius-sm)' }}>
                      <input type="text" placeholder="Full name *" required value={newPatientName} onChange={(e) => setNewPatientName(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 'var(--text-sm)' }} />
                      <input type="date" placeholder="DOB" value={newPatientDob} onChange={(e) => setNewPatientDob(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 'var(--text-sm)' }} />
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <Button type="submit" variant="primary" size="sm" loading={creatingPatient} style={{ flex: 1 }}>Create</Button>
                        <Button type="button" variant="secondary" size="sm" onClick={() => setShowCreatePatient(false)} style={{ flex: 1 }}>Cancel</Button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Record ring + button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-5)', paddingTop: 'var(--space-4)' }}>
              <div
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isRecording ? 'var(--color-destructive-bg)' : 'var(--color-primary-subtle)',
                  border: `2px solid ${isRecording ? 'var(--color-destructive-border)' : 'var(--color-primary-subtle-border)'}`,
                  animation: isRecording ? 'saip-pulse-ring-rec 1.6s ease-in-out infinite' : 'none',
                  transition: 'background var(--motion-slow), border-color var(--motion-slow)',
                }}
              >
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: 'var(--color-surface)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: 'var(--shadow-md)',
                  color: isRecording ? 'var(--color-destructive)' : 'var(--color-primary)',
                }}>
                  {isRecording ? <RecordingTimer /> : <MicIcon size={32} />}
                </div>
              </div>

              {/* Streaming indicator badge */}
              {isRecording && isStreaming && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
                  padding: '2px var(--space-2)',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-success-bg, #d1fae5)',
                  border: '1px solid var(--color-success-border, #6ee7b7)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-success, #059669)',
                  fontWeight: 600,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', animation: 'saip-pulse-ring-rec 1s ease-in-out infinite' }} />
                  Live
                </div>
              )}

              <input
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              {!isRecording && !isProcessing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  <Button
                    id="saip-start-btn"
                    variant="primary"
                    size="lg"
                    onClick={handleStartRecording}
                    iconLeft={<MicIcon size={16} />}
                    style={{ minWidth: 180 }}
                  >
                    Start Recording
                  </Button>
                  <Button
                    id="saip-upload-btn"
                    variant="secondary"
                    size="md"
                    onClick={() => fileInputRef.current?.click()}
                    iconLeft={<UploadIcon size={14} />}
                    style={{ minWidth: 180 }}
                  >
                    Upload Audio
                  </Button>
                </div>
              )}
              {isRecording && (
                <Button
                  id="saip-stop-btn"
                  variant="destructive"
                  size="lg"
                  onClick={handleStopRecording}
                  style={{ minWidth: 180 }}
                >
                  Stop &amp; Process
                </Button>
              )}
              {isProcessing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                  <Spinner size={15} />
                  <span>{processingStep}</span>
                </div>
              )}
            </div>

            {processingError && (
              <Banner variant="error" style={{ width: '100%' }}>
                {processingError}
              </Banner>
            )}

            {/* ── Live captions (shown during recording when streaming is active) ── */}
            {(isRecording || isStreaming) && (
              <div style={{ width: '100%' }}>
                <p style={captionLabel}>Live Captions</p>
                <div style={captionBox}>
                  {committedLines.map((line, i) => (
                    <p key={i} style={{ margin: 0, lineHeight: 1.55, fontSize: 'var(--text-sm)' }}>{line}</p>
                  ))}
                  {liveCaption && (
                    <p style={{ margin: 0, lineHeight: 1.55, fontSize: 'var(--text-sm)', color: 'var(--color-muted)', fontStyle: 'italic' }}>
                      {liveCaption}
                    </p>
                  )}
                  {committedLines.length === 0 && !liveCaption && (
                    <p style={{ margin: 0, lineHeight: 1.55, fontSize: 'var(--text-sm)', color: 'var(--color-muted-2)', fontStyle: 'italic' }}>
                      Listening… captions appear each time you pause speaking.
                    </p>
                  )}
                  <div ref={captionEndRef} />
                </div>
              </div>
            )}

            {/* ── Labeled transcript (shown after streaming finalize) ── */}
            {!isRecording && showLabeledTranscript && labeledTurns.length > 0 && (
              <div style={{ width: '100%' }}>
                <p style={captionLabel}>Labeled Transcript</p>
                <LabeledTranscriptView
                  turns={labeledTurns}
                  editable
                  onChange={setLabeledTurns}
                />
              </div>
            )}

            {/* ── Batch transcript fallback ── */}
            {!isRecording && !showLabeledTranscript && transcript && (
              <div style={{ width: '100%' }}>
                <p style={captionLabel}>Transcript</p>
                <TranscriptView transcript={transcript} />
              </div>
            )}
          </div>
        )}

        {/* ── Note Tab ── */}
        {activeTab === 'note' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {generatedNote ? (
              <>
                <GeneratedNoteView note={generatedNote} onNoteChange={setGeneratedNote} />
                <Divider />
                <FormAssistant
                  transcript={transcript}
                  clinicalNote={generatedNote.raw ?? ''}
                  patientId={selectedPatient?.id}
                />
              </>
            ) : (
              <div style={emptyState}>
                <div style={{ color: 'var(--color-muted-2)' }}><FileTextIcon size={32} /></div>
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 500 }}>No note generated yet</p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted-2)' }}>Record a session first.</p>
              </div>
            )}
          </div>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <EncounterHistory encounters={encounters} onSelect={handleSelectEncounter} />
        )}

        {/* ── Patient Tab ── */}
        {activeTab === 'patient' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {!selectedPatient ? (
              <div style={emptyState}>
                <div style={{ color: 'var(--color-muted-2)' }}><PersonIcon size={32} /></div>
                <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-muted)', fontWeight: 500 }}>No patient selected</p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted-2)' }}>Use the patient picker in the Record tab to select or create a patient.</p>
                <Button variant="primary" size="md" onClick={() => setActiveTab('record')} iconLeft={<PersonIcon size={14} />}>
                  Select Patient
                </Button>
              </div>
            ) : (
              <>
                {/* Patient header */}
                <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 'var(--text-base)', margin: 0 }}>{selectedPatient.name}</p>
                      {selectedPatient.dob && <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', margin: '2px 0 0' }}>DOB: {selectedPatient.dob}</p>}
                    </div>
                    <button type="button" onClick={() => handleSelectPatient(null)} style={{ ...ghostIconBtn, fontSize: 'var(--text-xs)' }} aria-label="Clear patient">✕</button>
                  </div>
                </div>

                {/* Profile fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                  <p style={captionLabel}>Longitudinal Profile</p>
                  {profileLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-muted)', fontSize: 'var(--text-sm)' }}>
                      <Spinner size={14} /> Loading…
                    </div>
                  ) : patientProfile.length === 0 ? (
                    <div style={{ ...emptyState, padding: 'var(--space-5)' }}>
                      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>No profile data yet.</p>
                      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted-2)' }}>Generate a clinical note for an encounter linked to this patient.</p>
                    </div>
                  ) : (
                    patientProfile.map((field) => (
                      <div key={field.id} style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-muted)', margin: 0 }}>
                            {field.fieldKey.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                          </p>
                          <p style={{ fontSize: 'var(--text-sm)', margin: '2px 0 0', wordBreak: 'break-word' }}>{field.value}</p>
                        </div>
                        {/* Provenance chip — icon+text, never color-only */}
                        {field.provenance === 'confirmed' ? (
                          <span aria-label="Confirmed" style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', fontWeight: 600, color: '#059669', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 'var(--radius-full)', padding: '2px 8px' }}>
                            ✓ Confirmed
                          </span>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Confirm field ${field.fieldKey}`}
                            onClick={() => void handleConfirmField(field.fieldKey)}
                            disabled={confirmingField === field.fieldKey}
                            style={{ flexShrink: 0, minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 'var(--text-xs)', fontWeight: 600, color: '#92400e', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 'var(--radius-sm)', cursor: 'pointer', padding: '2px var(--space-2)' }}
                          >
                            {confirmingField === field.fieldKey ? <Spinner size={10} /> : '?'} {confirmingField === field.fieldKey ? '' : 'Confirm'}
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  background: 'var(--color-bg)',
  color: 'var(--color-foreground)',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px var(--space-4)',
  background: 'var(--color-surface)',
  borderBottom: '1px solid var(--color-border)',
  boxShadow: 'var(--shadow-sm)',
  flexShrink: 0,
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  padding: 'var(--space-4)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
};

const loginWrap: React.CSSProperties = {
  height: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--color-bg)',
  padding: 'var(--space-5)',
};

const loginCard: React.CSSProperties = {
  width: '100%',
  maxWidth: 320,
  padding: 'var(--space-6)',
  borderRadius: 'var(--radius-lg)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  boxShadow: 'var(--shadow-lg)',
};

const fieldLabel: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-muted)',
};

const ghostIconBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 32,
  height: 32,
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'transparent',
  color: 'var(--color-muted)',
  cursor: 'pointer',
  transition: 'background var(--motion-fast), color var(--motion-fast)',
  outline: 'none',
};

const emptyState: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-8) var(--space-5)',
  textAlign: 'center',
};

const captionLabel: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--color-muted)',
  marginBottom: 'var(--space-2)',
};

const captionBox: React.CSSProperties = {
  padding: 'var(--space-3)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border)',
  maxHeight: 180,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
};
