"use server";

/**
 * Be Care Compliant — AI form import, the server half (Phil, 2 Oct 2026, popups: founder and every
 * company; a company spends 1 AI credit per import like the other AI buttons; the founder is free).
 *
 * Reads a link or an uploaded PDF, Word, Excel or picture, asks the AI to write the form out as
 * questions, and hands back a draft schema. NOTHING IS SAVED HERE: the builder shows the draft and
 * the person checks it and presses Save, the same as any other edit. So a wrong guess by the model
 * costs a look, never a published form or a piece of Evidence.
 */

import { requireCompanyAdmin, requirePlatformAdmin } from "@/lib/auth/guards";
import { runAi } from "@/lib/ai/anthropic";
import type { FormSchema } from "@/lib/form-schema";
import {
  AI_IMPORT_MAX_BYTES,
  aiImportSystem,
  docxText,
  draftToSchema,
  extractJson,
  htmlText,
  importKindOf,
  linkProblem,
  xlsxText,
} from "./ai-import";

export type AiImportResult =
  | { ok: true; schema: FormSchema; name: string | null; questions: number; notes: string[] }
  | { error: string };

/** Longest text we pass on. A form is a few thousand characters; a whole web site is not. */
const MAX_TEXT = 120_000;
const FETCH_TIMEOUT_MS = 15_000;
const MAX_PAGE_BYTES = 3 * 1024 * 1024;

type Source = { attachments: unknown[]; text: string; label: string };

async function readLink(raw: string): Promise<Source | { error: string }> {
  let url = raw.trim();
  /* Redirects are followed by hand so every hop is checked, not just the first: a public link
     must not be able to bounce the server onto an address inside a network. */
  for (let hop = 0; hop < 4; hop += 1) {
    const problem = linkProblem(url);
    if (problem) return { error: problem };
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "user-agent": "Mozilla/5.0 (BeCareCompliant form import)", accept: "text/html,application/pdf,text/plain;q=0.9,*/*;q=0.5" },
      });
    } catch {
      return { error: "That page could not be reached. Check the link opens in a private window, without signing in." };
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return { error: "That link redirects nowhere." };
      url = new URL(next, url).toString();
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      return { error: "That page needs a sign in, so it cannot be read. Download the form as a PDF and upload that instead." };
    }
    if (!res.ok) return { error: `That page answered with an error (${res.status}).` };
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_PAGE_BYTES) return { error: "That page is too large to read." };
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_PAGE_BYTES) return { error: "That page is too large to read." };
    if (type.includes("application/pdf")) {
      return {
        attachments: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } }],
        text: "",
        label: "the PDF at that link",
      };
    }
    const text = htmlText(new TextDecoder().decode(bytes));
    /* Microsoft Forms and many survey sites build their questions in the browser, so the page we
       fetch holds almost nothing. Say so, rather than letting the model invent a form. */
    if (text.replace(/\s+/g, " ").length < 120) {
      return { error: "That page did not show its questions to us (it builds them in the browser or needs a sign in). Print it to PDF or take a screenshot, and upload that instead." };
    }
    return { attachments: [], text: text.slice(0, MAX_TEXT), label: "that page" };
  }
  return { error: "That link redirects too many times." };
}

async function readFile(file: File): Promise<Source | { error: string }> {
  if (file.size === 0) return { error: "That file is empty." };
  if (file.size > AI_IMPORT_MAX_BYTES) return { error: "That file is over 3.5 MB. Upload a smaller copy, or just the pages with the questions." };
  const kind = importKindOf(file.name, file.type);
  if ("error" in kind) return kind;
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    if (kind.kind === "pdf") {
      return {
        attachments: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(bytes).toString("base64") } }],
        text: "",
        label: file.name,
      };
    }
    if (kind.kind === "image") {
      return {
        attachments: [{ type: "image", source: { type: "base64", media_type: kind.mediaType, data: Buffer.from(bytes).toString("base64") } }],
        text: "",
        label: file.name,
      };
    }
    const text = kind.kind === "docx" ? docxText(bytes) : kind.kind === "xlsx" ? xlsxText(bytes) : new TextDecoder().decode(bytes);
    if (text.trim().length < 10) return { error: "No text could be found in that file. If it is a scan, upload it as a PDF or a picture." };
    return { attachments: [], text: text.slice(0, MAX_TEXT), label: file.name };
  } catch {
    return { error: "That file could not be opened. Save it again as PDF and upload that." };
  }
}

/**
 * formData: kind ("template" | "company"), population, link OR file, and existing_keys (the keys
 * already in the form, so a draft added after them never repeats one).
 */
export async function aiImportForm(formData: FormData): Promise<AiImportResult> {
  const kind = String(formData.get("kind") ?? "");
  let companyId: string | null = null;
  if (kind === "template") {
    await requirePlatformAdmin();
  } else {
    const { profile } = await requireCompanyAdmin();
    if (!profile.company_id) return { error: "No company context." };
    companyId = profile.company_id;
  }

  const population = String(formData.get("population") ?? "");
  const link = String(formData.get("link") ?? "").trim();
  const file = formData.get("file");
  const existingKeys = String(formData.get("existing_keys") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  let source: Source | { error: string };
  if (file instanceof File && file.size > 0) source = await readFile(file);
  else if (link) source = await readLink(link);
  else return { error: "Paste a link, or choose a file to upload." };
  if ("error" in source) return source;

  const prompt = source.text
    ? `Here is the form, taken from ${source.label}:\n\n${source.text}\n\nWrite it out as the JSON described.`
    : `The attached ${source.label === "the PDF at that link" ? "PDF" : "file"} is the form. Write it out as the JSON described.`;

  const res = await runAi({
    companyId,
    feature: "form_import",
    system: aiImportSystem(population),
    prompt,
    attachments: source.attachments,
    maxTokens: 6000,
  });
  if ("error" in res) return res;

  let draft;
  try {
    draft = draftToSchema(extractJson(res.ok), existingKeys);
  } catch {
    return { error: "The AI's answer could not be read as a form. Try again, or try a clearer copy of the form." };
  }
  if (draft.questions === 0) {
    return { error: "No questions were found in that. Check it is the form itself, not a cover page." };
  }
  return { ok: true, schema: draft.schema, name: draft.name, questions: draft.questions, notes: draft.notes };
}
