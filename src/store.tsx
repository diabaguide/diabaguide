import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import {
  SEED_DECISIONS, SEED_PROPOSALS, TEAM_QUEUE_EXTRA, emptyProposal,
  type City, type Decision, type Proposal, type Status,
} from './data';

export type Lang = 'fr' | 'en' | 'zh';
export type LocPref = 'ask' | 'while' | 'never';

interface User { name: string; email: string; role: 'traveler' | 'team' }
interface State {
  user: User | null;
  lang: Lang;
  city: City;
  locPref: LocPref;
  favorites: string[];
  downloads: Record<string, string>; // id -> date de téléchargement
  lastSync: string;
  proposals: Proposal[]; // propositions du voyageur
  teamQueue: Proposal[]; // file de l’équipe
  decisions: Decision[];
  draft: Proposal | null;
  installDismissed: boolean;
}

const KEY = 'diaba-guide-state-v1';
const initial: State = {
  user: null, lang: 'fr', city: 'Guangzhou', locPref: 'ask', favorites: ['baiyun', 'jinyuan', 'alnour', 'sinodakar'],
  downloads: { baiyun: '18 sept. 2026', jinyuan: '18 sept. 2026' }, lastSync: '19 sept. 2026, 09:12',
  proposals: SEED_PROPOSALS, teamQueue: [...TEAM_QUEUE_EXTRA], decisions: SEED_DECISIONS, draft: null, installDismissed: false,
};

type Action =
  | { t: 'login'; user: User }
  | { t: 'logout' }
  | { t: 'lang'; v: Lang }
  | { t: 'city'; v: City }
  | { t: 'locPref'; v: LocPref }
  | { t: 'fav'; id: string }
  | { t: 'dl'; id: string }
  | { t: 'syncAll' }
  | { t: 'draft'; p: Proposal | null }
  | { t: 'saveDraft'; p: Proposal }
  | { t: 'submit'; p: Proposal }
  | { t: 'complement'; id: string; patch: Partial<Proposal> }
  | { t: 'decide'; id: string; status: Status; note: string }
  | { t: 'dismissInstall' };

const TODAY = '20 sept. 2026';

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'login': return { ...s, user: a.user };
    case 'logout': return { ...s, user: null };
    case 'lang': return { ...s, lang: a.v };
    case 'city': return { ...s, city: a.v };
    case 'locPref': return { ...s, locPref: a.v };
    case 'fav': return { ...s, favorites: s.favorites.includes(a.id) ? s.favorites.filter((x) => x !== a.id) : [...s.favorites, a.id] };
    case 'dl': {
      const d = { ...s.downloads };
      if (d[a.id]) delete d[a.id]; else d[a.id] = TODAY;
      return { ...s, downloads: d };
    }
    case 'syncAll': {
      const d: Record<string, string> = {};
      Object.keys(s.downloads).forEach((k) => { d[k] = TODAY; });
      return { ...s, downloads: d, lastSync: '20 sept. 2026, 16:05' };
    }
    case 'draft': return { ...s, draft: a.p };
    case 'saveDraft': {
      const p = { ...a.p, status: 'Brouillon' as Status, date: 'Enregistré le 20 sept.' };
      const exists = s.proposals.some((x) => x.id === p.id);
      return { ...s, draft: null, proposals: exists ? s.proposals.map((x) => (x.id === p.id ? p : x)) : [{ ...p, id: 'p' + Date.now() }, ...s.proposals] };
    }
    case 'submit': {
      const p = { ...a.p, status: 'Soumise' as Status, date: 'Envoyée le 20 sept.' };
      const exists = s.proposals.some((x) => x.id === p.id);
      const id = exists ? p.id : 'p' + Date.now();
      const final = { ...p, id };
      return {
        ...s, draft: null,
        proposals: exists ? s.proposals.map((x) => (x.id === p.id ? final : x)) : [final, ...s.proposals],
        teamQueue: [final, ...s.teamQueue.filter((x) => x.id !== id)],
      };
    }
    case 'complement': {
      const upd = (p: Proposal) => (p.id === a.id ? { ...p, ...a.patch, status: 'En vérification' as Status, date: 'Complément envoyé le 20 sept.' } : p);
      return { ...s, proposals: s.proposals.map(upd), teamQueue: s.teamQueue.map(upd) };
    }
    case 'decide': {
      const all = [...s.teamQueue, ...s.proposals];
      const target = all.find((p) => p.id === a.id);
      const upd = (p: Proposal) => (p.id === a.id ? { ...p, status: a.status, feedback: a.note || p.feedback, date: 'Traitée le 20 sept.' } : p);
      const dec: Decision = {
        date: '20 sept. 2026, 16:10', proposalName: target?.name ?? '', cn: target?.cn ?? '', decision: a.status, note: a.note || '—',
        by: 'Agent Diaba', lastCheck: a.status === 'Publiée' ? '20 sept. 2026' : '—',
      };
      return { ...s, proposals: s.proposals.map(upd), teamQueue: s.teamQueue.map(upd), decisions: [dec, ...s.decisions] };
    }
    case 'dismissInstall': return { ...s, installDismissed: true };
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...initial, ...JSON.parse(raw) };
  } catch { /* stockage indisponible */ }
  return initial;
}

interface Ctx { s: State; d: React.Dispatch<Action> }
const C = createContext<Ctx>(null as unknown as Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, d] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }, [s]);
  const v = useMemo(() => ({ s, d }), [s]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
export const useStore = () => useContext(C);

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOn(true), o = () => setOn(false);
    window.addEventListener('online', u); window.addEventListener('offline', o);
    return () => { window.removeEventListener('online', u); window.removeEventListener('offline', o); };
  }, []);
  return on;
}
export { emptyProposal };
