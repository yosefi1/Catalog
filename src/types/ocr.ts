/**
 * OCR architecture for future label scanning.
 * No OCR provider is wired in v1 — interfaces only.
 */

import type { PhotoType } from './device';

export interface OcrSuggestion {
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  assetTag?: string;
  confidence: number;
  rawText: string;
  sourcePhotoType?: PhotoType;
}

export interface OcrProvider {
  readonly id: string;
  readonly name: string;
  /** Whether the provider is available in the current environment */
  isAvailable(): Promise<boolean>;
  /**
   * Extract suggestions from an image blob.
   * Results must always be confirmed by the user before applying to a form.
   */
  recognize(image: Blob, hint?: PhotoType): Promise<OcrSuggestion>;
}

/** Placeholder provider — always unavailable until a real OCR engine is plugged in. */
export class NoOpOcrProvider implements OcrProvider {
  readonly id = 'noop';
  readonly name = 'Not configured';

  async isAvailable(): Promise<boolean> {
    return false;
  }

  async recognize(): Promise<OcrSuggestion> {
    throw new Error('OCR is not configured. Add an OcrProvider implementation.');
  }
}

let activeProvider: OcrProvider = new NoOpOcrProvider();

export function setOcrProvider(provider: OcrProvider): void {
  activeProvider = provider;
}

export function getOcrProvider(): OcrProvider {
  return activeProvider;
}

export async function suggestFromPhoto(
  image: Blob,
  hint?: PhotoType,
): Promise<OcrSuggestion | null> {
  const provider = getOcrProvider();
  if (!(await provider.isAvailable())) return null;
  return provider.recognize(image, hint);
}
