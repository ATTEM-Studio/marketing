import "./styles.css";
import { createApp } from "./app";
import { createDemoService } from "./services/demo-service";

export function mountApp(root: HTMLElement): void {
  void createApp(root, createDemoService()).start();
}

const root = document.querySelector<HTMLElement>("#app");
if (root) mountApp(root);
