"use client";

import { useState } from "react";
import Link from "next/link";
import { Patient } from "@/services/web-api/patients";
import { usePatients } from "@/services/state/patients-context";

export function PatientList() {
  const { patients, loading, error, search } = usePatients();
  const [query, setQuery] = useState("");

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    void search(e.target.value);
  };

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={query}
        onChange={handleSearch}
        placeholder="Search patients by name or Credible ID…"
        aria-label="Search patients"
        className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />

      {error && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error} — make sure you are logged in to the SAIP backend.
        </div>
      )}

      {loading && (
        <div className="py-8 text-center text-sm text-gray-400">Loading patients…</div>
      )}

      {!loading && patients.length === 0 && (
        <div className="py-10 text-center">
          <p className="text-sm font-medium text-gray-500">No patients found</p>
          <p className="mt-1 text-xs text-gray-400">
            {query ? "Try a different search term." : "Start a recording linked to a patient to create their profile."}
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {patients.map((p) => (
          <PatientCard key={p.id} patient={p} />
        ))}
      </ul>
    </div>
  );
}

function PatientCard({ patient }: { patient: Patient }) {
  return (
    <li>
      <Link
        href={`/patients/${patient.id}`}
        className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-300"
      >
        <div>
          <p className="text-sm font-semibold text-gray-800">{patient.name}</p>
          <p className="mt-0.5 text-xs text-gray-400">
            {patient.dob ? `DOB: ${patient.dob}` : "No DOB"}
            {patient.credibleClientId ? ` · ID: ${patient.credibleClientId}` : ""}
          </p>
        </div>
        <span className="text-xs text-gray-300">›</span>
      </Link>
    </li>
  );
}
