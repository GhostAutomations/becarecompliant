import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Be Care Compliant",
    template: "%s · Be Care Compliant",
  },
  description:
    "Keeps UK care companies compliant with CQC, CIW and local authorities.",
  applicationName: "Be Care Compliant",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Compliant",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#081231",
  width: "device-width",
  initialScale: 1,
  // Cover the safe areas so env(safe-area-inset-*) is honoured on notched iPhones.
  viewportFit: "cover",
  // Let people pinch-zoom if they need to (accessibility); inputs are 16px on
  // mobile so focus never triggers an automatic zoom.
  maximumScale: 5,
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
