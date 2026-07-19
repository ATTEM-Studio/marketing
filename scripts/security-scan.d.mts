export interface TrackedSource {
  file: string;
  source: string;
}

export function findSecretExposures(files: readonly TrackedSource[]): string[];
