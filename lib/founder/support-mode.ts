/* Support mode (manage as company) wording, kept in lib so pages and actions share it. */

/** Audit S4 (Phil, 4 Oct 2026): support mode can fix records, settings and forms, but Evidence
 *  is only ever signed by somebody at the company. */
export const SUPPORT_MODE_EVIDENCE_REFUSAL =
  "Support mode does not file Evidence. Evidence is signed by somebody at the company, so ask them to complete it, or exit support mode.";

/** Review, 9 Oct 2026: support mode does not choose where a company's documents are copied to.
 *  Connecting a drive or pointing it somewhere sends their records out of Be Care Compliant, so
 *  that is for an Admin at the company. Stopping copies (Disconnect) is still allowed. */
export const SUPPORT_MODE_CLOUD_REFUSAL =
  "Support mode does not connect a company's cloud drive or choose where it copies to. Ask an Admin at the company, or exit support mode.";
