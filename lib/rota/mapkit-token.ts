import { createPrivateKey, sign } from "node:crypto";

/**
 * Be Care Compliant: the Apple Maps (MapKit JS) map pass (Rota and Visits Stage 3, Phil
 * 2026-10-16). A JSON Web Token signed ES256 with the private key from Phil's Maps ID: header
 * { alg, kid, typ }, claims { iss: team id, iat, exp, origin } (developer.apple.com, MapKit JS).
 * Short lived and limited to our web addresses, so a copied pass is useless elsewhere and soon
 * expires. Node's own crypto only; no library. lib/rota/mapkit-token.test.ts checks it.
 */
export const MAPKIT_ORIGIN = "https://becarecompliant.com,https://www.becarecompliant.com";
export const MAPKIT_TOKEN_SECONDS = 60 * 60;

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function mapkitToken(opts: { teamId: string; keyId: string; privateKeyPem: string; nowSeconds: number; origin?: string }): string {
  const header = { alg: "ES256", kid: opts.keyId, typ: "JWT" };
  const claims = {
    iss: opts.teamId,
    iat: opts.nowSeconds,
    exp: opts.nowSeconds + MAPKIT_TOKEN_SECONDS,
    origin: opts.origin ?? MAPKIT_ORIGIN,
  };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  // A key pasted into Vercel may have its line breaks written as "\n": put them back.
  const key = createPrivateKey(opts.privateKeyPem.includes("\\n") ? opts.privateKeyPem.replace(/\\n/g, "\n") : opts.privateKeyPem);
  // JWS ES256 wants the raw 64 byte r||s signature, not DER.
  const sig = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64url(sig)}`;
}
