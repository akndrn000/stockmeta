// Registry provider: satu tempat menambah/menonaktifkan provider.
import type { ProviderId } from '../types';
import { gemini } from './gemini';
import { groq } from './groq';
import { openrouter } from './openrouter';
import type { ProviderAdapter } from './types';

export const registry: Record<ProviderId, ProviderAdapter | undefined> = {
  gemini,
  groq,
  openrouter
};

export function getProvider(id: ProviderId): ProviderAdapter | undefined {
  return registry[id];
}
