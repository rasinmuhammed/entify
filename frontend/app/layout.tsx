import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { ClerkProvider, SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";
import { TopNav } from "@/components/TopNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Entify",
  description: "The Unified Truth Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
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
