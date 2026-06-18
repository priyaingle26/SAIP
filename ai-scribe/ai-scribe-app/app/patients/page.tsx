import Link from "next/link";
import { PatientsProvider } from "@/services/state/patients-context";
import { PatientList } from "@/features/patient-management/patient-list";

export default function PatientsPage() {
  return (
    <PatientsProvider>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Patients</h1>
            <p className="mt-1 text-sm text-gray-500">
              Longitudinal patient profiles, updated with each session.
            </p>
          </div>
          <Link
            href="/patients/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            + New Patient
          </Link>
        </div>

        <PatientList />
      </div>
    </PatientsProvider>
  );
}
