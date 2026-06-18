import { Metadata, Viewport } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "SAIP Mobile",
  description: "SAIP Mobile App",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SAIP",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MobileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-zinc-950 absolute inset-0 pb-env-safe">
      <Script id="sw-register" strategy="afterInteractive">
        {`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js').then(
                function(registration) { },
                function(err) { console.log('Service Worker registration failed: ', err); }
              );
            });
          }
        `}
      </Script>
      {children}
    </div>
  );
}
