"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { MobileRecorder } from "./lib/recorder";
import {
  setFinalizeHandler, setStatusReporter, drainAll,
} from "./lib/syncQueue";
import {
  setRuntimeConfig, addDeletionTombstone, clearDeletionTombstone, deleteSession,
  type SessionMeta, type SyncSummary, type TimerState,
} from "./lib/durableStore";
import {
  finalizeSession as apiFinalize, generateNote as apiGenerate,
  deleteServerSession, deleteEncounter,
} from "./lib/apiClient";
import {
  registerServiceWorker, recoverStaleRecordingSessions, getActiveRecordingSession,
} from "./lib/lifecycle";

// Live elapsed = recordedMs + (now - lastResumedAt); freezes while paused. Survives reopen.
function RecordingTimer({ paused, recordedMs, lastResumedAt }: { paused: boolean; recordedMs: number; lastResumedAt?: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setTick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [paused, lastResumedAt]);
  const activeMs = paused || !lastResumedAt ? recordedMs : recordedMs + (Date.now() - lastResumedAt);
  const s = Math.max(0, Math.floor(activeMs / 1000));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 20, letterSpacing: 2 }}>{mm}:{ss}</span>;
}

// ─── Types ────────────────────────────────────────────────────────────────────
type User = { id: string; email: string; name: string };
type Encounter = {
  id: string;
  clientName: string;
  date: string;
  status: string;
  transcript: string | null;
  generatedNote: { raw: string } | null;
};
type Patient = {
  id: string;
  name: string;
  dob?: string | null;
  credibleClientId?: string | null;
};
type ProfileField = {
  id: string;
  fieldKey: string;
  value: string;
  provenance: "suggested" | "confirmed";
};
type Tab = "record" | "note" | "history" | "patient";

// Display names for the language toggle (ISO-639-1 → English name). Falls back to the code.
const LANG_NAMES: Record<string, string> = {
  en: "English", hi: "Hindi", es: "Spanish", fr: "French", de: "German", pt: "Portuguese",
  zh: "Chinese", ar: "Arabic", ru: "Russian", ja: "Japanese", ko: "Korean", bn: "Bengali",
  pa: "Punjabi", ta: "Tamil", te: "Telugu", mr: "Marathi", gu: "Gujarati", ur: "Urdu",
  it: "Italian", vi: "Vietnamese", tl: "Tagalog", fa: "Persian", pl: "Polish",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getApiUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const MicIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);
const UploadIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" x2="12" y1="3" y2="15" />
  </svg>
);
const FileTextIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
  </svg>
);
const HistoryIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" /><path d="M12 7v5l4 2" />
  </svg>
);
const LogOutIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" x2="9" y1="12" y2="12" />
  </svg>
);
const PersonIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
  </svg>
);

const PauseIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);
const PlayIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M8 5v14l11-7z" />
  </svg>
);
const TrashIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ flexShrink: 0 }}>
    <path d="M3 6h18" />
    <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <line x1="10" x2="10" y1="11" y2="17" />
    <line x1="14" x2="14" y1="11" y2="17" />
  </svg>
);

// ─── Logo mark ────────────────────────────────────────────────────────────────
const LogoMark = ({ size = 26 }: { size?: number }) => (
  <div aria-hidden="true" style={{
    width: size, height: size, borderRadius: 6,
    background: "#3b276a", display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: size * 0.5, fontWeight: 700, color: "#ffffff",
    fontFamily: "'Figtree', 'Segoe UI', system-ui, sans-serif", flexShrink: 0,
  }}>S</div>
);

// ─── Spinner ──────────────────────────────────────────────────────────────────
const Spinner = ({ size = 14, color = "#3b276a" }: { size?: number; color?: string }) => (
  <div role="status" aria-label="Loading" style={{
    width: size, height: size, borderRadius: "50%",
    border: `2px solid ${color}22`, borderTopColor: color,
    animation: "saip-spin 0.7s linear infinite", flexShrink: 0,
  }} />
);

// ─── Design tokens (mirrors extension tokens.css exactly) ─────────────────────
const T = {
  primary: "#3b276a",
  primaryFg: "#ffffff",
  primarySubtle: "#f0edf7",
  primarySubtleBorder: "#d5cee9",
  accent: "#0d9488",
  bg: "#f5f4f9",
  surface: "#ffffff",
  surface2: "#f8f7fc",
  fg: "#1a1528",
  muted: "#52516a",
  muted2: "#8c8aab",
  border: "#dddae9",
  destructive: "#b91c1c",
  destructiveFg: "#ffffff",
  destructiveBg: "#fef2f2",
  destructiveBorder: "#fecaca",
  success: "#047857",
  successBg: "#ecfdf5",
  successBorder: "#a7f3d0",
  warning: "#92400e",
  warningBg: "#fffbeb",
  warningBorder: "#fde68a",
  ring: "rgba(59,39,106,0.35)",
  fontHeading: "'Figtree','Segoe UI',system-ui,sans-serif",
  fontBody: "'Noto Sans','Segoe UI',system-ui,sans-serif",
  fontMono: "ui-monospace,'Cascadia Code',monospace",
  shadowSm: "0 1px 3px rgba(59,39,106,0.07),0 1px 2px rgba(59,39,106,0.04)",
  shadowMd: "0 4px 12px rgba(59,39,106,0.09),0 2px 4px rgba(59,39,106,0.05)",
  shadowLg: "0 8px 24px rgba(59,39,106,0.13),0 4px 8px rgba(59,39,106,0.06)",
};

