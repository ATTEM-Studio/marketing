export interface AppConfig {
  mode: "demo" | "live";
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
}

export function readConfig(env: ImportMetaEnv): AppConfig {
  const supabaseUrl = env.VITE_SUPABASE_URL?.trim() || null;
  const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY?.trim() || null;
  const live = Boolean(
    supabaseUrl && supabaseAnonKey && env.VITE_APP_MODE === "live",
  );
  return { mode: live ? "live" : "demo", supabaseUrl, supabaseAnonKey };
}
