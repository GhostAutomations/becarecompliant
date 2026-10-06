/**
 * Be Care Compliant: what the policy AI is told (Phil, 2026-10-06). Pure and importless so the
 * rules can be read and tested without a network.
 *
 * THE AI WRITES ONLY FROM THE LIBRARY. Every source is numbered [S1], [S2] ... and the AI cites
 * them; it is told not to invent law, regulation numbers, names or phone numbers, and to leave a
 * clearly marked gap for anything the company has to fill in. That is what makes a draft
 * something a registered manager can check, rather than something they have to trust.
 */

export type PromptSource = { n: number; publisher: string; title: string; url: string; checkedOn: string; text: string };
export type CompanyFacts = {
  name: string;
  regulator: "ciw" | "cqc" | null;
  branches: string[];
  services: string;
};

/** Characters of source text the AI reads in total, shared between the sources. */
export const SOURCE_BUDGET = 90_000;

export function nationOf(regulator: string | null): { label: string; regions: string[] } {
  if (regulator === "ciw") return { label: "Wales (regulated by Care Inspectorate Wales)", regions: ["wales"] };
  if (regulator === "cqc") return { label: "England (regulated by the Care Quality Commission)", regions: ["england"] };
  return { label: "Wales or England (regulator not recorded)", regions: ["wales", "england"] };
}

export function sourceBlocks(sources: PromptSource[]): string {
  const each = Math.floor(SOURCE_BUDGET / Math.max(1, sources.length));
  return sources
    .map(
      (s) =>
        `[S${s.n}] ${s.title}\nPublisher: ${s.publisher}\nLink: ${s.url}\nChecked: ${s.checkedOn}\n---\n${s.text.slice(0, each)}\n---`,
    )
    .join("\n\n");
}

const RULES = `Rules you must follow:
- Write ONLY from the numbered official sources and the provider's own answers. Never invent law, regulation numbers, guidance titles, names, phone numbers or timescales that are not in them.
- Cite the source for every legal or regulatory requirement in square brackets, for example [S2]. Only cite numbers you were given.
- Where the provider must add a detail you do not have, write [To be completed: what is needed].
- UK English, plain words a care worker understands, short sentences.
- Never use dashes or hyphens as punctuation. Use commas, colons and full stops.
- Format: a line starting "# " is a heading, a line starting "- " is a bullet, numbered clauses such as "3.1 " are fine, **bold** only for a few key words. No tables, no HTML, no code fences.`;

export function writeSystemPrompt(nation: string): string {
  return `You are an expert UK social care compliance writer. You draft policies for domiciliary (home) care providers that an inspector would accept. The provider is in ${nation}: use that nation's law, regulator, workforce regulator and terminology, and leave out the other nation's. England and Wales have different legislation, regulators and terms (for example Wales: Care Inspectorate Wales, Social Care Wales, personal plan, responsible individual, the Social Services and Well-being (Wales) Act 2014, the Public Services Ombudsman for Wales; England: the Care Quality Commission, care plan, registered manager, the Care Act 2014, the Local Government and Social Care Ombudsman). Never mix them.

${RULES}

Structure the policy with these headings, in this order, adding procedure headings where the topic needs them: Purpose, Scope, Legal and regulatory framework, Roles and responsibilities, the procedure sections, Training, Recording and monitoring, Review. The Review section says the policy is reviewed at least every 12 months and whenever the law or guidance changes. Do not add a list of sources at the end: it is added for you.`;
}

