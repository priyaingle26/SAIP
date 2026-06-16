import React, { useState, useEffect, useCallback } from 'react';
import { login, logout, getStoredUser } from '../../lib/auth';
import type { SaipUser, ClinicalNote, Encounter, ExtensionMessage } from '../../lib/schemas';
import RecordingTimer from '../../components/RecordingTimer';
import TranscriptView from '../../components/TranscriptView';
import GeneratedNoteView from '../../components/GeneratedNoteView';
import EncounterHistory from '../../components/EncounterHistory';
import FormAssistant from '../../components/FormAssistant';

type Tab = 'record' | 'note' | 'history';

// ─── Sleek SVG Icons for a Professional, High-End UI ─────────────────────────
const MicIcon = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

const FileTextIcon = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </svg>
);

const HistoryIcon = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l4 2" />
  </svg>
);

const LogOutIcon = ({ size = 18, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" x2="9" y1="12" y2="12" />
  </svg>
);

const AlertTriangleIcon = ({ size = 16, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <line x1="12" x2="12" y1="9" y2="13" />
    <line x1="12" x2="12.01" y1="17" y2="17" />
  </svg>
);

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
    } catch (err) {
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
      // 1. Request mic permission in the visible UI (Side Panel) first
      // Chrome blocks offscreen documents from showing permission prompts
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop()); // Immediately stop, we just needed the permission granted

      setIsRecording(true);
      setTranscript('');
      setGeneratedNote(null);
      setProcessingError('');

      // Ensure offscreen document exists
      const existing = await chrome.offscreen.hasDocument();
      if (!existing) {
        await chrome.offscreen.createDocument({
          url: chrome.runtime.getURL('offscreen.html'),
          reasons: [chrome.offscreen.Reason.USER_MEDIA],
          justification: 'Recording clinical audio for SAIP transcription',
        });
      }

      chrome.runtime.sendMessage({ target: 'offscreen', type: 'START_RECORDING' });
    } catch (err) {
      alert('Microphone permission is required to use the AI Scribe. Please allow microphone access in Chrome settings.');
    }
  }, []);

  const handleStopRecording = useCallback(() => {
    setIsRecording(false);
    setIsProcessing(true);
    setProcessingStep('Uploading & transcribing audio…');
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'STOP_RECORDING' });
  }, []);

  function handleSelectEncounter(encounter: Encounter) {
    if (encounter.transcript) setTranscript(encounter.transcript);
    if (encounter.generatedNote) setGeneratedNote(encounter.generatedNote);
    setCurrentEncounterId(encounter.id);
    setActiveTab('note');
  }

  // ─── Render: Login Screen ─────────────────────────────────────────────────
  if (!user) {
    return (
      <div style={styles.loginWrap}>
        <div style={styles.loginCard}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>S</div>
            <span style={styles.logoText}>SAIP AI Scribe</span>
          </div>
          <p style={styles.loginSubtitle}>EHR Overlay — Sign in to continue</p>
          <form onSubmit={handleLogin} style={styles.form}>
            <input
              id="saip-email"
              style={styles.input}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              id="saip-password"
              style={styles.input}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {loginError && <p style={styles.error}>{loginError}</p>}
            <button id="saip-login-btn" style={styles.primaryBtn} type="submit" disabled={loggingIn}>
              {loggingIn ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Render: Main Panel ───────────────────────────────────────────────────
  return (
    <div style={styles.panel}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoIcon}>S</div>
          <span style={styles.headerTitle}>SAIP AI Scribe</span>
        </div>
        <button id="saip-logout-btn" style={styles.ghostBtn} onClick={handleLogout} title="Logout">
          <LogOutIcon size={16} color="#718096" />
        </button>
      </header>

      {/* User badge */}
      <div style={styles.userBadge}>
        <span style={styles.userDot} />
        <span>{user.name || user.email}</span>
      </div>

      {/* Tab Bar */}
      <div style={styles.tabBar}>
        <button
          id="saip-tab-record"
          style={{ ...styles.tabBtn, ...(activeTab === 'record' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('record')}
        >
          <MicIcon size={14} color={activeTab === 'record' ? '#63b3ed' : '#718096'} />
          <span>Record</span>
        </button>
        <button
          id="saip-tab-note"
          style={{ ...styles.tabBtn, ...(activeTab === 'note' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('note')}
        >
          <FileTextIcon size={14} color={activeTab === 'note' ? '#63b3ed' : '#718096'} />
          <span>Note</span>
        </button>
        <button
          id="saip-tab-history"
          style={{ ...styles.tabBtn, ...(activeTab === 'history' ? styles.tabActive : {}) }}
          onClick={() => setActiveTab('history')}
        >
          <HistoryIcon size={14} color={activeTab === 'history' ? '#63b3ed' : '#718096'} />
          <span>History</span>
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        {/* ── Record Tab ── */}
        {activeTab === 'record' && (
          <div style={styles.recordTab}>
            <div style={styles.recordRing(isRecording)}>
              <div style={styles.recordCore}>
                {isRecording ? <RecordingTimer /> : <MicIcon size={34} color="#63b3ed" />}
              </div>
            </div>

            <div style={styles.recordActions}>
              {!isRecording && !isProcessing && (
                <button id="saip-start-btn" style={styles.recordBtn} onClick={handleStartRecording}>
                  Start Recording
                </button>
              )}
              {isRecording && (
                <button id="saip-stop-btn" style={styles.stopBtn} onClick={handleStopRecording}>
                  Stop & Process
                </button>
              )}
              {isProcessing && (
                <div style={styles.processingBox}>
                  <div style={styles.spinner} />
                  <span>{processingStep}</span>
                </div>
              )}
              {processingError && (
                <div style={{...styles.processingBox, color: '#fc8181'}}>
                  <AlertTriangleIcon size={16} color="#fc8181" />
                  <span>{processingError}</span>
                </div>
              )}
            </div>

            {transcript && (
              <div style={styles.section}>
                <div style={styles.sectionLabel}>Live Transcript</div>
                <TranscriptView transcript={transcript} />
              </div>
            )}
          </div>
        )}

        {/* ── Note Tab ── */}
        {activeTab === 'note' && (
          <div style={styles.noteTab}>
            {generatedNote ? (
              <>
                <GeneratedNoteView note={generatedNote} onNoteChange={setGeneratedNote} />
                <FormAssistant
                  transcript={transcript}
                  clinicalNote={generatedNote.raw ?? ''}
                />
              </>
            ) : (
              <div style={styles.emptyState}>
                <FileTextIcon size={32} color="#4a5568" />
                <p>No note generated yet.</p>
                <p style={styles.hint}>Record a session first.</p>
              </div>
            )}
          </div>
        )}

        {/* ── History Tab ── */}
        {activeTab === 'history' && (
          <EncounterHistory
            encounters={encounters}
            onSelect={handleSelectEncounter}
          />
        )}
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const styles: Record<string, any> = {
  panel: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    background: 'linear-gradient(160deg, #0a0f1e 0%, #0f1a2e 100%)',
    color: '#e2e8f0', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid rgba(99,179,237,0.15)',
    background: 'rgba(15,26,46,0.8)', backdropFilter: 'blur(8px)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 15, fontWeight: 600, color: '#63b3ed' },
  logoIcon: {
    width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#4299e1,#805ad5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, fontWeight: 700, color: '#fff',
  },
  ghostBtn: {
    background: 'none', border: 'none', color: '#718096', cursor: 'pointer',
    fontSize: 18, padding: 4, borderRadius: 6, transition: 'color 0.2s',
  },
  userBadge: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 16px', fontSize: 12, color: '#90cdf4',
    borderBottom: '1px solid rgba(99,179,237,0.08)',
  },
  userDot: {
    width: 7, height: 7, borderRadius: '50%', background: '#48bb78', flexShrink: 0,
  },
  tabBar: {
    display: 'flex', padding: '8px 12px', gap: 6,
    borderBottom: '1px solid rgba(99,179,237,0.1)',
  },
  tabBtn: {
    flex: 1, padding: '7px 4px', border: 'none', borderRadius: 8,
    background: 'rgba(255,255,255,0.04)', color: '#718096',
    cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'all 0.2s',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  tabActive: {
    background: 'rgba(66,153,225,0.15)', color: '#63b3ed',
    boxShadow: '0 0 0 1px rgba(99,179,237,0.3)',
  },
  content: { flex: 1, overflowY: 'auto', padding: 16 },

  // Record tab
  recordTab: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 },
  recordRing: (active: boolean) => ({
    width: 130, height: 130, borderRadius: '50%', marginTop: 16,
    background: active
      ? 'radial-gradient(circle, rgba(245,101,101,0.2) 0%, rgba(245,101,101,0.05) 70%)'
      : 'radial-gradient(circle, rgba(66,153,225,0.15) 0%, rgba(66,153,225,0.03) 70%)',
    border: active ? '2px solid rgba(245,101,101,0.5)' : '2px solid rgba(66,153,225,0.3)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    animation: active ? 'pulse 1.5s ease-in-out infinite' : 'none',
    transition: 'all 0.4s ease',
    boxShadow: active ? '0 0 30px rgba(245,101,101,0.2)' : '0 0 20px rgba(66,153,225,0.1)',
  }),
  recordCore: {
    width: 90, height: 90, borderRadius: '50%',
    background: 'rgba(15,26,46,0.9)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  micIcon: { fontSize: 34 },
  recordActions: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  recordBtn: {
    width: '85%', padding: '14px', borderRadius: 12,
    background: 'linear-gradient(135deg, #4299e1, #805ad5)',
    color: '#fff', border: 'none', cursor: 'pointer',
    fontSize: 15, fontWeight: 600, letterSpacing: 0.3,
    boxShadow: '0 4px 20px rgba(66,153,225,0.35)', transition: 'transform 0.15s',
  },
  stopBtn: {
    width: '85%', padding: '14px', borderRadius: 12,
    background: 'linear-gradient(135deg, #f56565, #e53e3e)',
    color: '#fff', border: 'none', cursor: 'pointer',
    fontSize: 15, fontWeight: 600, letterSpacing: 0.3,
    boxShadow: '0 4px 20px rgba(245,101,101,0.35)', transition: 'transform 0.15s',
  },
  processingBox: {
    display: 'flex', alignItems: 'center', gap: 10,
    color: '#90cdf4', fontSize: 13,
  },
  spinner: {
    width: 16, height: 16, border: '2px solid rgba(99,179,237,0.3)',
    borderTop: '2px solid #63b3ed', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  section: { width: '100%' },
  sectionLabel: {
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: 1, color: '#4a5568', marginBottom: 8,
  },

  // Note tab
  noteTab: { display: 'flex', flexDirection: 'column', gap: 16 },

  // Empty state
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 8, padding: '60px 20px',
    color: '#4a5568', textAlign: 'center',
  },
  hint: { fontSize: 12, color: '#2d3748' },

  // Login
  loginWrap: {
    height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(160deg, #0a0f1e 0%, #0f1a2e 100%)', padding: 20,
  },
  loginCard: {
    width: '100%', maxWidth: 320, padding: 28, borderRadius: 16,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(99,179,237,0.15)',
    backdropFilter: 'blur(12px)',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
  logoText: { fontSize: 17, fontWeight: 700, color: '#63b3ed' },
  loginSubtitle: { fontSize: 12, color: '#4a5568', marginBottom: 24 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  input: {
    padding: '11px 14px', borderRadius: 10,
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(99,179,237,0.2)',
    color: '#e2e8f0', fontSize: 14, outline: 'none',
  },
  primaryBtn: {
    padding: '12px', borderRadius: 10, marginTop: 4,
    background: 'linear-gradient(135deg, #4299e1, #805ad5)',
    color: '#fff', border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 600,
    boxShadow: '0 4px 20px rgba(66,153,225,0.3)',
  },
  error: { fontSize: 12, color: '#fc8181' },
};
