import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Request middleware.
 *
 * `clerkMiddleware()` needs a publishable key and rejects every request
 * without one, which made a fresh checkout unusable before any page rendered.
 * When Clerk is not configured, requests pass straight through so demo mode
 * works with no environment variables at all.
 */
const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
    process.env.CLERK_SECRET_KEY?.trim()
);

export default clerkConfigured ? clerkMiddleware() : () => NextResponse.next();

export const config = {
    matcher: [
        '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
        '/(api|trpc)(.*)',
    ],
};
