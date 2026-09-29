import type { Metadata } from "next";
import LegalPage from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Subscription Agreement",
  description: "The Be Care Compliant Subscription Agreement: the terms a care company agrees to when it uses the platform.",
};

export default function TermsPage() {
  return <LegalPage which="agreement" />;
}
