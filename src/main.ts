import "./styles.css";
import { createApp } from "./app";
import { readConfig, type AppConfig } from "./config";
import { createDemoService } from "./services/demo-service";
import { renderLandingShell } from "./ui/shell";

export function mountApp(
  root: HTMLElement,
  config: AppConfig = readConfig(import.meta.env),
): void {
  if (config.mode === "live") {
    renderLandingShell(root, () => undefined, false);
    return;
  }
  void createApp(root, createDemoService()).start();
}

const root = document.querySelector<HTMLElement>("#app");
if (root) mountApp(root);
