"use client";

import { useCallback, useEffect, useState } from "react";
import { PatientProfile, ProfileField, patientsApi } from "@/services/web-api/patients";
import { ProvenanceChip } from "./provenance-chip";

function toLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
}

export function PatientProfileView({ patientId }: { patientId: string }) {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await patientsApi.getProfile(patientId);
      setProfile(p);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => { void load(); }, [load]);

  const handleConfirm = useCallback(async (fieldKey: string) => {
    setConfirming(fieldKey);
    try {
      const updated = await patientsApi.confirmField(patientId, fieldKey);
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              fields: prev.fields.map((f) =>
                f.fieldKey === fieldKey ? { ...f, provenance: updated.provenance, confirmedBy: updated.confirmedBy } : f,
              ),
            }
          : prev,
      );
    } catch (e) {
      alert(`Could not confirm field: ${e}`);
    } finally {
      setConfirming(null);
    }
  }, [patientId]);

  if (loading) return <div className="py-8 text-center text-sm text-gray-400">Loading profile…</div>;
  if (error) return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  if (!profile || profile.fields.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-medium text-gray-500">No profile data yet</p>
        <p className="mt-1 text-xs text-gray-400">Generate a clinical note for an encounter linked to this patient.</p>
      </div>
    );
  }

  // Group: confirmed first, then suggested
  const sorted = [...profile.fields].sort((a, b) => {
    if (a.provenance === b.provenance) return a.fieldKey.localeCompare(b.fieldKey);
    return a.provenance === 'confirmed' ? -1 : 1;
  });

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((field) => (
        <ProfileFieldRow
          key={field.id}
          field={field}
          onConfirm={() => void handleConfirm(field.fieldKey)}
          confirming={confirming === field.fieldKey}
        />
      ))}
    </div>
  );
}

function ProfileFieldRow({
  field,
  onConfirm,
  confirming,
}: {
  field: ProfileField;
  onConfirm: () => void;
  confirming: boolean;
}) {
  const [showHistory, setShowHistory] = useState(false);

  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {toLabel(field.fieldKey)}
          </span>
          <span className="text-sm text-gray-800 break-words">{field.value}</span>
        </div>
        <ProvenanceChip
          provenance={field.provenance}
          onConfirm={field.provenance === 'suggested' ? onConfirm : undefined}
          confirming={confirming}
        />
      </div>

      {field.history.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs text-blue-500 hover:underline focus:outline-none focus:ring-1 focus:ring-blue-400 rounded"
          >
            {showHistory ? "Hide" : "Show"} history ({field.history.length})
          </button>
          {showHistory && (
            <ol className="mt-2 flex flex-col gap-1 border-l-2 border-gray-100 pl-3">
              {field.history.map((h) => (
                <li key={h.id} className="text-xs text-gray-400">
                  <span className="font-mono">{new Date(h.updated).toLocaleDateString()}</span>
                  {" — "}
                  <span className="text-gray-600">{h.value}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