// ─── Shared input style ────────────────────────────────────────────────────────
const INPUT_STYLE: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14,
  fontFamily: "'Noto Sans','Segoe UI',system-ui,sans-serif",
  border: `1px solid ${T.border}`, borderRadius: 8,
  background: T.bg, color: T.fg, outline: "none",
  boxSizing: "border-box", transition: "border-color 150ms ease, box-shadow 150ms ease",
};

// ─── Tabs definition ──────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "record", label: "Record", icon: <MicIcon size={15} /> },
  { id: "note", label: "Note", icon: <FileTextIcon size={15} /> },
  { id: "history", label: "History", icon: <HistoryIcon size={15} /> },
  { id: "patient", label: "Patient", icon: <PersonIcon size={15} /> },
];

// ═══════════════════════════════════════════════════════════════════════════════
export default function MobileApp() {

  // ── Auth state ──────────────────────────────────────────────────────────────
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>("");
  const [email, setEmail] = useState("demo@saip.local");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  // ── App state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("record");
  const [encounters, setEncounters] = useState<Encounter[]>([]);

  // ── Recording state ─────────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [processingError, setProcessingError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [generatedNote, setGeneratedNote] = useState<{ raw: string } | null>(null);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [editedNoteContent, setEditedNoteContent] = useState("");
  // Multilingual notes: per-language markdown variants + currently viewed language.
  const [notesByLanguage, setNotesByLanguage] = useState<Record<string, string>>({});
  const [selectedLanguage, setSelectedLanguage] = useState<string>("en");

  // ── Durable recording lifecycle state ────────────────────────────────────────
  const [isPaused, setIsPaused] = useState(false);
  const [timing, setTiming] = useState<TimerState>({ recordedMs: 0 });
  const [syncStatus, setSyncStatus] = useState<{ pendingChunks: number; syncing: boolean } | null>(null);
  // Debounced visibility for the online "Syncing…" banner — avoids it flashing in/out (and
  // shifting the layout) for the normal per-chunk drain during recording.
  const [showSyncing, setShowSyncing] = useState(false);
  const [storageWarning, setStorageWarning] = useState<{ usageMB: number; quotaMB: number } | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const offlineSavedRef = useRef(false);
  const markOfflineSaved = useCallback((v: boolean) => { offlineSavedRef.current = v; setOfflineSaved(v); }, []);
  const recorderRef = useRef<MobileRecorder | null>(null);

  // ── Patient state ───────────────────────────────────────────────────────────
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patientSearching, setPatientSearching] = useState(false);
  const [showCreatePatient, setShowCreatePatient] = useState(false);
  const [newPatientName, setNewPatientName] = useState("");
  const [newPatientDob, setNewPatientDob] = useState("");
  const [creatingPatient, setCreatingPatient] = useState(false);
  const [patientProfile, setPatientProfile] = useState<ProfileField[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showPatientPicker, setShowPatientPicker] = useState(false);
  const [confirmingField, setConfirmingField] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Inject fonts + keyframes ─────────────────────────────────────────────────
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Noto+Sans:wght@400;500;600&display=swap";
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      @keyframes saip-spin { to { transform: rotate(360deg); } }
      @keyframes saip-pulse-ring-rec {
        0%,100% { box-shadow: 0 0 0 0 rgba(185,28,28,0.25); }
        50%      { box-shadow: 0 0 0 10px rgba(185,28,28,0); }
      }
      @keyframes saip-fade-in {
        from { opacity:0; transform:translateY(4px); }
        to   { opacity:1; transform:translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const storedToken = localStorage.getItem("saip_ext_token");
    const storedUser = localStorage.getItem("saip_ext_user");
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
      void fetchEncounters(storedToken);
    }
  }, []);

  // ── Durable recording lifecycle: handlers, SW, recovery, restoration ──────────
  useEffect(() => {
    // Finalize a fully-uploaded session → re-transcribe + generate note → update UI.
    setFinalizeHandler(async (meta: SessionMeta) => {
      const fin = await apiFinalize(meta.sessionId, meta.transcript ?? "", meta.patientId, true);
      if (!fin.ok || !fin.data) return false;
      const gen = await apiGenerate(fin.data.encounterId, fin.data.transcript, meta.patientId);
      setTranscript(fin.data.transcript);
      if (gen.ok && gen.data) {
        const map = gen.data.notesByLanguage ?? {};
        const primary = gen.data.primaryLanguage ?? "en";
        setNotesByLanguage(map);
        setSelectedLanguage(primary);
        const note = map[primary] ? { raw: map[primary] } : gen.data.note;
        setGeneratedNote(note);
        setEditedNoteContent(note.raw);
        setActiveTab("note");
      }
      setIsProcessing(false);
      setProcessingStep("");
      markOfflineSaved(false);
      void fetchEncounters(localStorage.getItem("saip_ext_token") ?? "");
      return true;
    });

    // Mirror sync status into the banner.
    setStatusReporter((summary: SyncSummary, syncing: boolean) => {
      setSyncStatus({ pendingChunks: summary.pendingChunks, syncing });
    });

    // Online/offline → banner + drain on reconnect; flip "saved offline" → "transcribing".
    const handleOnline = () => {
      setIsOnline(true);
      if (offlineSavedRef.current) {
        markOfflineSaved(false);
        setIsProcessing(true);
        setProcessingStep("Uploading & transcribing…");
      }
      void drainAll();
    };
    const handleOffline = () => setIsOnline(false);
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    void registerServiceWorker();

    // Recover an abandoned recording, restore an in-progress/paused one, then drain backlog.
    void (async () => {
      await recoverStaleRecordingSessions();
      const active = await getActiveRecordingSession();
      if (active) {
        setIsRecording(true);
        setIsPaused(active.paused ?? false);
        setTiming({ recordedMs: active.recordedMs ?? 0, lastResumedAt: active.lastResumedAt });
      }
      void drainAll();
    })();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      recorderRef.current?.destroy();
    };
  }, [markOfflineSaved]);

  // Mirror auth token + backend URL into IndexedDB so the service worker can drain after close.
  useEffect(() => {
    if (!token) return;
    void setRuntimeConfig({
      token,
      backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
    });
  }, [token]);

  // ── Auth ─────────────────────────────────────────────────────────────────────
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const res = await fetch(getApiUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error("Login failed. Use demo@saip.local");
      const data = await res.json();
      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem("saip_ext_token", data.access_token);
      localStorage.setItem("saip_ext_user", JSON.stringify(data.user));
      void fetchEncounters(data.access_token);
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsLoggingIn(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("saip_ext_token");
    localStorage.removeItem("saip_ext_user");
    setToken(""); setUser(null);
    setTranscript(""); setGeneratedNote(null);
    setEditedNoteContent(""); setIsEditingNote(false);
    setSelectedPatient(null);
  }

  // ── Encounters ───────────────────────────────────────────────────────────────
  async function fetchEncounters(t: string) {
    try {
      const res = await fetch(getApiUrl("/ext-encounters"), { headers: { Authorization: `Bearer ${t}` } });
      if (!res.ok) return;
      setEncounters(await res.json());
    } catch { /* silent */ }
  }

  // ── Durable recording ─────────────────────────────────────────────────────────
  function ensureRecorder(): MobileRecorder {
    if (!recorderRef.current) {
      recorderRef.current = new MobileRecorder({
        onStarted: () => { setIsRecording(true); setIsPaused(false); setTiming({ recordedMs: 0, lastResumedAt: Date.now() }); },
        onPaused: (t) => { setIsPaused(true); setTiming({ recordedMs: t.recordedMs, lastResumedAt: undefined }); },
        onResumed: (t) => { setIsPaused(false); setTiming({ recordedMs: t.recordedMs, lastResumedAt: t.lastResumedAt }); },
        onStopped: (discarded: boolean) => {
          setIsRecording(false); setIsPaused(false);
          if (discarded) { setIsProcessing(false); setProcessingStep(""); markOfflineSaved(false); return; }
          // The sync queue uploads remaining chunks then the finalize handler updates the UI.
          if (typeof navigator !== "undefined" && navigator.onLine) {
            setIsProcessing(true); setProcessingStep("Uploading & transcribing…");
          } else {
            // Stopped offline: capture is durably saved; finalize is parked until reconnect.
            markOfflineSaved(true);
          }
        },
        onStorageWarning: (w) => setStorageWarning(w),
        onError: (msg) => { setProcessingError(msg); setIsRecording(false); },
      });
    }
    return recorderRef.current;
  }

  async function startRecording() {
    setTranscript(""); setGeneratedNote(null); setEditedNoteContent(""); setIsEditingNote(false); setProcessingError("");
    setNotesByLanguage({}); setSelectedLanguage("en");
    markOfflineSaved(false);
    await ensureRecorder().start(selectedPatient?.id);
  }

  function stopRecording() {
    void ensureRecorder().stop();
  }

  function handlePause() { void ensureRecorder().pause(false); }
  function handleResume() { void ensureRecorder().resume(); }

  async function handleDiscard() {
    if (!window.confirm("Discard this recording? The captured audio will be deleted and no note will be created.")) return;
    const rec = ensureRecorder();
    const sid = rec.currentSessionId;
    setIsRecording(false); setIsPaused(false); setIsProcessing(false);
    if (sid) {
      await addDeletionTombstone(sid, "session"); // tombstone first → delete-wins over any finalize
      await rec.discard();
      await deleteSession(sid).catch(() => {});
      const ok = await deleteServerSession(sid);
      if (ok) await clearDeletionTombstone(sid, "session");
    } else {
      await rec.discard();
    }
  }

  function handleSyncNow() { void drainAll(); }

  async function handleDeleteEncounter(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm("Permanently delete this encounter? The recording, transcript, and note will be removed.")) return;
    setEncounters((prev) => prev.filter((enc) => enc.id !== id));
    await addDeletionTombstone(id, "encounter");
    const ok = await deleteEncounter(id);
    if (ok) await clearDeletionTombstone(id, "encounter");
  }

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsRecording(false); setIsProcessing(true); setProcessingStep("Uploading & transcribing…");
    setTranscript(""); setGeneratedNote(null); setEditedNoteContent(""); setIsEditingNote(false); setProcessingError("");
    setNotesByLanguage({}); setSelectedLanguage("en");
    await processAudioBlob(file, file.type || "audio/webm");
    event.target.value = "";
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function processAudioBlob(blob: Blob, mimeType: string) {
    try {
      const fd = new FormData();
      const name = "name" in blob && (blob as File).name
        ? (blob as File).name
        : `recording.${mimeType.includes("mp4") ? "mp4" : mimeType.includes("wav") ? "wav" : mimeType.includes("mpeg") ? "mp3" : "webm"}`;
      fd.append("audio", blob, name);
      if (selectedPatient) fd.append("patient_id", selectedPatient.id);
      const res = await fetch(getApiUrl("/transcribe"), { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd });
      if (!res.ok) throw new Error("Transcription failed");
      const data = await res.json();
      setTranscript(data.transcript);
      setProcessingStep("Generating clinical note…");
      await generateNote(data.encounterId, data.transcript);
    } catch (e: unknown) {
      setProcessingError(e instanceof Error ? e.message : "Processing failed");
      setIsProcessing(false);
    }
  }

  async function generateNote(encounterId: string, trans: string) {
    try {
      const res = await fetch(getApiUrl("/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ encounter_id: encounterId, transcript: trans, patient_id: selectedPatient?.id }),
      });
      if (!res.ok) throw new Error("Note generation failed");
      const data = await res.json();
      const map: Record<string, string> = data.notesByLanguage ?? {};
      const primary: string = data.primaryLanguage ?? "en";
      setNotesByLanguage(map);
      setSelectedLanguage(primary);
      const note = map[primary] ? { raw: map[primary] } : data.note;
      setGeneratedNote(note);
      setEditedNoteContent(note.raw);
      setActiveTab("note");
      void fetchEncounters(token);
    } catch (e: unknown) {
      setProcessingError(e instanceof Error ? e.message : "Generation failed");
    } finally { setIsProcessing(false); }
  }

  // ── Patient handlers ──────────────────────────────────────────────────────────
  const handlePatientSearch = useCallback(async (q: string) => {
    setPatientQuery(q);
    if (!q.trim()) { setPatientResults([]); return; }
    setPatientSearching(true);
    try {
      const res = await fetch(getApiUrl(`/patients/search?q=${encodeURIComponent(q)}`), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setPatientResults(await res.json());
    } finally { setPatientSearching(false); }
  }, [token]);

  const handleSelectPatient = useCallback((p: Patient | null) => {
    setSelectedPatient(p); setPatientResults([]); setPatientQuery(""); setShowPatientPicker(false);
  }, []);

  const handleCreatePatient = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatientName.trim()) return;
    setCreatingPatient(true);
    try {
      const res = await fetch(getApiUrl("/patients"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newPatientName.trim(), dob: newPatientDob || undefined }),
      });
      if (res.ok) {
        const p = await res.json();
        handleSelectPatient(p);
        setShowCreatePatient(false); setNewPatientName(""); setNewPatientDob("");
      }
    } finally { setCreatingPatient(false); }
  }, [newPatientName, newPatientDob, token, handleSelectPatient]);

  const loadPatientProfile = useCallback(async (patientId: string) => {
    setProfileLoading(true);
    try {
      const res = await fetch(getApiUrl(`/patients/${patientId}/profile`), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setPatientProfile(d.fields ?? []); }
    } finally { setProfileLoading(false); }
  }, [token]);

  useEffect(() => {
    if (activeTab === "patient" && selectedPatient) void loadPatientProfile(selectedPatient.id);
  }, [activeTab, selectedPatient, loadPatientProfile]);

  // Show the online "Syncing…" banner only for a genuinely stuck backlog (>1.2s) and never
  // while recording — so the normal per-chunk drain doesn't flicker the banner / shift content.
  useEffect(() => {
    const pending = syncStatus?.pendingChunks ?? 0;
    if (isOnline && pending > 0 && !isRecording) {
      const id = setTimeout(() => setShowSyncing(true), 1200);
      return () => clearTimeout(id);
    }
    setShowSyncing(false);
    return undefined;
  }, [syncStatus, isOnline, isRecording]);

  const handleConfirmField = useCallback(async (fieldKey: string) => {
    if (!selectedPatient) return;
    setConfirmingField(fieldKey);
    try {
      const res = await fetch(getApiUrl(`/patients/${selectedPatient.id}/profile/${fieldKey}/confirm`), {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const updated = await res.json();
        setPatientProfile((prev) => prev.map((f) => f.fieldKey === fieldKey ? { ...f, provenance: updated.provenance } : f));
      }
    } finally { setConfirmingField(null); }
  }, [selectedPatient, token]);

  // ── Shared input focus handlers ───────────────────────────────────────────────
  const focusStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = T.primary; e.target.style.boxShadow = `0 0 0 3px ${T.ring}`;
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.style.borderColor = T.border; e.target.style.boxShadow = "none";
  };

  // ════════════════════════════════════════════════════════════════════════════
  // LOGIN SCREEN
  // ════════════════════════════════════════════════════════════════════════════
  if (!user) {
    return (
      <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: T.bg, padding: 20, fontFamily: T.fontBody }}>
        <div style={{ width: "100%", maxWidth: 340, padding: "32px 28px", borderRadius: 14, background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadowLg, animation: "saip-fade-in 0.2s ease" }}>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <LogoMark size={34} />
            <span style={{ fontFamily: T.fontHeading, fontSize: 18, fontWeight: 700, color: T.primary }}>SAIP AI Scribe</span>
          </div>
          <p style={{ fontSize: 13, color: T.muted, marginBottom: 28, marginTop: 0 }}>
            Clinical AI Companion — Sign in to continue
          </p>

          <form onSubmit={handleLogin} suppressHydrationWarning style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Email */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label htmlFor="mob-email" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted }}>Email</label>
              <input id="mob-email" type="email" placeholder="clinician@example.com" autoComplete="email" required suppressHydrationWarning
                value={email} onChange={(e) => setEmail(e.target.value)}
                style={{ ...INPUT_STYLE, fontSize: 14 }} onFocus={focusStyle} onBlur={blurStyle} />
            </div>
            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label htmlFor="mob-pw" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted }}>Password</label>
              <input id="mob-pw" type="password" placeholder="••••••••" autoComplete="current-password" suppressHydrationWarning
                value={password} onChange={(e) => setPassword(e.target.value)}
                style={{ ...INPUT_STYLE, fontSize: 14 }} onFocus={focusStyle} onBlur={blurStyle} />
            </div>

            {loginError && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: T.destructiveBg, border: `1px solid ${T.destructiveBorder}`, color: T.destructive, fontSize: 13 }}>
                {loginError}
              </div>
            )}

            <button type="submit" disabled={isLoggingIn} style={{
              width: "100%", padding: "13px 20px", fontSize: 15, fontWeight: 600, fontFamily: T.fontBody,
              borderRadius: 10, border: "none", background: isLoggingIn ? T.primarySubtle : T.primary,
              color: isLoggingIn ? T.primary : T.primaryFg, cursor: isLoggingIn ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: isLoggingIn ? "none" : "0 2px 8px rgba(59,39,106,0.28)",
              marginTop: 4, transition: "background 150ms ease",
            }}>
              {isLoggingIn && <Spinner size={15} color={T.primary} />}
              {isLoggingIn ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // MAIN APP — fills full viewport like the extension sidepanel
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh", background: T.bg, color: T.fg, fontFamily: T.fontBody, overflow: "hidden" }}>

      {/* ── Header ── */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: T.surface, borderBottom: `1px solid ${T.border}`, boxShadow: T.shadowSm, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <LogoMark size={24} />
          <span style={{ fontFamily: T.fontHeading, fontSize: 15, fontWeight: 700, color: T.primary }}>SAIP AI Scribe</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: T.muted }}>{user.name || user.email}</span>
          <button onClick={handleLogout} title="Sign out" aria-label="Sign out" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 6, border: "none", background: "transparent", color: T.muted, cursor: "pointer" }}>
            <LogOutIcon size={15} />
          </button>
        </div>
      </header>

      {/* ── Tab Bar ── */}
      <div style={{ display: "flex", background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "4px 12px", flexShrink: 0 }}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === "history") void fetchEncounters(token);
            }} style={{
              flex: 1,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              padding: "8px 10px",
              margin: "2px 4px",
              border: active ? `1px solid ${T.primary}` : "1px solid transparent",
              borderRadius: 6,
              background: "transparent",
              color: active ? T.primary : T.muted,
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              fontFamily: T.fontBody,
              cursor: "pointer",
              transition: "all 150ms ease",
              outline: "none",
            }}>
              {tab.icon}
              <span style={{ fontWeight: active ? 600 : 500 }}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Sync / storage banner ── */}
      {storageWarning && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: T.destructiveBg, borderBottom: `1px solid ${T.destructiveBorder}`, color: T.destructive, fontSize: 12, fontWeight: 600 }}>
          Low device storage ({storageWarning.usageMB} MB used) — finish &amp; sync this session soon.
        </div>
      )}
      {/* Offline backlog — persistent (no flicker). */}
      {!isOnline && (syncStatus?.pendingChunks ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", background: T.warningBg, borderBottom: `1px solid ${T.warningBorder}`, color: T.warning, fontSize: 12, fontWeight: 600 }}>
          Offline — {syncStatus!.pendingChunks} chunk{syncStatus!.pendingChunks === 1 ? "" : "s"} saved, will sync when reconnected
        </div>
      )}
      {/* Online sync — only when a real backlog persists (debounced), never mid-recording. */}
      {showSyncing && (syncStatus?.pendingChunks ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 14px", background: T.primarySubtle, borderBottom: `1px solid ${T.primarySubtleBorder}`, color: T.primary, fontSize: 12, fontWeight: 600 }}>
          <span>Syncing {syncStatus!.pendingChunks} chunk{syncStatus!.pendingChunks === 1 ? "" : "s"}…</span>
          {!syncStatus!.syncing && (
            <button onClick={handleSyncNow} style={{ border: "none", background: "transparent", color: T.primary, fontWeight: 700, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Sync now</button>
          )}
        </div>
      )}

      {/* ── Content ── */}
      <main style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ═══ RECORD TAB ═══ */}
        {activeTab === "record" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, animation: "saip-fade-in 0.15s ease" }}>

            {/* Patient selector (compact, same as extension) */}
            <div style={{ width: "100%", background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: "10px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: selectedPatient ? T.fg : T.muted, fontSize: 13 }}>
                  <PersonIcon size={14} />
                  <span style={{ fontWeight: selectedPatient ? 600 : 400 }}>
                    {selectedPatient ? selectedPatient.name : "No patient selected (optional)"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {selectedPatient && (
                    <button type="button" onClick={() => handleSelectPatient(null)} aria-label="Clear patient"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", color: T.muted, cursor: "pointer", fontSize: 13 }}>✕</button>
                  )}
                  <button type="button" onClick={() => setShowPatientPicker((v) => !v)}
                    aria-label={showPatientPicker ? "Close patient picker" : "Select patient"}
                    style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "none", background: showPatientPicker ? T.primarySubtle : "transparent", color: T.muted, cursor: "pointer", fontSize: 11 }}>
                    {showPatientPicker ? "▲" : "▼"}
                  </button>
                </div>
              </div>

              {/* Patient search dropdown */}
              {showPatientPicker && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                  <input type="text" placeholder="Search by name or ID…" value={patientQuery}
                    onChange={(e) => void handlePatientSearch(e.target.value)} autoFocus
                    style={{ ...INPUT_STYLE, fontSize: 13 }} onFocus={focusStyle} onBlur={blurStyle} />
                  {patientSearching && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted }}><Spinner size={12} /> Searching…</div>}
                  {patientResults.length > 0 && (
                    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4, maxHeight: 150, overflowY: "auto" }}>
                      {patientResults.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => handleSelectPatient(p)}
                            style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "none", background: T.bg, cursor: "pointer", fontSize: 13 }}>
                            <span style={{ fontWeight: 500 }}>{p.name}</span>
                            {p.dob && <span style={{ color: T.muted, marginLeft: 6, fontSize: 11 }}>{p.dob}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!showCreatePatient ? (
                    <button type="button" onClick={() => setShowCreatePatient(true)}
                      style={{ alignSelf: "flex-start", fontSize: 12, color: T.primary, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: T.fontBody }}>
                      + Create new patient
                    </button>
                  ) : (
                    <form onSubmit={(e) => void handleCreatePatient(e)}
                      style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, background: T.primarySubtle, borderRadius: 8 }}>
                      <input type="text" placeholder="Full name *" required value={newPatientName}
                        onChange={(e) => setNewPatientName(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 13 }} onFocus={focusStyle} onBlur={blurStyle} />
                      <input type="date" placeholder="Date of birth" value={newPatientDob}
                        onChange={(e) => setNewPatientDob(e.target.value)} style={{ ...INPUT_STYLE, fontSize: 13 }} onFocus={focusStyle} onBlur={blurStyle} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="submit" disabled={creatingPatient} style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", background: T.primary, color: T.primaryFg, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          {creatingPatient && <Spinner size={12} color="#fff" />} Create
                        </button>
                        <button type="button" onClick={() => setShowCreatePatient(false)}
                          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.primarySubtleBorder}`, background: T.surface, color: T.primary, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Mic ring */}
            <div style={{ paddingTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <div style={{ width: 120, height: 120, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: isRecording ? (isPaused ? T.warningBg : T.destructiveBg) : T.primarySubtle, border: `2px solid ${isRecording ? (isPaused ? T.warningBorder : T.destructiveBorder) : T.primarySubtleBorder}`, animation: isRecording && !isPaused ? "saip-pulse-ring-rec 1.6s ease-in-out infinite" : "none", transition: "background 300ms ease, border-color 300ms ease" }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: T.surface, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", boxShadow: T.shadowMd, color: isRecording ? (isPaused ? T.warning : T.destructive) : T.primary, gap: 2 }}>
                  {isRecording ? (
                    <>
                      <RecordingTimer paused={isPaused} recordedMs={timing.recordedMs} lastResumedAt={timing.lastResumedAt} />
                      {isPaused && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Paused</span>}
                    </>
                  ) : (
                    <MicIcon size={32} />
                  )}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 280 }}>
                {!isRecording && !isProcessing && offlineSaved && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 10, background: T.warningBg, border: `1px solid ${T.warningBorder}`, color: T.warning, fontSize: 13, lineHeight: 1.4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: "currentColor", flexShrink: 0, marginTop: 5 }} />
                    <span>Saved offline — this recording will transcribe &amp; generate its note automatically when you reconnect.</span>
                  </div>
                )}
                {!isRecording && !isProcessing && (
                  <>
                    <button onClick={startRecording} style={{ width: "100%", padding: "13px 20px", fontSize: 15, fontWeight: 600, fontFamily: T.fontBody, borderRadius: 10, border: "none", background: T.primary, color: T.primaryFg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 2px 8px rgba(59,39,106,0.28)" }}>
                      <MicIcon size={16} /> Start Recording
                    </button>
                    <input type="file" accept="audio/*,video/mp4,video/mpeg,.mp4,.mpeg,.mp3,.m4a,.wav,.webm,.ogg" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />
                    <button onClick={() => fileInputRef.current?.click()} style={{ width: "100%", padding: "10px 16px", fontSize: 14, fontWeight: 600, fontFamily: T.fontBody, borderRadius: 10, border: `1px solid ${T.primarySubtleBorder}`, background: T.primarySubtle, color: T.primary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <UploadIcon size={15} /> Upload Audio
                    </button>
                  </>
                )}
                {isRecording && (
                  <>
                    <div style={{ display: "flex", gap: 10 }}>
                      {isPaused ? (
                        <button onClick={handleResume} style={{ flex: 1, padding: "13px 16px", fontSize: 15, fontWeight: 600, fontFamily: T.fontBody, borderRadius: 10, border: "none", background: T.primary, color: T.primaryFg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <PlayIcon size={15} /> Resume
                        </button>
                      ) : (
                        <button onClick={handlePause} style={{ flex: 1, padding: "13px 16px", fontSize: 15, fontWeight: 600, fontFamily: T.fontBody, borderRadius: 10, border: `1px solid ${T.primarySubtleBorder}`, background: T.primarySubtle, color: T.primary, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <PauseIcon size={15} /> Pause
                        </button>
                      )}
                      <button onClick={stopRecording} style={{ flex: 1, padding: "13px 16px", fontSize: 15, fontWeight: 600, fontFamily: T.fontBody, borderRadius: 10, border: "none", background: T.destructive, color: T.destructiveFg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        Stop &amp; Process
                      </button>
                    </div>
                    <button onClick={handleDiscard} style={{ alignSelf: "center", background: "none", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 4 }}>
                      Discard recording
                    </button>
                    <p style={{ fontSize: 11, color: T.muted2, textAlign: "center", margin: 0, lineHeight: 1.4 }}>
                      Keep this app open and the screen on to keep recording.
                    </p>
                  </>
                )}
                {isProcessing && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.muted, fontSize: 14, justifyContent: "center", padding: "8px 0" }}>
                    <Spinner size={15} color={T.primary} />
                    <span>{processingStep}</span>
                  </div>
                )}
              </div>
            </div>

            {processingError && (
              <div style={{ width: "100%", padding: "10px 14px", borderRadius: 8, background: T.destructiveBg, border: `1px solid ${T.destructiveBorder}`, color: T.destructive, fontSize: 13 }}>
                {processingError}
              </div>
            )}

            {!isRecording && transcript && (
              <div style={{ width: "100%" }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.muted, marginBottom: 8, marginTop: 0 }}>Transcript</p>
                <div style={{ padding: 12, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, maxHeight: 180, overflowY: "auto", fontSize: 13, color: T.fg, fontFamily: T.fontMono, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{transcript}</div>
              </div>
            )}
          </div>
        )}

        {/* ═══ NOTE TAB ═══ */}
        {activeTab === "note" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "saip-fade-in 0.15s ease" }}>
            {generatedNote ? (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 9999, background: T.primarySubtle, border: `1px solid ${T.primarySubtleBorder}`, fontSize: 11, fontWeight: 700, color: T.primary, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                      AI Generated
                    </span>
                    <span style={{ fontSize: 12, color: T.muted2, lineHeight: 1.2, maxWidth: 120 }}>
                      Review & edit before autofilling
                    </span>
                  </div>
                  <button type="button" onClick={() => setIsEditingNote(!isEditingNote)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${isEditingNote ? T.primary : T.border}`, background: isEditingNote ? T.primarySubtle : T.surface, color: isEditingNote ? T.primary : T.fg, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: T.fontBody, boxShadow: T.shadowSm }}>
                    {isEditingNote ? "Done" : "Edit"}
                  </button>
                </div>

                {/* Language toggle — shown only when the note exists in more than one language. */}
                {Object.keys(notesByLanguage).length > 1 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted }}>Language</span>
                    <select
                      aria-label="Note language"
                      value={selectedLanguage}
                      onChange={(e) => {
                        const code = e.target.value;
                        setSelectedLanguage(code);
                        if (notesByLanguage[code]) { setGeneratedNote({ raw: notesByLanguage[code] }); setEditedNoteContent(notesByLanguage[code]); }
                      }}
                      style={{ ...INPUT_STYLE, width: "auto", padding: "6px 10px", fontSize: 13 }}
                    >
                      {Object.keys(notesByLanguage).map((code) => (
                        <option key={code} value={code}>{LANG_NAMES[code] ?? code.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                )}

                {isEditingNote ? (
                  <textarea
                    value={editedNoteContent}
                    onChange={(e) => setEditedNoteContent(e.target.value)}
                    style={{ ...INPUT_STYLE, minHeight: 400, resize: "vertical", fontFamily: T.fontMono, fontSize: 13, lineHeight: 1.5 }}
                  />
                ) : (
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, boxShadow: T.shadowSm, fontSize: 13, color: T.fg, lineHeight: 1.65 }}>
                    <div dangerouslySetInnerHTML={{
                      __html: editedNoteContent
                        .replace(/^## (.+)$/gm, `<h2 style="font-family:${T.fontHeading};font-size:14px;font-weight:700;color:${T.primary};margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid ${T.border}">$1</h2>`)
                        .replace(/^# (.+)$/gm, `<h2 style="font-family:${T.fontHeading};font-size:14px;font-weight:700;color:${T.primary};margin:16px 0 6px;padding-bottom:4px;border-bottom:1px solid ${T.border}">$1</h2>`)
                        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                        .replace(/\*(.+?)\*/g, "<em>$1</em>")
                        .replace(/^- (.+)$/gm, "<li style='margin:2px 0'>$1</li>")
                        .replace(/^• (.+)$/gm, "<li style='margin:2px 0'>$1</li>")
                        .replace(/\n\n/g, "<br/>")
                    }} />
                  </div>
                )}
                {transcript && (
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.muted, marginBottom: 8, marginTop: 0 }}>Transcript</p>
                    <div style={{ padding: 12, borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 12, color: T.muted, fontFamily: T.fontMono, lineHeight: 1.55, maxHeight: 160, overflowY: "auto", whiteSpace: "pre-wrap" }}>{transcript}</div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "48px 20px", textAlign: "center" }}>
                <div style={{ color: T.muted2 }}><FileTextIcon size={32} /></div>
                <p style={{ fontSize: 15, color: T.muted, fontWeight: 500, margin: 0 }}>No note generated yet</p>
                <p style={{ fontSize: 13, color: T.muted2, margin: 0 }}>Record a session first.</p>
                <button onClick={() => setActiveTab("record")} style={{ marginTop: 8, padding: "10px 16px", fontSize: 14, fontWeight: 600, fontFamily: T.fontBody, borderRadius: 10, border: `1px solid ${T.primarySubtleBorder}`, background: T.primarySubtle, color: T.primary, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <MicIcon size={14} /> Go to Record
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═══ HISTORY TAB ═══ */}
        {activeTab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, animation: "saip-fade-in 0.15s ease" }}>

            {encounters.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "48px 20px", textAlign: "center" }}>
                <div style={{ color: T.muted2 }}><HistoryIcon size={32} /></div>
                <p style={{ fontSize: 14, color: T.muted, margin: 0 }}>No encounters yet</p>
                <p style={{ fontSize: 12, color: T.muted2, margin: 0 }}>Completed recordings will appear here.</p>
              </div>
            ) : encounters.map((enc) => {
              const STATUS_CONFIG: Record<string, { label: string; bg: string; border: string; color: string }> = {
                pending: { label: 'Pending', bg: T.warningBg, border: T.warningBorder, color: T.warning },
                transcribed: { label: 'Transcribed', bg: T.primarySubtle, border: T.primarySubtleBorder, color: T.primary },
                generated: { label: 'Note Ready', bg: '#f0fdfa', border: '#99f6e4', color: T.accent },
                autofilled: { label: 'Autofilled', bg: T.successBg, border: T.successBorder, color: T.success },
              };
              const sc = STATUS_CONFIG[enc.status] ?? STATUS_CONFIG.pending;
              return (
                <div key={enc.id} onClick={() => {
                  setTranscript(enc.transcript || "");
                  setGeneratedNote(enc.generatedNote);
                  if (enc.generatedNote) setEditedNoteContent(enc.generatedNote.raw);
                  setNotesByLanguage({}); setSelectedLanguage("en");
                  setIsEditingNote(false);
                  setActiveTab("note");
                  // Fetch the full encounter for per-language note variants (the list omits them),
                  // so the language dropdown appears for multilingual encounters.
                  void fetch(getApiUrl(`/ext-encounters/${enc.id}`), { headers: { Authorization: `Bearer ${token}` } })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((d) => {
                      if (!d) return;
                      const map: Record<string, string> = d.notesByLanguage ?? {};
                      const primary = map["en"] ? "en" : Object.keys(map)[0];
                      if (primary && map[primary]) {
                        setNotesByLanguage(map);
                        setSelectedLanguage(primary);
                        setGeneratedNote({ raw: map[primary] });
                        setEditedNoteContent(map[primary]);
                      }
                    })
                    .catch(() => {});
                }}
                  style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 10,
                    padding: "12px 14px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    boxShadow: T.shadowSm,
                    cursor: "pointer"
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: T.fg }}>
                      {enc.clientName || 'Session'}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, marginLeft: 8 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          padding: '2px 8px',
                          borderRadius: 9999,
                          background: sc.bg,
                          color: sc.color,
                          border: `1px solid ${sc.border}`,
                        }}
                      >
                        {sc.label}
                      </span>
                      <button
                        type="button"
                        aria-label="Delete encounter"
                        title="Delete encounter"
                        onClick={(e) => void handleDeleteEncounter(enc.id, e)}
                        style={{ width: 28, height: 28, display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "transparent", color: T.muted2, cursor: "pointer", borderRadius: 6 }}
                      >
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: T.muted2, marginBottom: 2 }}>
                    {new Date(enc.date).toLocaleString()}
                  </div>
                  {enc.transcript && (
                    <div
                      style={{
                        fontSize: 13,
                        color: T.muted,
                        lineHeight: 1.4,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {enc.transcript}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ PATIENT TAB ═══ */}
        {activeTab === "patient" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "saip-fade-in 0.15s ease" }}>
            {!selectedPatient ? (
              /* Empty state — matches extension image exactly */
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: "56px 20px", textAlign: "center" }}>
                <div style={{ color: T.muted2 }}><PersonIcon size={40} /></div>
                <p style={{ fontSize: 16, color: T.fg, fontWeight: 600, margin: 0 }}>No patient selected</p>
                <p style={{ fontSize: 13, color: T.muted2, margin: 0, maxWidth: 260 }}>
                  Use the patient picker in the Record tab to select or create a patient.
                </p>
                <button onClick={() => setActiveTab("record")}
                  style={{ marginTop: 8, padding: "12px 24px", fontSize: 14, fontWeight: 600, fontFamily: T.fontBody, borderRadius: 12, border: "none", background: T.primary, color: T.primaryFg, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 2px 8px rgba(59,39,106,0.28)" }}>
                  <PersonIcon size={15} /> Select Patient
                </button>
              </div>
            ) : (
              <>
                {/* Patient header card */}
                <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 14, boxShadow: T.shadowSm }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: 15, margin: 0, color: T.fg }}>{selectedPatient.name}</p>
                      {selectedPatient.dob && <p style={{ fontSize: 12, color: T.muted, margin: "3px 0 0" }}>DOB: {selectedPatient.dob}</p>}
                    </div>
                    <button type="button" onClick={() => handleSelectPatient(null)} aria-label="Clear patient"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", color: T.muted, cursor: "pointer", fontSize: 13 }}>✕</button>
                  </div>
                </div>

                {/* Longitudinal Profile */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: T.muted, margin: 0 }}>Longitudinal Profile</p>
                  {profileLoading ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.muted, fontSize: 13 }}><Spinner size={14} /> Loading…</div>
                  ) : patientProfile.length === 0 ? (
                    <div style={{ padding: "24px 16px", textAlign: "center", background: T.surface, borderRadius: 10, border: `1px solid ${T.border}` }}>
                      <p style={{ fontSize: 13, color: T.muted, margin: "0 0 4px" }}>No profile data yet.</p>
                      <p style={{ fontSize: 12, color: T.muted2, margin: 0 }}>Generate a clinical note for an encounter linked to this patient.</p>
                    </div>
                  ) : patientProfile.map((field) => (
                    <div key={field.id} style={{ background: T.surface, borderRadius: 8, border: `1px solid ${T.border}`, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: T.muted, margin: 0 }}>
                          {field.fieldKey.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                        </p>
                        <p style={{ fontSize: 13, margin: "3px 0 0", wordBreak: "break-word", color: T.fg }}>{field.value}</p>
                      </div>
                      {field.provenance === "confirmed" ? (
                        <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: T.success, background: T.successBg, border: `1px solid ${T.successBorder}`, borderRadius: 9999, padding: "2px 8px" }}>
                          ✓ Confirmed
                        </span>
                      ) : (
                        <button type="button" onClick={() => void handleConfirmField(field.fieldKey)} disabled={confirmingField === field.fieldKey}
                          style={{ flexShrink: 0, minWidth: 44, minHeight: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 11, fontWeight: 600, color: T.warning, background: T.warningBg, border: `1px solid ${T.warningBorder}`, borderRadius: 6, cursor: "pointer", padding: "2px 10px" }}>
                          {confirmingField === field.fieldKey ? <Spinner size={10} color={T.warning} /> : "?"} {confirmingField === field.fieldKey ? "" : "Confirm"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <div style={{ height: "env(safe-area-inset-bottom)", background: T.surface, flexShrink: 0 }} />
    </div>
  );
}