export function writePrompt(opts: {
  topicTitle: string;
  topicSummary: string;
  facts: CompanyFacts;
  answers: Array<{ question: string; answer: string }>;
  notes: string;
  sources: PromptSource[];
}): string {
  const answered = opts.answers.filter((a) => a.answer.trim());
  return `Write the "${opts.topicTitle}" policy for ${opts.facts.name}.

What this policy must achieve: ${opts.topicSummary}

About the provider:
- Name: ${opts.facts.name}
- Branches: ${opts.facts.branches.join(", ") || "Not recorded"}
- Services: ${opts.facts.services}
${answered.length ? `\nThe provider's own arrangements:\n${answered.map((a) => `- ${a.question} ${a.answer}`).join("\n")}` : ""}
${opts.notes.trim() ? `\nAnything else the provider wants included: ${opts.notes.trim()}` : ""}

Official sources:

${sourceBlocks(opts.sources)}`;
}

export function improveSystemPrompt(nation: string): string {
  return `You are an expert UK social care compliance reviewer. You check a domiciliary (home) care provider's existing policy against current official guidance and improve it. The provider is in ${nation}. England and Wales have different legislation, regulators and terms: anything in the policy that belongs to the other nation (for example CQC in a Welsh policy, or CIW in an English one) is a high severity gap to fix.

${RULES}

Reply with JSON only, no other text, in exactly this shape:
{"summary":"two or three sentences on how the policy stands","gaps":[{"issue":"what is missing, wrong or out of date","severity":"high"|"medium"|"low","source":"S2"}],"sections":[{"heading":"section heading","original":"the provider's current wording for this section, or an empty string if the section is new","proposed":"your full improved wording for this section, in the format above, without the heading line","reason":"why it changed, or 'No change needed'"}]}

The sections, in order, must cover the WHOLE policy, so that joining every chosen section gives a complete policy. Keep the provider's own details (names, timescales, arrangements) unless a source says they are wrong. Mark a section "No change needed" and repeat its wording when it is already right.`;
}

export function improvePrompt(opts: { topicTitle: string; facts: CompanyFacts; policyText: string | null; sources: PromptSource[] }): string {
  return `Review ${opts.facts.name}'s "${opts.topicTitle}" policy.
Branches: ${opts.facts.branches.join(", ") || "Not recorded"}. Services: ${opts.facts.services}.

${opts.policyText ? `THE PROVIDER'S CURRENT POLICY:\n${opts.policyText.slice(0, 60_000)}` : "THE PROVIDER'S CURRENT POLICY is the attached PDF."}

Official sources:

${sourceBlocks(opts.sources)}`;
}

export type ImproveReview = {
  summary: string;
  gaps: Array<{ issue: string; severity: "high" | "medium" | "low"; source: string }>;
  sections: Array<{ heading: string; original: string; proposed: string; reason: string }>;
};

/** Read the improver's JSON, forgiving code fences and stray text around it. Null when it
 *  cannot be read, so the screen says so rather than showing half a review. */
export function parseImproveReview(raw: string): ImproveReview | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(raw.slice(start, end + 1)) as Partial<ImproveReview>;
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const sections = Array.isArray(o.sections)
      ? o.sections
          .map((s) => ({ heading: str(s?.heading), original: str(s?.original), proposed: str(s?.proposed), reason: str(s?.reason) }))
          .filter((s) => s.heading && (s.proposed || s.original))
      : [];
    if (sections.length === 0) return null;
    const gaps = Array.isArray(o.gaps)
      ? o.gaps.map((g) => ({
          issue: str(g?.issue),
          severity: (["high", "medium", "low"].includes(str(g?.severity)) ? g!.severity : "medium") as "high" | "medium" | "low",
          source: str(g?.source),
        })).filter((g) => g.issue)
      : [];
    return { summary: str(o.summary), gaps, sections };
  } catch {
    return null;
  }
}

/** Join chosen sections into the policy wording, in the text format written policies use. */
export function joinSections(title: string, sections: Array<{ heading: string; text: string }>): string {
  return [`# ${title}`, ...sections.filter((s) => s.text.trim()).map((s) => `# ${s.heading}\n${s.text.trim()}`)].join("\n\n");
}

/** The Sources section added to every AI policy, so the wording and its evidence travel together. */
export function sourcesSection(sources: Array<{ n: number; title: string; publisher: string; url: string; checkedOn: string }>, text: string): string {
  const used = sources.filter((s) => text.includes(`[S${s.n}]`));
  const list = used.length ? used : sources;
  return `# Sources\n${list.map((s) => `- [S${s.n}] ${s.title}, ${s.publisher}, ${s.url} (checked ${s.checkedOn})`).join("\n")}`;
}
