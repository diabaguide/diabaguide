import { useI18n } from '../../../i18n';
import { useLocation } from 'react-router-dom';
import { Icon } from '../../../ui';
import { MODE_LABEL, MODE_UNITE, type EtapeType, type Expedition, type ExpeditionTotaux, type FretMode } from '../../../lib/fret';

/** Ce que chaque section du détail reçoit pour signaler un résultat et recharger la page. */
export interface Notifier {
  setErr: (message: string | null) => void;
  setOk: (message: string | null) => void;
  reload: () => Promise<void>;
}

export const money = (n: number, d = 'FCFA') => `${n.toLocaleString('fr-FR')} ${d === 'XOF' ? 'FCFA' : d}`;

export const MODE_OPTIONS = (Object.keys(MODE_LABEL) as FretMode[]).map((v) => ({ v, l: MODE_LABEL[v] }));
export const TYPES = [
  { v: 'general', l: 'Marchandise générale' }, { v: 'textile', l: 'Textile et confection' },
  { v: 'electronique', l: 'Électronique et téléphones' }, { v: 'batterie', l: 'Batteries et produits à risque' },
  { v: 'cosmetique', l: 'Cosmétiques' }, { v: 'liquide', l: 'Liquides' }, { v: 'alimentaire', l: 'Produits alimentaires' },
];
/** Les écrans servent dans deux espaces : la console équipe (/equipe) et
    l'espace fret (/fret). Les liens restent dans l'espace d'origine. */
export const useBase = () => (useLocation().pathname.startsWith('/fret') ? '/fret' : '/equipe');

export const toNum = (s: string): number | null => { const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? null : n; };
const dateLocale = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const estEnRetard = (e: Expedition) => Boolean(e.arriveePrevue && e.arriveePrevue < dateLocale(new Date()) && !['livree', 'cloturee', 'annulee'].includes(e.statut));

/** Étapes d'une expédition, dans l'ordre de son cycle de vie. */
export const ETAPES_ORDRE: EtapeType[] = ['regroupe', 'depart', 'en_transit', 'arrive_dakar', 'chez_diaba', 'dispo_retrait', 'en_livraison', 'remis'];

/** Barre de remplissage : total atteint face au seuil, sur l'unité du mode. */
export function Remplissage({ exp, tot }: { exp: Expedition; tot?: ExpeditionTotaux }) {
  const { tr } = useI18n();
  if (!tot) return <span className="np">—</span>;
  const unite = MODE_UNITE[exp.mode];
  const total = unite === 'm3' ? tot.totalM3 : tot.totalKg;
  const seuil = unite === 'm3' ? exp.seuilM3 : exp.seuilKg;
  const u = unite === 'm3' ? 'm³' : 'kg';
  if (!seuil) return <span className="small">{total.toLocaleString('fr-FR')} {u}</span>;
  const pct = Math.min(100, Math.round((total / seuil) * 100));
  const plein = pct >= 100;
  return (
    <div className="stack" style={{ gap: 4, minWidth: 140 }}>
      <div className="small" style={{ fontWeight: 600 }}>{total.toLocaleString('fr-FR')} / {seuil.toLocaleString('fr-FR')} {u} · {pct}%</div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--chip-border, #e3e3e3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: plein ? '#1F7A4A' : '#1F4A7A' }} />
      </div>
      {plein && <span className="small" style={{ color: '#1F7A4A', fontWeight: 600 }}><Icon name="check" size={13} sw={2.4} /> {tr("Prêt à charger")}</span>}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <div className="small muted">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
