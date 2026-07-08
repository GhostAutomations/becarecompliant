import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Be Care Compliant",
    template: "%s · Be Care Compliant",
  },
  description:
    "Keeps UK care companies compliant with CQC, CIW and local authorities.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
