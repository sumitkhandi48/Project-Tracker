import "./globals.css";

export const metadata = {
  title: "Project Tracker — Unified Engineering Workspace",
  description:
    "Everything I'm building, all in one place. Systematic project tracking, engineering milestones, and sprint telemetry.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a1c22",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&family=Host+Grotesk:ital,wght@0,300..800;1,300..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-paper text-ink antialiased selection:bg-accent/20 selection:text-accent font-body">
        {children}
      </body>
    </html>
  );
}
