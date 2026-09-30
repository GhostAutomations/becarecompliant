import Link from "next/link";
import { getSessionUser } from "@/lib/auth/guards";
import SiteHeader from "@/components/marketing/site-header";
import SiteFooter from "@/components/marketing/site-footer";
import LegalDocumentView from "@/components/legal/legal-document-view";
import { legalDocuments, legalMissing, legalPublished } from "@/lib/legal/documents";

/**
 * The public page for one contract document (/terms, /dpa). Mirrors /privacy: the marketing
 * header and footer, one readable column.
 *
 * WHILE THE SUPPLIER DETAILS ARE MISSING it says plainly that this is a draft, so nobody reads a
 * bracketed placeholder as the real thing (Phil, 2026-09-29: "the pages show Draft").
 */
export default async function LegalPage({ which }: { which: "agreement" | "dpa" }) {
  const user = await getSessionUser();
  const docs = legalDocuments();
  const doc = docs[which];
  const other = which === "agreement" ? docs.dpa : docs.agreement;
  const published = legalPublished();

  return (
    <div className="min-h-dvh bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 text-white">
      <SiteHeader authed={Boolean(user)} />
      <main id="content">
        <section className="mx-auto max-w-3xl px-4 pb-20 pt-16">
          {!published ? (
            <div className="mb-8 rounded-lg border border-gold-400/40 bg-gold-400/10 p-4 text-sm text-white">
              <p className="font-semibold text-gold-300">Draft</p>
              <p className="mt-1 text-white/75">
                This is the draft of version {doc.version}, subject to legal review. Our company details
                are added before it is published, and until then nobody is asked to accept it. Details still to add:{" "}
                {legalMissing().join(", ")}.
              </p>
            </div>
          ) : null}

          <div className="glass-card p-6 sm:p-8">
            <LegalDocumentView text={doc.text} />
          </div>

          <p className="mt-10 text-center text-sm text-white/60">
            Read with the{" "}
            <Link href={other.path} className="text-gold-300 underline underline-offset-4 hover:text-gold-400">
              {other.title}
            </Link>{" "}
            and our{" "}
            <Link href="/privacy" className="text-gold-300 underline underline-offset-4 hover:text-gold-400">
              privacy notice
            </Link>
            . Questions:{" "}
            <a
              href="mailto:hello@becarecompliant.com"
              className="text-gold-300 underline underline-offset-4 hover:text-gold-400"
            >
              hello@becarecompliant.com
            </a>
            .
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
