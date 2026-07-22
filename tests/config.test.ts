import { expect, test } from "vitest";
import { readConfig } from "../src/config";
import { mountApp } from "../src/main";

test("uses demo mode unless both live credentials and the live mode are set", () => {
  expect(readConfig({} as ImportMetaEnv)).toMatchObject({
    mode: "demo",
    supabaseUrl: null,
    supabaseAnonKey: null,
  });
  expect(
    readConfig({
      VITE_APP_MODE: "live",
      VITE_SUPABASE_URL: " https://example.supabase.co ",
      VITE_SUPABASE_ANON_KEY: " anon-key ",
    } as unknown as ImportMetaEnv),
  ).toEqual({
    mode: "live",
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
  });
});

test("keeps the live mode on the unavailable landing screen until its service exists", () => {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("missing test root");

  mountApp(root, {
    mode: "live",
    supabaseUrl: "https://example.supabase.co",
    supabaseAnonKey: "anon-key",
  });

  expect(root.textContent).toContain("운영 연결 준비 중");
  expect(root.querySelector("[data-start-diagnosis]")).toBeNull();
});
