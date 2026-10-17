import "server-only";
import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { createServiceClient } from "@/lib/supabase/admin";
import { parseLookup, parseVmps } from "@/lib/dmd/parse";

/**
 * Be Care Compliant: loading the NHS dm+d into our own copy (Rota and Visits Stage 6, decision 1).
 *
 * TRUD's API (isd.digital.nhs.uk/trud, "Using the API", checked 2026-10-17): GET
 *   /trud/api/v1/keys/{key}/items/24/releases?latest
 * lists the newest release with its archiveFileUrl and archiveFileSha256; the zip is downloaded
 * from that URL and checked against the checksum. Number 24 on TRUD is NHSBSA dm+d (Open Government Licence
 * for TRUD). The key lives only in the TRUD_API_KEY environment variable and never leaves the server.
 *
 * Idempotent: a release already loaded is skipped; products are upserted by their dm+d id, and any
 * product missing from the new release is marked invalid (never deleted, so a MAR that names it
 * keeps its link).
 */

const TRUD_DMD = 24;
const API = "https://isd.digital.nhs.uk/trud/api/v1/keys";

export type DmdLoadResult = { ok: true; release: string; products: number; skipped?: boolean } | { ok: false; error: string };

type Release = { id: string; name: string; releaseDate: string; archiveFileUrl: string; archiveFileName: string; archiveFileSha256?: string };

/** The zip's files, opening any zip inside it, keeping only the dm+d files we read. */
function wantedFiles(zip: Uint8Array, depth = 0): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const files = unzipSync(zip, { filter: (f) => /f_(vmp|lookup)2_[^/]*\.xml$/i.test(f.name) || (depth === 0 && /\.zip$/i.test(f.name)) });
  for (const [name, data] of Object.entries(files)) {
    if (/\.zip$/i.test(name)) Object.assign(out, wantedFiles(data, depth + 1));
    else out[name] = data;
  }
  return out;
}

export async function loadDmd(opts: { force?: boolean; by?: string | null } = {}): Promise<DmdLoadResult> {
  const key = process.env.TRUD_API_KEY;
  if (!key) return { ok: false, error: "The NHS medicines list cannot be fetched: TRUD_API_KEY is not set in Vercel." };
  const db = createServiceClient();
  let release = "";
  try {
    const listRes = await fetch(`${API}/${encodeURIComponent(key)}/items/${TRUD_DMD}/releases?latest`, { cache: "no-store" });
    const list = (await listRes.json().catch(() => null)) as { releases?: Release[]; message?: string; httpStatus?: number } | null;
    const latest = list?.releases?.[0];
    if (!latest) {
      return { ok: false, error: `TRUD gave no release (${list?.message ?? listRes.status}). Check the key and that the account is subscribed to NHSBSA dm+d.` };
    }
    release = latest.name.replace(/^Release\s+/i, "") || latest.id;

    if (!opts.force) {
      const { data: done } = await db.from("dmd_releases").select("release").eq("release", release).eq("status", "loaded").maybeSingle();
      if (done) {
        const { count } = await db.from("dmd_products").select("id", { count: "exact", head: true }).eq("release", release);
        return { ok: true, release, products: count ?? 0, skipped: true };
      }
    }

    const zipRes = await fetch(latest.archiveFileUrl, { cache: "no-store" });
    if (!zipRes.ok) throw new Error(`The release file could not be downloaded (HTTP ${zipRes.status}).`);
    const zip = new Uint8Array(await zipRes.arrayBuffer());
    if (latest.archiveFileSha256) {
      const got = createHash("sha256").update(zip).digest("hex").toUpperCase();
      if (got !== latest.archiveFileSha256.toUpperCase()) throw new Error("The release file did not match TRUD's checksum, so it was not loaded.");
    }
    const files = wantedFiles(zip);
    const lookupName = Object.keys(files).find((n) => /f_lookup2_/i.test(n));
    const vmpName = Object.keys(files).find((n) => /f_vmp2_/i.test(n));
    if (!lookupName || !vmpName) throw new Error("The release file did not hold the dm+d product and lookup files.");
    const dec = new TextDecoder("utf-8");
    const products = parseVmps(dec.decode(files[vmpName]), parseLookup(dec.decode(files[lookupName])));
    if (products.length < 1000) throw new Error(`Only ${products.length} products were read, so the list was not replaced.`);

    const now = new Date().toISOString();
    for (let i = 0; i < products.length; i += 1000) {
      const rows = products.slice(i, i + 1000).map((p) => ({ id: p.id, name: p.name, form: p.form, routes: p.routes, invalid: p.invalid, release, updated_at: now }));
      const { error } = await db.from("dmd_products").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Saving the list failed: ${error.message}`);
    }
    // Anything not in this release is no longer on the NHS list: kept, marked invalid.
    const { error: oldErr } = await db.from("dmd_products").update({ invalid: true }).neq("release", release).eq("invalid", false);
    if (oldErr) throw new Error(`Marking old products failed: ${oldErr.message}`);

    await db.from("dmd_releases").upsert({ release, status: "loaded", products: products.length, error: null, loaded_at: now, loaded_by: opts.by ?? null }, { onConflict: "release" });
    return { ok: true, release, products: products.length };
  } catch (e) {
    const message = (e as Error).message || "The NHS medicines list could not be loaded.";
    if (release) {
      await db.from("dmd_releases").upsert({ release, status: "failed", products: null, error: message.slice(0, 500), loaded_at: new Date().toISOString(), loaded_by: opts.by ?? null }, { onConflict: "release" });
    }
    return { ok: false, error: message };
  }
}
