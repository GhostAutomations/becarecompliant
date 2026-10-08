import "server-only";

/**
 * Be Care Compliant — talking to Microsoft 365 (OneDrive and SharePoint) through Microsoft Graph
 * (0437, Phil 2026-10-08). The ONLY file that calls Microsoft: everything else goes through the
 * queue (lib/cloud/queue.ts) and the worker (lib/cloud/worker.ts).
 *
 * Sign in is Microsoft's own screen (OAuth 2.0 authorisation code with PKCE). We ask for:
 *   offline_access        a refresh token, so copies keep working after the Admin signs out
 *   User.Read             their name and email, to show who connected it
 *   Files.ReadWrite.All   write into their OneDrive or a document library they can reach
 *   Sites.ReadWrite.All   list SharePoint sites they can reach and write into one
 * All four are delegated: we can only ever reach what the person who connected can reach. Some
 * companies require an IT admin to approve apps first; Microsoft shows that screen itself.
 *
 * Env: MS_CLIENT_ID, MS_CLIENT_SECRET (an app registered in Microsoft Entra, multi tenant, work
 * and school accounts, redirect https://<site>/api/cloud/microsoft/callback).
 */

import { createHash, randomBytes } from "crypto";
import { siteUrl } from "@/lib/site";

const AUTHORITY = "https://login.microsoftonline.com/organizations/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0";
export const MS_SCOPES = "offline_access openid profile email User.Read Files.ReadWrite.All Sites.ReadWrite.All";

export class CloudAuthError extends Error {}
export class CloudRetryError extends Error {
  constructor(message: string, public retryAfterSeconds: number) {
    super(message);
  }
}
export class CloudNotFoundError extends Error {}

export function microsoftConfigured(): boolean {
  return Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

export function microsoftRedirectUri(): string {
  return `${siteUrl()}/api/cloud/microsoft/callback`;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newPkce(): { verifier: string; challenge: string; state: string } {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: b64url(randomBytes(24)) };
}

export function microsoftAuthorizeUrl(opts: { state: string; challenge: string }): string {
  const p = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: microsoftRedirectUri(),
    response_mode: "query",
    scope: MS_SCOPES,
    state: opts.state,
    code_challenge: opts.challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTHORITY}/authorize?${p.toString()}`;
}

export type MsTokens = { accessToken: string; refreshToken: string; expiresAt: Date };

async function tokenRequest(body: Record<string, string>): Promise<MsTokens> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID ?? "",
      client_secret: process.env.MS_CLIENT_SECRET ?? "",
      scope: MS_SCOPES,
      ...body,
    }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = String(json.error ?? res.status);
    const desc = String(json.error_description ?? "").split("\r\n")[0];
    // A refresh token that no longer works (password changed, access removed, the person left):
    // only reconnecting fixes it.
    if (err === "invalid_grant" || err === "interaction_required" || err === "unauthorized_client") {
      throw new CloudAuthError(desc || "Microsoft needs you to connect again.");
    }
    if (res.status === 429 || res.status >= 500) throw new CloudRetryError(desc || "Microsoft is busy.", 60);
    throw new Error(desc || `Microsoft refused the sign in (${err}).`);
  }
  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken: String(json.refresh_token ?? body.refresh_token ?? ""),
    expiresAt: new Date(Date.now() + Number(json.expires_in ?? 3600) * 1000),
  };
}

export function exchangeMicrosoftCode(code: string, verifier: string): Promise<MsTokens> {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: microsoftRedirectUri(),
    code_verifier: verifier,
  });
}

export function refreshMicrosoftToken(refreshToken: string): Promise<MsTokens> {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
}

/** One Graph call. Throttling and outages become CloudRetryError so the job is tried later. */
export async function graph<T = Record<string, unknown>>(
  token: string,
  path: string,
  init: RequestInit & { raw?: boolean } = {},
): Promise<T> {
  const url = path.startsWith("http") ? path : `${GRAPH}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 429 || res.status === 503 || res.status === 504) {
    const after = Number(res.headers.get("retry-after") ?? "60");
    throw new CloudRetryError(`Microsoft asked us to slow down (${res.status}).`, Number.isFinite(after) ? after : 60);
  }
  if (res.status === 401) throw new CloudAuthError("Microsoft no longer accepts the connection.");
  if (res.status === 404) throw new CloudNotFoundError("Not found in the drive.");
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    const e = new Error(friendlyGraphError(j?.error?.message) ?? `Microsoft returned ${res.status}.`) as Error & { code?: string; status?: number };
    e.code = j?.error?.code;
    e.status = res.status;
    throw e;
  }
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

export type MsSite = { id: string; name: string; webUrl: string };

export async function microsoftMe(token: string): Promise<{ name: string; email: string }> {
  const me = await graph<{ displayName?: string; mail?: string; userPrincipalName?: string }>(
    token,
    "/me?$select=displayName,mail,userPrincipalName",
  );
  return { name: me.displayName ?? "", email: me.mail ?? me.userPrincipalName ?? "" };
}

