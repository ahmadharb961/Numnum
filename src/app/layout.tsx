import type { Metadata, Viewport } from "next";
import "@fontsource-variable/cairo";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { CartProvider } from "@/components/customer/cart";
import { ServiceWorker } from "@/components/sw-register";
import { NavHistory } from "@/components/back-button";
import { InstallPromptListener } from "@/components/install-guide";
import { I18nProvider } from "@/i18n/client";
import { dirOf } from "@/i18n/core";
import { dictFor, getLocale } from "@/i18n/server";

const appUrl = process.env.APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "numnum — Watch it. Crave it. Order it.", template: "%s · numnum" },
  description: "Discover Lebanon's best food through short videos and order from local restaurants — cash on delivery.",
  applicationName: "numnum",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "numnum", statusBarStyle: "black-translucent" },
  // Every browser gets an icon it can show: .ico (all browsers, Google results), PNG (Safari and
  // Android browsers ignore SVG favicons), SVG (sharp on modern desktops). "?v=" busts old caches.
  icons: {
    icon: [
      { url: "/favicon.ico?v=4", sizes: "16x16 32x32 48x48" },
      { url: "/icons/v2/favicon-32.png?v=4", sizes: "32x32", type: "image/png" },
      { url: "/icons/v2/favicon-16.png?v=4", sizes: "16x16", type: "image/png" },
      { url: "/icons/v2/favicon-96.png?v=4", sizes: "96x96", type: "image/png" },
      { url: "/icons/v2/icon-192.png?v=4", sizes: "192x192", type: "image/png" },
      { url: "/icons/v2/icon.svg?v=4", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico?v=4",
    apple: [{ url: "/icons/v2/apple-touch-icon.png?v=4", sizes: "180x180", type: "image/png" }],
  },
  openGraph: { type: "website", siteName: "numnum", locale: "en_LB", images: [{ url: "/og.png", width: 1200, height: 630, alt: "numnum — Watch it. Crave it. Order it." }] },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf8f5",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body>
        <I18nProvider locale={locale} dict={dictFor(locale)}>
        <ToastProvider>
          <CartProvider>
            {/* In the installed app this is the scroll container (see globals.css); elsewhere a plain wrapper. */}
            <div className="app-scroll">{children}</div>
          </CartProvider>
        </ToastProvider>
        <ServiceWorker />
        <NavHistory />
        <InstallPromptListener />
        </I18nProvider>
      </body>
    </html>
  );
}
