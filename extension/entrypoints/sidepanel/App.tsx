import React, { useState, useEffect, useCallback } from 'react';
import { login, logout, getStoredUser } from '../../lib/auth';
import type { SaipUser, ClinicalNote, Encounter, ExtensionMessage } from '../../lib/schemas';
import RecordingTimer from '../../components/RecordingTimer';
import TranscriptView from '../../components/TranscriptView';
import GeneratedNoteView from '../../components/GeneratedNoteView';
import EncounterHistory from '../../components/EncounterHistory';
import FormAssistant from '../../components/FormAssistant';
import {
  TabBar, Button, Banner, Spinner, Divider,
  LogOutIcon, FileTextIcon, HistoryIcon, MicIcon, AlertIcon, UploadIcon,
  INPUT_STYLE,
} from '../../components/ui';

type Tab = 'record' | 'note' | 'history';

const TABS = [
  { id: 'record',  label: 'Record',  icon: <MicIcon size={14} /> },
  { id: 'note',    label: 'Note',    icon: <FileTextIcon size={14} /> },
  { id: 'history', label: 'History', icon: <HistoryIcon size={14} /> },
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
  
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ─── Bootstrap: check auth & load encounters ─────────────────────────────
  useEffect(() => {
    getStoredUser().then(setUser);
    loadEncounters();
  }, []);

  // ─── Listen for background messages ──────────────────────────────────────
  useEffect(() => {
    const handler = (message: ExtensionMessage) => {
      if (message.type === 'RECORDING_STARTED') setIsRecording(true);
      if (message.type === 'RECORDING_STOPPED') setIsRecording(false);
      if (message.type === 'TRANSCRIBE_COMPLETE') {
        const p = message.payload as { encounterId: string; transcript: string };
        setCurrentEncounterId(p.encounterId);
        setTranscript(p.transcript);
        setProcessingStep('Generating clinical note…');
      }
      if (message.type === 'GENERATE_COMPLETE') {
        const p = message.payload as { note: ClinicalNote; encounterId: string };
        setGeneratedNote(p.note);
        setIsProcessing(false);
        setProcessingStep('');
        setActiveTab('note');
        loadEncounters();
      }
      if (message.type === 'ERROR') {
        setIsProcessing(false);
        setProcessingError(message.error ?? 'Unknown error');
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  async function loadEncounters() {
    const result = await chrome.storage.local.get('saip_encounters');
    setEncounters((result['saip_encounters'] ?? []) as Encounter[]);
  }

  // ─── Auth ─────────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const u = await login(email, password);
      setUser(u);
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
  }

  // ─── Recording ───────────────────────────────────────────────────────────
  const handleStartRecording = useCallback(async () => {
    try {
      // Request mic permission in the visible UI (Side Panel) first —
      // Chrome blocks offscreen documents from showing permission prompts
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());

      setIsRecording(true);
      setTranscript('');
      setGeneratedNote(null);
      setProcessingError('');

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
    setProcessingStep('Uploading & transcribing audio…');
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_RECORDING' });
  }, []);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsRecording(false);
    setIsProcessing(true);
    setProcessingStep('Uploading & transcribing audio…');
    setTranscript('');
    setGeneratedNote(null);
    setProcessingError('');

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      const mimeType = file.type || 'audio/webm';
      
      const port = chrome.runtime.connect({ name: 'saip-audio' });
      port.postMessage({ audioBase64: base64, mimeType });
    };
    reader.onerror = () => {
      setIsProcessing(false);
      setProcessingError('Failed to read file');
    };
    reader.readAsDataURL(file);
    
    // Reset input
    event.target.value = '';
  }, []);

  function handleSelectEncounter(encounter: Encounter) {
    if (encounter.transcript) setTranscript(encounter.transcript);
    if (encounter.generatedNote) setGeneratedNote(encounter.generatedNote);
    setCurrentEncounterId(encounter.id);
    setActiveTab('note');
  }

  // ─── Render: Login ────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={loginWrap}>
        <div style={loginCard}>
          {/* Brand */}
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
            {/* Record ring + button */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-5)', paddingTop: 'var(--space-4)' }}>
              {/* Animated ring */}
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

            {transcript && (
              <div style={{ width: '100%' }}>
                <p style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-muted)', marginBottom: 'var(--space-2)' }}>
                  Live Transcript
                </p>
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
      </main>
    </div>
  );
}

// ─── Styles (token-referenced only, no hardcoded values) ─────────────────────

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
