import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Sleep Guardian",
  manifest: "/guardian-manifest.json",
  appleWebApp: {
    capable: true,
    title: "Guardian",
    statusBarStyle: "black-translucent",
  },
  // Nicht in Suchmaschinen auftauchen – ist deine private Steuerzentrale.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#131A22",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function ControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function () {
                navigator.serviceWorker.register('/guardian-sw.js', { scope: '/control' })
                  .catch(function () { /* PWA-Install optional, App läuft auch ohne */ });
              });
            }
          `,
        }}
      />
    </>
  );
}
