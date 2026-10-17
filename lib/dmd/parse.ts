/**
 * Be Care Compliant: reading the NHS dm+d XML (Rota and Visits Stage 6, decision 1). Pure and
 * importless, so node --test runs it. The weekly TRUD release holds, among others:
 *   f_lookup2_*.xml  code lists, including <FORM> and <ROUTE> (<INFO><CD/><DESC/></INFO>)
 *   f_vmp2_*.xml     virtual medicinal products: <VMPS><VMP><VPID/><NM/><INVALID/>...</VMP></VMPS>,
 *                    with <DRUG_FORM><DFORM><VPID/><FORMCD/></DFORM> and
 *                    <DRUG_ROUTE><DROUTE><VPID/><ROUTECD/></DROUTE>
 * (NHSBSA, Technical Specification of Data Files). Only what the MAR needs is kept: the name, the
 * form and the routes, and whether the product is no longer valid.
 */

export type DmdProduct = { id: string; name: string; form: string | null; routes: string[]; invalid: boolean };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? "";
  });
}

function section(xml: string, tag: string): string {
  const open = xml.indexOf(`<${tag}>`);
  if (open < 0) return "";
  const close = xml.indexOf(`</${tag}>`, open);
  return close < 0 ? "" : xml.slice(open + tag.length + 2, close);
}

function field(block: string, tag: string): string | null {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
  return m ? decodeXml(m[1].trim()) : null;
}

function* blocks(xml: string, tag: string): Generator<string> {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) yield m[1];
}

/** The form and route code lists from the lookup file. */
export function parseLookup(xml: string): { forms: Map<string, string>; routes: Map<string, string> } {
  const read = (tag: string) => {
    const out = new Map<string, string>();
    for (const b of blocks(section(xml, tag), "INFO")) {
      const cd = field(b, "CD");
      const desc = field(b, "DESC");
      if (cd && desc) out.set(cd, desc);
    }
    return out;
  };
  return { forms: read("FORM"), routes: read("ROUTE") };
}

/** The virtual medicinal products, each with its form and routes in words. */
export function parseVmps(xml: string, lookup: { forms: Map<string, string>; routes: Map<string, string> }): DmdProduct[] {
  const formOf = new Map<string, string>();
  for (const b of blocks(section(xml, "DRUG_FORM"), "DFORM")) {
    const id = field(b, "VPID");
    const cd = field(b, "FORMCD");
    if (id && cd && !formOf.has(id)) formOf.set(id, lookup.forms.get(cd) ?? cd);
  }
  const routesOf = new Map<string, string[]>();
  for (const b of blocks(section(xml, "DRUG_ROUTE"), "DROUTE")) {
    const id = field(b, "VPID");
    const cd = field(b, "ROUTECD");
    if (!id || !cd) continue;
    const list = routesOf.get(id) ?? [];
    const word = lookup.routes.get(cd) ?? cd;
    if (!list.includes(word)) list.push(word);
    routesOf.set(id, list);
  }
  const out: DmdProduct[] = [];
  for (const b of blocks(section(xml, "VMPS"), "VMP")) {
    const id = field(b, "VPID");
    const name = field(b, "NM");
    if (!id || !name) continue;
    out.push({ id, name, form: formOf.get(id) ?? null, routes: routesOf.get(id) ?? [], invalid: field(b, "INVALID") === "1" });
  }
  return out;
}
