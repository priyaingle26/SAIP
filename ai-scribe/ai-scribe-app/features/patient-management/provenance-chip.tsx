"use client";

// Provenance chip — icon + text, never color-only (accessibility requirement).
// Uses ≥44px confirm button for touch-target compliance (UI/UX guideline).

interface ProvenanceChipProps {
  provenance: 'suggested' | 'confirmed';
  onConfirm?: () => void;
  confirming?: boolean;
}

export function ProvenanceChip({ provenance, onConfirm, confirming }: ProvenanceChipProps) {
  const isConfirmed = provenance === 'confirmed';

  return (
    <span className="inline-flex items-center gap-1.5">
      {isConfirmed ? (
        <span
          aria-label="Confirmed by clinician"
          className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700"
        >
          {/* Checkmark icon */}
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Confirmed
        </span>
      ) : (
        <>
          <span
            aria-label="AI suggestion — awaiting clinician review"
            className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
          >
            {/* Info icon */}
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6 5v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <circle cx="6" cy="3.5" r="0.6" fill="currentColor" />
            </svg>
            AI · review
          </span>
          {onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming}
              aria-label="Confirm this field value"
              style={{ minWidth: 44, minHeight: 44 }}
              className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
            >
              {confirming ? "…" : "Confirm"}
            </button>
          )}
        </>
      )}
    </span>
  );
}
