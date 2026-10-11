/* Suivi ShipsGo : appels aux fonctions serveur /api (le jeton reste côté serveur). */
import { supabase } from '../supabase';


export interface ShipsGoActionResult {
  httpStatus?: number; error?: string; ok?: boolean; type?: 'ocean' | 'air'; id?: number;
  reused?: boolean; eventsAdded?: number; status?: string | null;
}

async function shipsGoRequest(path: '/api/shipsgo-track' | '/api/shipsgo-sync', code: string): Promise<ShipsGoActionResult> {
  if (!supabase) return { httpStatus: 503 };
  try {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) return { httpStatus: 401 };
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    });
    const body = await response.json().catch(() => null) as ShipsGoActionResult | null;
    return response.ok ? (body ?? {}) : { httpStatus: response.status, error: body?.error };
  } catch {
    return { httpStatus: 503 };
  }
}

/** Création explicitement déclenchée par un membre de l'équipe, après confirmation UI. */
export const creerSuiviShipsGo = (code: string) => shipsGoRequest('/api/shipsgo-track', code);
/** Synchronisation d'un suivi déjà enregistré, sans création provider. */
export const synchroniserShipsGo = (code: string) => shipsGoRequest('/api/shipsgo-sync', code);
