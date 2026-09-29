import type { Metadata } from "next";
import LegalPage from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Data Processing Agreement",
  description: "The Be Care Compliant Data Processing Agreement: how we process personal data on behalf of the care companies we serve.",
};

export default function DpaPage() {
  return <LegalPage which="dpa" />;
}
