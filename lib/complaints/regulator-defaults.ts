/**
 * Be Care Compliant — complaint timescales by REGULATOR.
 *
 * Phil, 2026-09-05: "complaints deadlines defaults should be set as per the regulator
 * for england or wales, as Thistle is in wales it should be set per CIW."
 *
 * A company already carries its regulator (companies.regulator: 'ciw' or 'cqc'), so the
 * deadlines it starts on come from that rather than from one number that suits neither
 * nation.
 *
 * WALES (CIW). The Social Services Complaints Procedure (Wales) Regulations 2014 and the
 * Welsh Government guidance that goes with them: acknowledge no later than 2 WORKING
 * days after receipt; local resolution within 10 working days of the acknowledgement;
 * formal investigation response within 25 working days. The provider regulations
 * themselves (Regulated Services (Service Providers and Responsible Individuals) (Wales)
 * Regulations 2017, reg 64) require arrangements for investigating and responding but
 * set no day count, so the 2014 timescales are the Welsh benchmark a CIW provider is
 * measured against. Acknowledge 2, respond 25.
 *
 * ENGLAND (CQC). Regulation 16 requires complaints to be investigated and proportionate
 * action taken, but sets NO statutory day count for an adult social care provider. The
 * widely used benchmark is 3 working days to acknowledge (the figure in the NHS
 * complaints regulations) and 25 working days to respond, which is what the product has
 * always shown. Acknowledge 3, respond 25.
 *
 * Both are WORKING days. Bank holidays are not counted by the app, which is why an
 * individual complaint's deadline stays editable.
 *
 * These are starting points a company can change in Settings, not a rule the product
 * enforces. Pure and self-contained (no runtime imports) so it can be unit tested.
 */

export type Regulator = "ciw" | "cqc";

export type ComplaintTimescales = {
  acknowledgement_days: number;
  response_days: number;
  amber_days: number;
  count_working_days: boolean;
};

const CIW: ComplaintTimescales = {
  acknowledgement_days: 2,
  response_days: 25,
  amber_days: 5,
  count_working_days: true,
};

const CQC: ComplaintTimescales = {
  acknowledgement_days: 3,
  response_days: 25,
  amber_days: 5,
  count_working_days: true,
};

export function isRegulator(v: unknown): v is Regulator {
  return v === "ciw" || v === "cqc";
}

/**
 * The timescales a company starts on. An unset regulator gets the England figures: they
 * are the more generous acknowledgement, so a company that has not told us where it
 * works is never shown a deadline sooner than the one it is actually held to.
 */
export function defaultComplaintTimescales(regulator: unknown): ComplaintTimescales {
  return regulator === "ciw" ? { ...CIW } : { ...CQC };
}

/** What to say on screen about where the numbers came from. */
export function timescaleSource(regulator: unknown): string {
  return regulator === "ciw"
    ? "Starting figures for Wales, from the Social Services Complaints Procedure (Wales) Regulations 2014: acknowledge within 2 working days, respond within 25. Care Inspectorate Wales expects arrangements for investigating and responding, so these day counts are the Welsh benchmark and not a fixed rule."
    : "Starting figures for England: acknowledge within 3 working days, respond within 25. CQC Regulation 16 requires complaints to be investigated and proportionate action taken but sets no day count, so these are the common benchmark and not a fixed rule.";
}
