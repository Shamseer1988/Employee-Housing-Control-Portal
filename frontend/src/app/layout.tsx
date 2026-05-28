import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeBridge } from "@/components/theme-bridge";
import { ServiceWorkerRegister } from "@/components/sw-register";

export const metadata: Metadata = {
  title: {
    default: "PUG Accommodation Portal",
    template: "%s · PUG Accommodation",
  },
  description: "Centralized employee accommodation management for Paris United Group",
  manifest: "/manifest.webmanifest",
  applicationName: "PUG Accommodation",
  appleWebApp: {
    capable: true,
    title: "PUG Housing",
    statusBarStyle: "black-translucent",
  },
  // Mirror the Apple PWA capability hint with the standard one so we don't
  // ship a deprecated-only tag.
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ThemeBridge />
          <ServiceWorkerRegister />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
