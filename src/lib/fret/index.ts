/**
 * Accès aux données du module Fret (expéditions, colis, suivi).
 * Tables : voir supabase/240_fret_module.sql et supabase/250_fret_tarifs.sql.
 * RLS : réservé à l'équipe fret (is_fret : livreur, équipe, admin) ; le
 * client lit ses propres colis. Voir supabase/310_livreur.sql.
 */
export * from './model';
export * from './expeditions';
export * from './shipsgo';
export * from './colis';
export * from './tarifs';
export * from './factures';
export * from './carte';
