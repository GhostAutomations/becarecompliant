"use client";

/** Opens the phone or computer's print dialog for the sheet. */
export default function PrintButton() {
  return (
    <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={() => window.print()}>
      Print
    </button>
  );
}
