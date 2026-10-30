import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { CartProvider } from "@/components/customer/cart";
import { ServiceWorker } from "@/components/sw-register";

const appUrl = process.env.APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: { default: "numnum — Watch it. Crave it. Order it.", template: "%s · numnum" },
  description: "Discover Lebanon's best food through short videos and order from local restaurants — cash on delivery.",
  applicationName: "numnum",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "numnum", statusBarStyle: "black-translucent" },
  icons: { icon: "/icons/icon.svg", apple: "/icons/apple-touch-icon.png" },
  openGraph: { type: "website", siteName: "numnum", locale: "en_LB" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf8f5",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>
        <ToastProvider>
          <CartProvider>{children}</CartProvider>
        </ToastProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
