import { logSessionEvent } from './sessionLog';

/** Événements d'usage (passage à l'action) : mêmes règles que le journal de session, jamais bloquant. */
export type ActionUsage = 'chauffeur' | 'itineraire' | 'appel' | 'wechat' | 'audio_chauffeur' | 'recherche_vide';
export function logUsage(action: ActionUsage, detail = ''): void {
  logSessionEvent(`usage_${action}`, detail);
}
