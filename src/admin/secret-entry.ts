export interface SecretEntryOptions {
  presses: number;
  windowMs: number;
  onUnlock(): void;
}

export interface SecretEntry {
  press(now?: number): void;
  reset(): void;
}

export function createSecretEntry(options: SecretEntryOptions): SecretEntry {
  let times: number[] = [];

  return {
    press(now = Date.now()): void {
      times = times.filter((value) => now - value <= options.windowMs);
      times.push(now);
      if (times.length !== options.presses) return;
      times = [];
      options.onUnlock();
    },
    reset(): void {
      times = [];
    },
  };
}
