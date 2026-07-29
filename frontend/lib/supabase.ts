import { createClient } from '@supabase/supabase-js'
import { supabaseEnabled } from '@/lib/config'
import { createLocalClient } from '@/lib/localDb'

/**
 * The database client.
 *
 * Previously this asserted both environment variables with `!`, so a missing
 * key produced an opaque crash on the first query. It now falls back to a
 * localStorage-backed client exposing the same interface, which is what makes
 * the zero-config demo path possible.
 */
export const supabase = supabaseEnabled
  ? createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
    )
  : (createLocalClient() as unknown as ReturnType<typeof createClient>)

export const isLocalPersistence = !supabaseEnabled