/** SharePoint sites the person can reach, for the "choose where" step. */
export async function microsoftSites(token: string, search: string): Promise<MsSite[]> {
  const q = search.trim() ? encodeURIComponent(search.trim()) : "*";
  const res = await graph<{ value?: Array<{ id: string; displayName?: string; name?: string; webUrl?: string }> }>(
    token,
    `/sites?search=${q}&$select=id,displayName,name,webUrl&$top=50`,
  );
  return (res.value ?? [])
    .filter((s) => s.id)
    .map((s) => ({ id: s.id, name: s.displayName || s.name || "Site", webUrl: s.webUrl ?? "" }));
}

export async function microsoftDriveFor(
  token: string,
  where: { kind: "onedrive" } | { kind: "sharepoint"; siteId: string },
): Promise<{ driveId: string; webUrl: string }> {
  const path = where.kind === "onedrive" ? "/me/drive" : `/sites/${encodeURIComponent(where.siteId)}/drive`;
  const d = await graph<{ id: string; webUrl?: string }>(token, `${path}?$select=id,webUrl`);
  return { driveId: d.id, webUrl: d.webUrl ?? "" };
}

type DriveItem = { id: string; name: string; webUrl?: string; folder?: unknown };

/** Make a folder, or find the one already there with that name. */
export async function ensureMsFolder(
  token: string,
  driveId: string,
  parentId: string,
  name: string,
): Promise<DriveItem> {
  const parent = parentId === "root" ? "root" : `items/${encodeURIComponent(parentId)}`;
  try {
    return await graph<DriveItem>(token, `/drives/${encodeURIComponent(driveId)}/${parent}/children`, {
      method: "POST",
      body: JSON.stringify({ name, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
    });
  } catch (e) {
    const err = e as { code?: string; status?: number };
    if (err.status === 409 || err.code === "nameAlreadyExists") {
      return graph<DriveItem>(
        token,
        `/drives/${encodeURIComponent(driveId)}/${parent}:/${encodeURIComponent(name)}?$select=id,name,webUrl,folder`,
      );
    }
    throw e;
  }
}

export async function getMsItem(token: string, driveId: string, itemId: string): Promise<DriveItem> {
  return graph<DriveItem>(token, `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?$select=id,name,webUrl,folder`);
}

export async function renameMsItem(token: string, driveId: string, itemId: string, name: string): Promise<void> {
  await graph(token, `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name, "@microsoft.graph.conflictBehavior": "rename" }),
  });
}

const SIMPLE_LIMIT = 4 * 1024 * 1024;
const CHUNK = 320 * 1024 * 16; // 5 MiB, a multiple of 320 KiB as Microsoft requires

/** Upload a file into a folder, replacing one of the same name (so a retry never duplicates). */
export async function uploadMsFile(
  token: string,
  driveId: string,
  parentId: string,
  fileName: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<DriveItem> {
  const target = `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}:/${encodeURIComponent(fileName)}:`;
  if (bytes.byteLength <= SIMPLE_LIMIT) {
    return graph<DriveItem>(token, `${target}/content?@microsoft.graph.conflictBehavior=replace`, {
      method: "PUT",
      body: Buffer.from(bytes),
      headers: { "Content-Type": contentType || "application/octet-stream" },
    });
  }
  const session = await graph<{ uploadUrl: string }>(token, `${target}/createUploadSession`, {
    method: "POST",
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
  });
  let last: DriveItem | null = null;
  for (let start = 0; start < bytes.byteLength; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.byteLength);
    // The upload URL is pre authorised: it must NOT carry our bearer token.
    const res = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(end - start),
        "Content-Range": `bytes ${start}-${end - 1}/${bytes.byteLength}`,
      },
      body: Buffer.from(bytes.slice(start, end)),
    });
    if (res.status === 429 || res.status >= 500) throw new CloudRetryError("Microsoft was busy during the upload.", 60);
    if (!res.ok && res.status !== 202) throw new Error(`The upload stopped (${res.status}).`);
    if (res.status === 200 || res.status === 201) last = (await res.json()) as DriveItem;
  }
  if (!last) throw new Error("The upload did not finish.");
  return last;
}

/** Microsoft's own wording for the problems an Admin can actually fix, put in plain English. */
function friendlyGraphError(message: string | undefined): string | undefined {
  if (!message) return message;
  if (/SPO license/i.test(message) || /does not have a SharePoint/i.test(message)) {
    return "This Microsoft 365 account has no SharePoint or OneDrive. Its plan needs to include them (Business Basic or above does), or connect with an account from an organisation that has them.";
  }
  if (/mysite not found|user's mysite/i.test(message)) {
    return "This account's OneDrive has not been set up yet. Open OneDrive once at onedrive.com with this account, then try again.";
  }
  return message;
}
