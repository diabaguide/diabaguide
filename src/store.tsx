import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  PROVIDERS, SEED_DECISIONS, SEED_PROPOSALS, STATIC_CATEGORIES, STATIC_CITIES, STATIC_DISTRICTS,
  TEAM_QUEUE_EXTRA, emptyProposal, setTaxonomies,
  type Category, type City, type CityRef, type Decision, type District, type ProductTag,
  type Provider, type Proposal, type Status,
} from './data';
import { fetchTaxonomies } from './lib/taxonomies';
import { fetchProviders } from './lib/providers';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { isTeamRole, userFromSession, type Role } from './lib/auth';
import {
  complementProposal, decideProposal, fetchAllProposals, fetchDecisions, fetchMyProposals, saveProposal,
} from './lib/contributions';

export type Lang = 'fr' | 'en' | 'zh';
export type LocPref = 'ask' | 'while' | 'never';

interface User { id?: string; name: string; email: string; role: Role }
interface State {
  user: User | null;
  authReady: boolean; // la session Supabase a-t-elle été vérifiée ?
  lang: Lang;
  city: City;
  locPref: LocPref;
  favorites: string[];
  downloads: Record<string, string>; // id -> date de téléchargement
  lastSync: string;
  providers: Provider[]; // adresses (Supabase, avec repli statique)
  // Taxonomies administrables (Supabase, avec repli statique)
  categories: Category[];
  cities: CityRef[];
  districts: District[];
  productTags: ProductTag[];
  // Propositions pertinentes pour l'utilisateur courant : ses propres
  // propositions (voyageur) ou toutes les propositions soumises (équipe).
  proposals: Proposal[];
  decisions: Decision[]; // journal équipe
  draft: Proposal | null;
  installDismissed: boolean;
}

const KEY = 'diaba-guide-state-v1';
const initial: State = {
  user: null, authReady: !isSupabaseConfigured, lang: 'fr', city: 'guangzhou', locPref: 'ask', favorites: ['baiyun', 'jinyuan', 'alnour', 'sinodakar'],
  downloads: { baiyun: '18 sept. 2026', jinyuan: '18 sept. 2026' }, lastSync: '19 sept. 2026, 09:12',
  providers: PROVIDERS,
  categories: STATIC_CATEGORIES, cities: STATIC_CITIES, districts: STATIC_DISTRICTS, productTags: [],
  // Avec Supabase, propositions et décisions sont chargées depuis la base.
  proposals: isSupabaseConfigured ? [] : [...SEED_PROPOSALS, ...TEAM_QUEUE_EXTRA],
  decisions: isSupabaseConfigured ? [] : SEED_DECISIONS,
  draft: null, installDismissed: false,
};

type Action =
  | { t: 'login'; user: User }
  | { t: 'logout' }
  | { t: 'session'; user: User | null } // résultat de la vérification de session Supabase
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
  | { t: 'setProviders'; v: Provider[] }
  | { t: 'setTaxonomies'; categories: Category[]; cities: CityRef[]; districts: District[]; productTags: ProductTag[] }
  | { t: 'setProposals'; v: Proposal[] }
  | { t: 'setDecisions'; v: Decision[] }
  | { t: 'dismissInstall' };

const TODAY = '20 sept. 2026';
const cleared = isSupabaseConfigured ? { proposals: [] as Proposal[], decisions: [] as Decision[] } : {};

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'login': return { ...s, user: a.user, authReady: true };
    case 'logout': return { ...s, user: null, authReady: true, ...cleared };
    case 'session': return { ...s, user: a.user, authReady: true, ...(a.user ? {} : cleared) };
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
    // Actions de contribution : chemin de repli LOCAL (Supabase non configuré).
    // Avec Supabase, les fonctions de `api` ci-dessous font foi (setProposals/…).
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
      return { ...s, draft: null, proposals: exists ? s.proposals.map((x) => (x.id === p.id ? final : x)) : [final, ...s.proposals] };
    }
    case 'complement': {
      const upd = (p: Proposal) => (p.id === a.id ? { ...p, ...a.patch, status: 'En vérification' as Status, date: 'Complément envoyé le 20 sept.' } : p);
      return { ...s, proposals: s.proposals.map(upd) };
    }
    case 'decide': {
      const target = s.proposals.find((p) => p.id === a.id);
      const upd = (p: Proposal) => (p.id === a.id ? { ...p, status: a.status, feedback: a.note || p.feedback, date: 'Traitée le 20 sept.' } : p);
      const dec: Decision = {
        date: '20 sept. 2026, 16:10', proposalName: target?.name ?? '', cn: target?.cn ?? '', decision: a.status, note: a.note || '—',
        by: 'Agent Diaba', lastCheck: a.status === 'Publiée' ? '20 sept. 2026' : '—',
      };
      return { ...s, proposals: s.proposals.map(upd), decisions: [dec, ...s.decisions] };
    }
    case 'setProviders': return { ...s, providers: a.v };
    case 'setTaxonomies': return { ...s, categories: a.categories, cities: a.cities, districts: a.districts, productTags: a.productTags };
    case 'setProposals': return { ...s, proposals: a.v };
    case 'setDecisions': return { ...s, decisions: a.v };
    case 'dismissInstall': return { ...s, installDismissed: true };
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    // `providers` n'est jamais restauré depuis localStorage : il est
    // (re)chargé depuis Supabase au démarrage, avec repli statique.
    if (raw) {
      const parsed = { ...initial, ...JSON.parse(raw), providers: PROVIDERS } as State;
      // Les identifiants de ville sont passés en minuscules (« Guangzhou » -> « guangzhou »).
      if (parsed.city) parsed.city = String(parsed.city).toLowerCase();
      // Avec Supabase : la session fait foi (pas d'accès depuis un `user`
      // persisté), on attend la vérification de session, et propositions /
      // décisions sont rechargées depuis la base (jamais depuis localStorage).
      if (isSupabaseConfigured) { parsed.user = null; parsed.authReady = false; parsed.proposals = []; parsed.decisions = []; }
      return parsed;
    }
  } catch { /* stockage indisponible */ }
  return initial;
}

