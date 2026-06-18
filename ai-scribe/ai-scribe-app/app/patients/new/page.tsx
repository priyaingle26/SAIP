import Link from "next/link";
import { PatientsProvider } from "@/services/state/patients-context";
import { PatientCreateForm } from "@/features/patient-management/patient-create-form";

export default function NewPatientPage() {
  return (
    <PatientsProvider>
      <div className="mx-auto max-w-lg px-4 py-8">
        <Link href="/patients" className="mb-6 inline-flex items-center gap-1 text-sm text-blue-500 hover:underline">
          ‹ Back to Patients
        </Link>
        <h1 className="mb-6 text-xl font-bold text-gray-900">New Patient</h1>
        <PatientCreateForm />
      </div>
    </PatientsProvider>
  );
}
