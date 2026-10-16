/** Colonnes de filtre ajoutées par la migration 620, optionnelles tant qu'elle n'est pas appliquée. */
const FICHE_FILTER_COLUMNS = ['price_level', 'price_night', 'halal_status', 'cuisine_type'] as const;

/** Vrai si Supabase indique qu'une colonne de filtre de fiche est absente. */
export function isMissingFicheFilterColumn(message: string): boolean {
  return new RegExp(`could not find the '(${FICHE_FILTER_COLUMNS.join('|')})' column of 'providers' in the schema cache`, 'i').test(message);
}

/** Retire seulement les champs optionnels de la migration 620 avant une écriture de repli. */
export function withoutFicheFilterColumns<T extends Record<string, unknown>>(row: T): Omit<T, typeof FICHE_FILTER_COLUMNS[number]> {
  const next = { ...row };
  for (const key of FICHE_FILTER_COLUMNS) delete next[key];
  return next;
}
