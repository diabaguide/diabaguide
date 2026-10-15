import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export const MODULE_CATALOG = [
  { key: 'shopping', label: 'Mes Achats', description: 'Créer et gérer ses listes d’achats.' },
  { key: 'shipments', label: 'Mes Envois', description: 'Annoncer des colis et consulter leur suivi.' },
  { key: 'contributions', label: 'Contributions', description: 'Proposer une adresse ou signaler une correction.' },
  { key: 'announcements', label: 'Annonces de Diaba', description: 'Afficher les annonces de service sur l’accueil.' },
] as const;

export type ModuleKey = (typeof MODULE_CATALOG)[number]['key'];
export type ModuleSettings = Record<ModuleKey, boolean>;

// Le catalogue et la recherche des lieux ne figurent pas dans cette liste :
// le cœur de Diaba Guide est toujours actif et n’est pas désactivable.
export const CORE_SEARCH_ALWAYS_ON = true;
export const DEFAULT_MODULE_SETTINGS: ModuleSettings = {
  shopping: false,
  shipments: true,
  contributions: true,
  announcements: true,
};

const CACHE_KEY = 'diaba-module-settings-v1';
const moduleKeys = new Set<string>(MODULE_CATALOG.map(({ key }) => key));

type ModuleContextValue = {
  settings: ModuleSettings;
  ready: boolean;
  canManage: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setEnabled: (key: ModuleKey, enabled: boolean) => Promise<{ error?: string }>;
};

const ModuleContext = createContext<ModuleContextValue | null>(null);

function readCache(): ModuleSettings {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_MODULE_SETTINGS;
    const next = { ...DEFAULT_MODULE_SETTINGS };
    for (const [key, value] of Object.entries(parsed)) {
      if (moduleKeys.has(key) && typeof value === 'boolean') next[key as ModuleKey] = value;
    }
    return next;
  } catch {
    return DEFAULT_MODULE_SETTINGS;
  }
}

function saveCache(settings: ModuleSettings) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(settings)); } catch { /* stockage indisponible */ }
}

export function ModuleProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ModuleSettings>(readCache);
  const [ready, setReady] = useState(!supabase);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) { setReady(true); setCanManage(false); return; }
    try {
      const { data, error: queryError } = await supabase.from('module_settings').select('module_key, enabled');
      if (queryError || !data) {
        setError('Les réglages des modules ne sont pas accessibles. La migration de configuration doit être appliquée.');
        setCanManage(false);
        setReady(true);
        return;
      }
      const next = { ...DEFAULT_MODULE_SETTINGS };
      for (const row of data as { module_key: string; enabled: boolean }[]) {
        if (moduleKeys.has(row.module_key) && typeof row.enabled === 'boolean') next[row.module_key as ModuleKey] = row.enabled;
      }
      setSettings(next);
      saveCache(next);
      setError(null);
      setCanManage(true);
      setReady(true);
    } catch {
      setError('Les réglages des modules ne sont pas accessibles. La migration de configuration doit être appliquée.');
      setCanManage(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const setEnabled = useCallback(async (key: ModuleKey, enabled: boolean) => {
    if (!supabase) return { error: 'Configuration indisponible sans connexion à la base de données.' };
    try {
      const { error: rpcError } = await supabase.rpc('set_module_enabled', { p_module_key: key, p_enabled: enabled });
      if (rpcError) {
        const message = /administrateur principal/i.test(rpcError.message)
          ? 'Seul l’administrateur principal peut gérer les modules.'
          : 'Le réglage n’a pas pu être enregistré. Réessayez.';
        return { error: message };
      }
      const { data, error: readError } = await supabase.from('module_settings').select('enabled').eq('module_key', key).maybeSingle();
      if (readError || data?.enabled !== enabled) {
        await refresh();
        return { error: 'Le réglage n’a pas pu être confirmé. Réessayez.' };
      }
      setSettings((current) => {
        const next = { ...current, [key]: data.enabled };
        saveCache(next);
        return next;
      });
      return {};
    } catch {
      await refresh();
      return { error: 'Le réglage n’a pas pu être enregistré. Réessayez.' };
    }
  }, [refresh]);

  const value = useMemo(() => ({ settings, ready, canManage, error, refresh, setEnabled }), [settings, ready, canManage, error, refresh, setEnabled]);
  return <ModuleContext.Provider value={value}>{children}</ModuleContext.Provider>;
}

export function useModules() {
  const value = useContext(ModuleContext);
  if (!value) throw new Error('useModules doit être utilisé dans ModuleProvider.');
  return value;
}
