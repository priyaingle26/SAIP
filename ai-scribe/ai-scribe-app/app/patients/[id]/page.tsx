"use client";

import Link from "next/link";
import { use, useState } from "react";
import { PatientsProvider, usePatients } from "@/services/state/patients-context";
import { PatientProfileView } from "@/features/patient-management/patient-profile-view";
import { patientsApi, Patient } from "@/services/web-api/patients";
import { useEffect } from "react";

type Tab = 'profile' | 'encounters';

function PatientDetail({ id }: { id: string }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  useEffect(() => {
    patientsApi.get(id).then(setPatient).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="py-12 text-center text-sm text-gray-400">Loading…</div>;
  if (!patient) return <div className="py-12 text-center text-sm text-red-500">Patient not found</div>;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/patients" className="mb-4 inline-flex items-center gap-1 text-sm text-blue-500 hover:underline">
        ‹ All Patients
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">{patient.name}</h1>
        <p className="mt-1 text-xs text-gray-400">
          {patient.dob ? `DOB: ${patient.dob}` : "No DOB on file"}
          {patient.credibleClientId ? ` · Credible ID: ${patient.credibleClientId}` : ""}
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 rounded-xl border border-gray-100 bg-gray-50 p-1">
        {(['profile', 'encounters'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            aria-selected={activeTab === tab}
            className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-blue-300 ${
              activeTab === tab
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && <PatientProfileView patientId={id} />}
      {activeTab === 'encounters' && <EncounterTimeline patientId={id} />}
    </div>
  );
}

function EncounterTimeline({ patientId }: { patientId: string }) {
  const [encounters, setEncounters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    patientsApi.getEncounters(patientId)
      .then((enc) => setEncounters(enc as any[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [patientId]);

  if (loading) return <div className="py-8 text-center text-sm text-gray-400">Loading encounters…</div>;

  if (encounters.length === 0) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm font-medium text-gray-500">No encounters yet</p>
        <p className="mt-1 text-xs text-gray-400">Link a recording to this patient in the extension.</p>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {encounters.map((enc: any) => (
        <li key={enc.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800">{enc.clientName ?? "Session"}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              enc.status === 'generated' ? 'bg-green-100 text-green-700' :
              enc.status === 'transcribed' ? 'bg-blue-100 text-blue-700' :
              'bg-gray-100 text-gray-500'
            }`}>
              {enc.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-400">{new Date(enc.date).toLocaleString()}</p>
        </li>
      ))}
    </ol>
  );
}

export default function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <PatientsProvider>
      <PatientDetail id={id} />
    </PatientsProvider>
  );
}
