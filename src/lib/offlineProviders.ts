import type { Provider } from '../data';

/** Ajoute ou retire une copie de fiche destinée au repli hors connexion. */
export function toggleOfflineProvider<T extends { id: string }>(saved: T[], provider: T): T[] {
  return saved.some((item) => item.id === provider.id)
    ? saved.filter((item) => item.id !== provider.id)
    : [...saved, provider];
}

/** Les copies téléchargées priment sur le repli statique, sans doublon. */
export function mergeOfflineProviders(fallback: Provider[], saved: Provider[]): Provider[] {
  const savedIds = new Set(saved.map((item) => item.id));
  return [...saved, ...fallback.filter((item) => !savedIds.has(item.id))];
}
