"use client"

import { ClerkProvider, RedirectToSignIn, SignedIn, SignedOut } from "@clerk/nextjs"
import { authEnabled } from "@/lib/config"

/**
 * Wraps the app in Clerk only when Clerk is actually configured.
 *
 * `ClerkProvider` throws when it has no publishable key, and the previous
 * layout rendered it unconditionally with a `RedirectToSignIn` fallback -- so
 * a checkout without credentials showed a permanently blank page with an
 * error in the console. Skipping the provider entirely is what lets the app
 * boot with nothing configured.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  if (!authEnabled) return <>{children}</>

  return (
    <ClerkProvider>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <RedirectToSignIn />
        </div>
      </SignedOut>
    </ClerkProvider>
  )
}
