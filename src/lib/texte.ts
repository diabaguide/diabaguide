/**
 * Comparaison de texte : casse et accents ignorés.
 *
 * Un voyageur cherche « medina » et la fiche dit « Médina » : il doit la trouver.
 * Et inversement, s'il écrit « Médina », la fiche « Medina » doit sortir aussi.
 * La comparaison passe donc toujours par `sansAccent()`, jamais par un
 * `toLowerCase()` seul.
 *
 * La règle est aussi appliquée en base pour regrouper les recherches
 * (`public.sans_accent()` dans supabase/search_logs.sql) : les deux
 * implémentations doivent rester identiques, sinon le classement des recherches
 * par l'équipe (« médina » et « medina » comptés comme deux besoins distincts)
 * ne correspondrait plus à ce que le voyageur voit.
 */

/** Lettres que la décomposition Unicode ne sépare pas ; rendues à leur équivalent simple. */
const LIGATURES: Record<string, string> = {
  œ: 'oe', æ: 'ae', ß: 'ss', ø: 'o', đ: 'd', ł: 'l', ħ: 'h', ı: 'i', ſ: 's',
  '\u2019': '', '\u02bc': '', // apostrophes typographiques : « d'or » et « d’or »
};

/** Texte réduit à sa forme comparable : minuscules, sans accents ni ligatures. */
export function sansAccent(texte: string | null | undefined): string {
  return (texte ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents décomposés (é -> e + ́)
    .replace(/[œæßøđłħıſ\u2019\u02bc]/g, (c) => LIGATURES[c] ?? c)
    .toLowerCase();
}

/**
 * Le texte contient-il le terme ? Casse, accents et ligatures ignorés.
 * Un terme vide est considéré comme présent (l'appelant décide alors de ne rien
 * filtrer).
 */
export function contient(texte: string | null | undefined, terme: string | null | undefined): boolean {
  const t = sansAccent(terme).trim();
  return t === '' || sansAccent(texte).includes(t);
}
