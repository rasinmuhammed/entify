"use client"

import { useUser } from "@clerk/nextjs"
import { authEnabled } from "@/lib/config"

/**
 * Auth accessors that work whether or not Clerk is configured.
 *
 * Clerk's hooks throw when no `ClerkProvider` is mounted, and in demo mode we
 * deliberately do not mount one. The implementation is chosen once at module
 * load from a build-time constant rather than branching inside the hook, so
 * the hook identity is stable across renders and the rules of hooks hold.
 */

export type AppUser = {
  id: string
  email: string
  name: string
}

const DEMO_USER: AppUser = {
  id: "local-user",
  email: "you@localhost",
  name: "Local User",
}

function useClerkUser(): AppUser {
  const { user } = useUser()
  if (!user) return DEMO_USER
  return {
    id: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? "",
    name: user.fullName ?? user.username ?? "User",
  }
}

function useDemoUser(): AppUser {
  return DEMO_USER
}

/** The current user. In demo mode this is a stable local identity. */
export const useAppUser: () => AppUser = authEnabled ? useClerkUser : useDemoUser
