import "./styles.css";
import { createApp } from "./app";
import { readConfig, type AppConfig } from "./config";
import { createDemoService } from "./services/demo-service";
import { createSupabaseService } from "./services/supabase-service";

export function mountApp(
  root: HTMLElement,
  config: AppConfig = readConfig(import.meta.env),
): void {
  const service =
    config.mode === "live" && config.supabaseUrl && config.supabaseAnonKey
      ? createSupabaseService(config.supabaseUrl, config.supabaseAnonKey)
      : createDemoService();
  const authCallback =
    config.mode === "live" &&
    new URLSearchParams(window.location.search).get("auth") === "callback";
  void createApp(root, service, {
    authCallback,
    isLive: config.mode === "live",
  }).start();
}

const root = document.querySelector<HTMLElement>("#app");
if (root) mountApp(root);
