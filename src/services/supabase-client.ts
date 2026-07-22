import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type BuyerSupabaseClient = SupabaseClient;

export function createSupabaseClient(
  url: string,
  anonKey: string,
): BuyerSupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
