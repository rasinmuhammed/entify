import { createBrowserClient } from "@supabase/ssr";
import { supabaseEnabled } from "@/lib/config";
import { createLocalClient } from "@/lib/localDb";

type BrowserClient = ReturnType<typeof createBrowserClient>;

let client: BrowserClient | null = null;

/**
 * Browser database client, memoised into a singleton.
 *
 * The singleton is load-bearing, not an optimisation. Components call this in
 * their render body and then list the result in `useCallback`/`useEffect`
 * dependency arrays. Returning a fresh object each call gave those hooks a new
 * identity on every render, so effects re-fired forever -- the Data Vault page
 * hit React's "Maximum update depth exceeded" and never finished loading.
 *
 * Falls back to a localStorage shim when Supabase credentials are absent, so
 * the workspace runs with no configuration. See `lib/config.ts`.
 */
export const createClient = (): BrowserClient => {
  if (client) return client;

  client = supabaseEnabled
    ? createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
      )
    : (createLocalClient() as unknown as BrowserClient);

  return client;
};