interface ContribApi {
  saveDraft: (p: Proposal) => Promise<void>;
  submit: (p: Proposal) => Promise<void>;
  complement: (id: string, patch: Partial<Proposal>) => Promise<void>;
  decide: (id: string, status: Status, note: string) => Promise<void>;
  /** Recharge les taxonomies après une modification dans l'administration. */
  reloadTaxonomies: () => Promise<void>;
}
interface Ctx { s: State; d: React.Dispatch<Action>; api: ContribApi }
const C = createContext<Ctx>(null as unknown as Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, d] = useReducer(reducer, undefined, load);
  const sRef = useRef(s); sRef.current = s;

  useEffect(() => {
    // On ne persiste pas les données rechargées depuis Supabase (providers,
    // proposals, decisions) ni la session (`user`, `authReady`).
    try {
      const base = {
        lang: s.lang, city: s.city, locPref: s.locPref, favorites: s.favorites,
        downloads: s.downloads, lastSync: s.lastSync, draft: s.draft, installDismissed: s.installDismissed,
      };
      const persist = isSupabaseConfigured ? base
        : { ...base, user: s.user, proposals: s.proposals, decisions: s.decisions };
      localStorage.setItem(KEY, JSON.stringify(persist));
    } catch { /* ignore */ }
  }, [s]);

  // Chargement des adresses depuis Supabase au démarrage (repli statique interne).
  useEffect(() => {
    let alive = true;
    fetchProviders().then((list) => { if (alive) d({ t: 'setProviders', v: list }); });
    return () => { alive = false; };
  }, []);

  // Taxonomies (villes, quartiers, catégories, produits) : état + registre
  // module utilisé par les helpers appelés en profondeur (catLabel, etc.).
  useEffect(() => {
    let alive = true;
    fetchTaxonomies().then((t) => {
      if (!alive) return;
      setTaxonomies(t);
      d({ t: 'setTaxonomies', categories: t.categories, cities: t.cities, districts: t.districts, productTags: t.tags });
    });
    return () => { alive = false; };
  }, []);

  // Synchronisation de la session Supabase Auth → `s.user`.
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    const hydrate = async (session: Parameters<typeof userFromSession>[0]) => {
      const u = await userFromSession(session);
      if (!alive) return;
      d({ t: 'session', user: u });
    };
    supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { void hydrate(session); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  // Chargement des propositions/décisions depuis Supabase selon le rôle.
  useEffect(() => {
    if (!supabase || !s.user) return;
    let alive = true;
    (async () => {
      if (isTeamRole(s.user!.role)) {
        const [proposals, decisions] = await Promise.all([fetchAllProposals(), fetchDecisions()]);
        if (!alive) return;
        d({ t: 'setProposals', v: proposals });
        d({ t: 'setDecisions', v: decisions });
      } else {
        const proposals = await fetchMyProposals();
        if (alive) d({ t: 'setProposals', v: proposals });
      }
    })();
    return () => { alive = false; };
  }, [s.user?.id, s.user?.role]);

  const api = useMemo<ContribApi>(() => ({
    saveDraft: async (p) => {
      if (!supabase) { d({ t: 'saveDraft', p }); return; }
      const { error } = await saveProposal(p, 'Brouillon', 'Enregistré', sRef.current.user?.name);
      if (error) { if (import.meta.env.DEV) console.warn('[Diaba Guide] Validation :', error); return; }
      d({ t: 'draft', p: null });
      d({ t: 'setProposals', v: await fetchMyProposals() });
    },
    submit: async (p) => {
      if (!supabase) { d({ t: 'submit', p }); return; }
      const { error } = await saveProposal(p, 'Soumise', 'Envoyée', sRef.current.user?.name);
      if (error) { if (import.meta.env.DEV) console.warn('[Diaba Guide] Validation :', error); return; }
      d({ t: 'draft', p: null });
      d({ t: 'setProposals', v: await fetchMyProposals() });
    },
    complement: async (id, patch) => {
      if (!supabase) { d({ t: 'complement', id, patch }); return; }
      await complementProposal(id, patch);
      d({ t: 'setProposals', v: await fetchMyProposals() });
    },
    decide: async (id, status, note) => {
      if (!supabase) { d({ t: 'decide', id, status, note }); return; }
      const target = sRef.current.proposals.find((x) => x.id === id);
      if (target) await decideProposal(target, status, note, sRef.current.user?.name ?? 'Agent Diaba');
      const [proposals, decisions] = await Promise.all([fetchAllProposals(), fetchDecisions()]);
      d({ t: 'setProposals', v: proposals });
      d({ t: 'setDecisions', v: decisions });
    },
    reloadTaxonomies: async () => {
      const t = await fetchTaxonomies();
      setTaxonomies(t);
      d({ t: 'setTaxonomies', categories: t.categories, cities: t.cities, districts: t.districts, productTags: t.tags });
    },
  }), []);

  const v = useMemo(() => ({ s, d, api }), [s, api]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
export const useStore = () => useContext(C);

/** Recherche une adresse par id dans les adresses chargées dans le store. */
export function useProviderById(id: string | undefined | null): Provider | null {
  const { s } = useStore();
  if (!id) return null;
  return s.providers.find((p) => p.id === id) ?? null;
}

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
