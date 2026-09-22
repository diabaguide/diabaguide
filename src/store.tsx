import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  PROVIDERS, SEED_DECISIONS, SEED_PROPOSALS, STATIC_CATEGORIES, STATIC_CITIES, STATIC_DISTRICTS,
  TEAM_QUEUE_EXTRA, emptyProposal, setTaxonomies,
  type Category, type City, type CityRef, type Decision, type District, type ProductTag,
  type Provider, type Proposal, type Status,
} from './data';
import { fetchTaxonomies } from './lib/taxonomies';
import { cancelProviderDeletion, deleteProvider, fetchProviders, requestProviderDeletion, saveProvider as saveProviderRow } from './lib/providers';
import { fetchMyRating, rateProvider } from './lib/ratings';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { isTeamRole, userFromSession, type Role } from './lib/auth';
import {
  complementProposal, decideProposal, logProviderEvent, fetchAllProposals, fetchDecisions, fetchMyProposals, saveProposal, updateProposalFields,
} from './lib/contributions';

export type Lang = 'fr' | 'en' | 'zh' | 'ar';
export type LocPref = 'ask' | 'while' | 'never';
export type Theme = 'system' | 'light' | 'dark';

interface User { id?: string; name: string; phone: string; email: string; role: Role }
interface State {
  user: User | null;
  authReady: boolean; // la session Supabase a-t-elle été vérifiée ?
  lang: Lang;
  theme: Theme;
  city: City;
  locPref: LocPref;
  favorites: string[];
  myRatings: Record<string, number>; // id de fiche -> ma note (1 à 5)
  downloads: Record<string, string>; // id -> date de téléchargement
  lastSync: string;
  providers: Provider[]; // adresses (Supabase, avec repli statique)
  pendingDeletion: Provider[]; // fiches dont la suppression attend l'administrateur (masquées aux voyageurs)
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
  user: null, authReady: !isSupabaseConfigured, lang: 'fr', theme: 'system', city: 'guangzhou', locPref: 'ask', favorites: ['baiyun', 'jinyuan', 'alnour', 'sinodakar'], myRatings: {},
  downloads: { baiyun: '18 sept. 2026', jinyuan: '18 sept. 2026' }, lastSync: '19 sept. 2026, 09:12',
  providers: PROVIDERS, pendingDeletion: [],
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
  | { t: 'theme'; v: Theme }
  | { t: 'city'; v: City }
  | { t: 'locPref'; v: LocPref }
  | { t: 'fav'; id: string }
  | { t: 'dl'; id: string }
  | { t: 'rate'; id: string; stars: number } // repli local (Supabase non configuré)
  | { t: 'setMyRating'; id: string; stars: number | null }
  | { t: 'syncAll' }
  | { t: 'draft'; p: Proposal | null }
  | { t: 'saveDraft'; p: Proposal }
  | { t: 'submit'; p: Proposal }
  | { t: 'complement'; id: string; patch: Partial<Proposal> }
  | { t: 'decide'; id: string; status: Status; note: string }
  | { t: 'edit'; p: Proposal }
  | { t: 'setProviders'; v: Provider[] }
  | { t: 'localProvider'; p: Provider }
  | { t: 'localDeletion'; id: string; reason: string; by: string }
  | { t: 'localRestore'; id: string }
  | { t: 'localDelete'; id: string }
  | { t: 'localLog'; dec: Decision }
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
    case 'theme': return { ...s, theme: a.v };
    case 'city': return { ...s, city: a.v };
    case 'locPref': return { ...s, locPref: a.v };
    case 'fav': return { ...s, favorites: s.favorites.includes(a.id) ? s.favorites.filter((x) => x !== a.id) : [...s.favorites, a.id] };
    case 'rate': {
      const prevMine = s.myRatings[a.id];
      const providers = s.providers.map((p) => {
        if (p.id !== a.id) return p;
        const count = p.ratingCount ?? 0;
        const avg = p.ratingAvg ?? 0;
        const nextCount = prevMine === undefined ? count + 1 : count;
        const nextAvg = prevMine === undefined
          ? (avg * count + a.stars) / nextCount
          : nextCount > 0 ? (avg * count - prevMine + a.stars) / nextCount : a.stars;
        return { ...p, ratingAvg: Math.round(nextAvg * 100) / 100, ratingCount: nextCount };
      });
      return { ...s, providers, myRatings: { ...s.myRatings, [a.id]: a.stars } };
    }
    case 'setMyRating': {
      if (a.stars === null) { const { [a.id]: _drop, ...rest } = s.myRatings; return { ...s, myRatings: rest }; }
      return { ...s, myRatings: { ...s.myRatings, [a.id]: a.stars } };
    }
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
    case 'edit': return { ...s, proposals: s.proposals.map((x) => (x.id === a.p.id ? { ...x, ...a.p, status: x.status, date: x.date, feedback: x.feedback, author: x.author } : x)) };
    case 'decide': {
      const target = s.proposals.find((p) => p.id === a.id);
      const upd = (p: Proposal) => (p.id === a.id ? { ...p, status: a.status, feedback: a.note || p.feedback, date: 'Traitée le 20 sept.' } : p);
      const dec: Decision = {
        date: '20 sept. 2026, 16:10', proposalName: target?.name ?? '', cn: target?.cn ?? '', decision: a.status, note: a.note || '—',
        by: 'Agent Diaba', lastCheck: a.status === 'Publiée' ? '20 sept. 2026' : '—',
      };
      return { ...s, proposals: s.proposals.map(upd), decisions: [dec, ...s.decisions] };
    }
    case 'setProviders': return { ...s, providers: a.v.filter((x) => !x.deletionRequestedAt), pendingDeletion: a.v.filter((x) => x.deletionRequestedAt) };
    case 'localProvider': return { ...s, providers: s.providers.some((x) => x.id === a.p.id) ? s.providers.map((x) => (x.id === a.p.id ? a.p : x)) : [a.p, ...s.providers] };
    case 'localDeletion': {
      const t = s.providers.find((x) => x.id === a.id);
      return t ? { ...s, providers: s.providers.filter((x) => x.id !== a.id), pendingDeletion: [{ ...t, deletionRequestedAt: new Date().toISOString(), deletionRequestedBy: a.by, deletionReason: a.reason }, ...s.pendingDeletion] } : s;
    }
    case 'localRestore': {
      const t = s.pendingDeletion.find((x) => x.id === a.id);
      return t ? { ...s, pendingDeletion: s.pendingDeletion.filter((x) => x.id !== a.id), providers: [{ ...t, deletionRequestedAt: undefined, deletionRequestedBy: undefined, deletionReason: undefined }, ...s.providers] } : s;
    }
    case 'localLog': return { ...s, decisions: [a.dec, ...s.decisions] };
    case 'localDelete': return { ...s, providers: s.providers.filter((x) => x.id !== a.id), pendingDeletion: s.pendingDeletion.filter((x) => x.id !== a.id), favorites: s.favorites.filter((x) => x !== a.id) };
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
      const stored = JSON.parse(raw);
      const parsed = { ...initial, ...stored } as State;
      if (!stored.providers || stored.providers.length === 0) parsed.providers = PROVIDERS;
      if (!stored.categories || stored.categories.length === 0) parsed.categories = STATIC_CATEGORIES;
      if (!stored.cities || stored.cities.length === 0) parsed.cities = STATIC_CITIES;
      if (!stored.districts || stored.districts.length === 0) parsed.districts = STATIC_DISTRICTS;
      
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
  /** Enregistre les corrections de l'équipe ; renvoie un message d'erreur en cas d'échec. */
  edit: (p: Proposal) => Promise<string | null>;
  /** Fiches (équipe) : chaque fonction renvoie un message d'erreur, ou null si tout va bien. */
  saveProvider: (p: Provider) => Promise<string | null>;
  requestDeletion: (id: string, reason: string) => Promise<string | null>;
  restoreProvider: (id: string) => Promise<string | null>;
  removeProvider: (id: string) => Promise<string | null>;
  /** Recharge les taxonomies après une modification dans l'administration. */
  reloadTaxonomies: () => Promise<void>;
  /** Note (ou met à jour la note) du voyageur connecté pour une fiche. */
  rate: (id: string, stars: number) => Promise<string | null>;
  /** Charge la note déjà donnée par le voyageur connecté pour une fiche (Supabase uniquement). */
  loadMyRating: (id: string) => Promise<void>;
}
interface Ctx { s: State; d: React.Dispatch<Action>; api: ContribApi }
const C = createContext<Ctx>(null as unknown as Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [s, d] = useReducer(reducer, undefined, load);
  const sRef = useRef(s); sRef.current = s;

  // Applique le thème choisi (ou celui du système si « system ») sur <html>,
  // et suit les changements du système tant qu'aucun choix explicite n'est fait.
  useEffect(() => {
    const root = document.documentElement;
    if (s.theme !== 'system') { root.setAttribute('data-theme', s.theme); return; }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => root.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s.theme]);

  useEffect(() => {
    // On ne persiste pas les données rechargées depuis Supabase (providers,
    // proposals, decisions) ni la session (`user`, `authReady`).
    try {
      const base = {
        lang: s.lang, theme: s.theme, city: s.city, locPref: s.locPref, favorites: s.favorites, myRatings: s.myRatings,
        downloads: s.downloads, lastSync: s.lastSync, draft: s.draft, installDismissed: s.installDismissed,
        providers: s.providers, pendingDeletion: s.pendingDeletion, categories: s.categories, cities: s.cities, districts: s.districts, productTags: s.productTags
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

  /* Journal des décisions : événements sur les fiches (suppressions). */
  const logEvent = async (p: Provider, decision: Status, note: string) => {
    const by = sRef.current.user?.name ?? 'Équipe';
    if (!supabase) {
      const now = new Date();
      d({ t: 'localLog', dec: { date: now.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), proposalName: p.name, cn: p.cn, decision, note, by, lastCheck: '—' } });
      return;
    }
    await logProviderEvent(p.name, p.cn, decision, note, by);
    d({ t: 'setDecisions', v: await fetchDecisions() });
  };

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
    saveProvider: async (p) => {
      if (!supabase) { d({ t: 'localProvider', p }); return null; }
      const { error } = await saveProviderRow(p);
      if (error) return error;
      d({ t: 'setProviders', v: await fetchProviders() });
      return null;
    },
    requestDeletion: async (id, reason) => {
      const by = sRef.current.user?.name ?? 'Équipe';
      const t = sRef.current.providers.find((x) => x.id === id);
      if (!supabase) { d({ t: 'localDeletion', id, reason, by }); if (t) logEvent(t, 'Suppression demandée', reason || '—'); return null; }
      const { error } = await requestProviderDeletion(id, reason, by);
      if (error) return error;
      if (t) await logEvent(t, 'Suppression demandée', reason || '—');
      d({ t: 'setProviders', v: await fetchProviders() });
      return null;
    },
    restoreProvider: async (id) => {
      const t = sRef.current.pendingDeletion.find((x) => x.id === id);
      if (!supabase) { d({ t: 'localRestore', id }); if (t) logEvent(t, 'Suppression refusée', 'La fiche est conservée.'); return null; }
      const { error } = await cancelProviderDeletion(id);
      if (error) return error;
      if (t) await logEvent(t, 'Suppression refusée', 'La fiche est conservée.');
      d({ t: 'setProviders', v: await fetchProviders() });
      return null;
    },
    removeProvider: async (id) => {
      const t = sRef.current.pendingDeletion.find((x) => x.id === id) ?? sRef.current.providers.find((x) => x.id === id);
      const note = t?.deletionReason ? `Motif : ${t.deletionReason}` : 'Suppression directe par l’administrateur.';
      if (!supabase) { d({ t: 'localDelete', id }); if (t) logEvent(t, 'Fiche supprimée', note); return null; }
      const { error } = await deleteProvider(id);
      if (error) return error;
      if (t) await logEvent(t, 'Fiche supprimée', note);
      d({ t: 'setProviders', v: await fetchProviders() });
      return null;
    },
    edit: async (p) => {
      if (!supabase) { d({ t: 'edit', p }); return null; }
      try {
        const { error } = await updateProposalFields(p);
        if (error) return error;
        d({ t: 'setProposals', v: await fetchAllProposals() });
        return null;
      } catch (e) {
        return `Enregistrement impossible : ${(e as Error).message}`;
      }
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
    rate: async (id, stars) => {
      if (!supabase) { d({ t: 'rate', id, stars }); return null; }
      const { error } = await rateProvider(id, stars);
      if (error) return error;
      d({ t: 'setMyRating', id, stars });
      d({ t: 'setProviders', v: await fetchProviders() });
      return null;
    },
    loadMyRating: async (id) => {
      if (!supabase) return; // déjà en état local (persisté)
      const stars = await fetchMyRating(id);
      d({ t: 'setMyRating', id, stars });
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
