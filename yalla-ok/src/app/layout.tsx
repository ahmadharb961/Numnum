import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { Header } from "@/components/header";
import { BottomNav } from "@/components/bottom-nav";
import { ServerClockProvider } from "@/components/server-clock";
import { SwRegister } from "@/components/sw-register";
import { SITE_URL } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Yalla Ok — Post it. Get it done.", template: "%s · Yalla Ok" },
  description:
    "A live list of small tasks people will pay to have done. Post a task in seconds, set a reward and a deadline, and get contacted on WhatsApp.",
  applicationName: "Yalla Ok",
  appleWebApp: { capable: true, title: "Yalla Ok", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/favicon.png", sizes: "48x48" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    siteName: "Yalla Ok",
    title: "Yalla Ok — Post it. Get it done.",
    description: "Live tasks people will pay to have done. Tap one and chat on WhatsApp.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#8125e8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <ServerClockProvider serverNow={Date.now()}>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:shadow-lift"
          >
            Skip to content
          </a>
          <Header />
          <main id="main" className="mx-auto w-full max-w-[1280px] px-4 pb-10 pt-5 sm:px-6 sm:pt-8">
            {children}
          </main>
          <BottomNav />
        </ServerClockProvider>
        <SwRegister />
      </body>
    </html>
  );
}
