/**
 * Runtime feature detection for optional services.
 *
 * Entify has to run in two modes from the same build:
 *
 *  - **Demo mode** (no environment variables): no sign-in, projects persist to
 *    localStorage. This is the path a reviewer or evaluator takes, and it must
 *    work immediately after `npm run dev` with nothing configured.
 *  - **Configured mode**: Clerk handles auth, Supabase handles persistence.
 *
 * Detection is by presence of credentials rather than an explicit flag, so
 * there is no way to end up in the broken state of "auth enabled but no keys",
 * which previously rendered a permanently blank page.
 */

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

function usable(value: string | undefined): boolean {
  if (!value) return false
  const trimmed = value.trim()
  // Guard against placeholder values left in .env.example files.
  return (
    trimmed.length > 0 &&
    !trimmed.startsWith("your-") &&
    !trimmed.includes("xxxx") &&
    trimmed !== "undefined"
  )
}

export const authEnabled = usable(clerkKey)
export const supabaseEnabled = usable(supabaseUrl) && usable(supabaseKey)
export const demoMode = !authEnabled || !supabaseEnabled

export const config = {
  authEnabled,
  supabaseEnabled,
  demoMode,
  apiBaseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
} as const
