/**
 * Be Care Compliant: postcodes, straight line miles and the carer ranking for visits (Rota and
 * Visits Stage 2, Phil 2026-10-15). Pure and importless, so node --test runs it.
 *
 * "Nearest" until road routing arrives in Stage 8 is straight line miles between postcode map
 * points (postcodes.io, ONS data). The ranking is Phil's order from the brief: compliant first,
 * then nearest, then continuity and preferences. Distance is grouped into bands first, so a carer
 * a mile further away who already knows the service user is not pushed below a stranger.
 */

const POSTCODE = /([A-Z]{1,2}[0-9][A-Z0-9]?) ?([0-9][A-Z]{2})/;

/** "sa1 1aa", "SA11AA" or "SA1  1AA" to "SA1 1AA"; null when it is not a UK postcode. */
export function normalisePostcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.toUpperCase().replace(/\s+/g, " ").trim().match(POSTCODE);
  return m ? `${m[1]} ${m[2]}` : null;
}

/** The first postcode found in free text, such as a home address. */
export function extractPostcode(text: string | null | undefined): string | null {
  return normalisePostcode(text ?? null);
}

export type Point = { lat: number; lng: number };

/** Great circle distance in miles. */
export function milesBetween(a: Point, b: Point): number {
  const R = 3958.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance bands: within 2 miles, 5, 10, further, and not known (no postcode). */
export function distanceBand(miles: number | null): number {
  if (miles == null) return 4;
  if (miles <= 2) return 0;
  if (miles <= 5) return 1;
  if (miles <= 10) return 2;
  return 3;
}

export type Rankable = {
  name: string;
  refusal: string | null;
  warnings: number;
  miles: number | null;
  preferred: boolean;
  continuity: number;
};

/**
 * Best first: those who can go before those who cannot; then no warnings (compliant) before
 * warnings; then distance band; then preferred; then continuity (more visits to this person
 * first); then exact miles; then name.
 */
export function compareCandidates(a: Rankable, b: Rankable): number {
  const can = (x: Rankable) => (x.refusal ? 1 : 0);
  if (can(a) !== can(b)) return can(a) - can(b);
  const warn = (x: Rankable) => (x.warnings > 0 ? 1 : 0);
  if (warn(a) !== warn(b)) return warn(a) - warn(b);
  if (distanceBand(a.miles) !== distanceBand(b.miles)) return distanceBand(a.miles) - distanceBand(b.miles);
  if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
  if (a.continuity !== b.continuity) return b.continuity - a.continuity;
  const am = a.miles ?? Number.POSITIVE_INFINITY;
  const bm = b.miles ?? Number.POSITIVE_INFINITY;
  if (am !== bm) return am - bm;
  return a.name.localeCompare(b.name);
}

/** "0.4 miles", "3 miles", or null. */
export function milesLabel(miles: number | null): string | null {
  if (miles == null) return null;
  if (miles < 1) return `${miles.toFixed(1)} miles`;
  return `${Math.round(miles)} mile${Math.round(miles) === 1 ? "" : "s"}`;
}
