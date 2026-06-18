"use client";

import {
  createContext,
  ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { patientsApi, Patient, PatientProfile } from "@/services/web-api/patients";

type PatientsContextValue = {
  patients: Patient[];
  loading: boolean;
  error: string | null;
  search: (q: string) => Promise<void>;
  reload: () => Promise<void>;
  getProfile: (patientId: string) => Promise<PatientProfile>;
  confirmField: (patientId: string, fieldKey: string) => Promise<void>;
  createPatient: (name: string, dob?: string, credibleClientId?: string) => Promise<Patient>;
};

const PatientsContext = createContext<PatientsContextValue | undefined>(undefined);

export function PatientsProvider({ children }: { children: ReactNode }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await patientsApi.search('');
      setPatients(results);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const results = await patientsApi.search(q);
      setPatients(results);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const getProfile = useCallback(
    (patientId: string) => patientsApi.getProfile(patientId),
    [],
  );

  const confirmField = useCallback(async (patientId: string, fieldKey: string) => {
    await patientsApi.confirmField(patientId, fieldKey);
  }, []);

  const createPatient = useCallback(async (name: string, dob?: string, credibleClientId?: string) => {
    const patient = await patientsApi.create(name, dob, credibleClientId);
    setPatients((prev) => [patient, ...prev]);
    return patient;
  }, []);

  const value = useMemo(
    () => ({ patients, loading, error, search, reload, getProfile, confirmField, createPatient }),
    [patients, loading, error, search, reload, getProfile, confirmField, createPatient],
  );

  return <PatientsContext value={value}>{children}</PatientsContext>;
}

export function usePatients() {
  const ctx = use(PatientsContext);
  if (!ctx) throw new Error("usePatients must be used within PatientsProvider");
  return ctx;
}
