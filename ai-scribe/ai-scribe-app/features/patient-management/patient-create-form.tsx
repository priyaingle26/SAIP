"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePatients } from "@/services/state/patients-context";

export function PatientCreateForm() {
  const { createPatient } = usePatients();
  const router = useRouter();
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [credibleId, setCredibleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const patient = await createPatient(name.trim(), dob || undefined, credibleId || undefined);
      router.push(`/patients/${patient.id}`);
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="pm-name" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Full Name <span aria-hidden="true" className="text-red-500">*</span>
        </label>
        <input
          id="pm-name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jane Doe"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pm-dob" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Date of Birth
        </label>
        <input
          id="pm-dob"
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="pm-credible-id" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Credible Client ID
        </label>
        <input
          id="pm-credible-id"
          type="text"
          value={credibleId}
          onChange={(e) => setCredibleId(e.target.value)}
          placeholder="Optional"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="mt-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
      >
        {saving ? "Creating…" : "Create Patient"}
      </button>
    </form>
  );
}
