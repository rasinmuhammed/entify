import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import AuthGate from "@/components/AuthGate";
import DemoModeBanner from "@/components/DemoModeBanner";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Entify | Entity Resolution Workspace",
  description:
    "Open-source entity resolution workspace for deduplicating messy datasets, configuring Splink matching workflows, and reviewing explainable record clusters.",
  keywords: [
    "entity resolution",
    "record linkage",
    "data deduplication",
    "fuzzy matching",
    "Splink",
    "DuckDB",
    "data quality",
    "semantic blocking",
    "customer 360",
    "master data management",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <Providers>
          <AuthGate>
            <div className="flex min-h-screen flex-col bg-background">
              <DemoModeBanner />
              <TopNav />
              <main className="flex-1">{children}</main>
            </div>
          </AuthGate>
        </Providers>
      </body>
    </html>
  );
}
