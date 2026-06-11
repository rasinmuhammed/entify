import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";
import { TopNav } from "@/components/TopNav";

export const metadata: Metadata = {
  title: "Entify | Entity Resolution Workspace",
  description: "Open-source entity resolution workspace for deduplicating messy datasets, configuring Splink matching workflows, and reviewing explainable record clusters.",
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
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className="antialiased">
          <Providers>
            <SignedOut>
              <div className="flex items-center justify-center min-h-screen bg-background">
                <RedirectToSignIn />
              </div>
            </SignedOut>
            <SignedIn>
              <div className="min-h-screen flex flex-col bg-background">
                <TopNav userName="Muhammed Rasin" userEmail="rasin@entify.app" />
                <main className="flex-1">
                  {children}
                </main>
              </div>
            </SignedIn>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
