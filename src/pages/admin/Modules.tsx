import { useState } from 'react';
import { useI18n } from '../../i18n';
import { CORE_SEARCH_ALWAYS_ON, MODULE_CATALOG, type ModuleKey, useModules } from '../../lib/modules';
import { Button, Icon } from '../../ui';

export function ModuleSettingsPage() {
  const { tr } = useI18n();
  const { settings, ready, canManage, error, setEnabled } = useModules();
  const [busy, setBusy] = useState<ModuleKey | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = async (key: ModuleKey) => {
    setNotice(null);
    setBusy(key);
    const result = await setEnabled(key, !settings[key]);
    setBusy(null);
    if (result.error) setNotice(result.error);
    else setNotice(settings[key] ? 'Module désactivé. Vos données sont conservées.' : 'Module activé.');
  };

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{tr('Gestion des modules')}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{tr('Activez ou mettez en pause les services complémentaires, sans supprimer leurs données.')}</div>
        </div>
      </header>
      <div className="admin-body stack">
        <section className="card stack" style={{ gap: 8 }}>
          <div className="row"><Icon name="search" size={22} /><h2 style={{ fontSize: 17, margin: 0 }}>{tr('Recherche de lieux')}</h2></div>
          <p className="small muted" style={{ margin: 0 }}>{tr('Marchés, hôtels et restaurants : le cœur de Diaba Guide reste toujours actif et ne peut pas être désactivé.')}</p>
          {CORE_SEARCH_ALWAYS_ON && <span className="tag tag-ok" style={{ alignSelf: 'flex-start' }}>{tr('Toujours actif')}</span>}
        </section>

        <section className="stack" aria-labelledby="modules-optionnels-title">
          <h2 id="modules-optionnels-title" className="display" style={{ fontSize: 19 }}>{tr('Modules complémentaires')}</h2>
          {error && <div className="notice warn" role="alert"><Icon name="info" size={20} /><span>{tr(error)}</span></div>}
          {notice && <div className="notice" role="status"><Icon name="info" size={20} /><span>{tr(notice)}</span></div>}
          {!ready && <div className="notice info" role="status"><Icon name="info" size={20} /><span>{tr('Chargement…')}</span></div>}
          {ready && !canManage && !error && <div className="notice warn" role="status"><Icon name="info" size={20} /><span>{tr('Les réglages seront disponibles après connexion à la base de données.')}</span></div>}
          {MODULE_CATALOG.map((module) => {
            const enabled = settings[module.key];
            const saving = busy === module.key;
            return (
              <article key={module.key} className="card row module-setting-card" style={{ justifyContent: 'space-between', gap: 14 }}>
                <div className="stack" style={{ gap: 4 }}>
                  <h3 style={{ fontSize: 16, margin: 0 }}>{tr(module.label)}</h3>
                  <p className="small muted" style={{ margin: 0 }}>{tr(module.description)}</p>
                  <span className={`tag ${enabled ? 'tag-ok' : 'tag-warn'}`} style={{ alignSelf: 'flex-start' }}>{tr(enabled ? 'Actif' : 'En pause')}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={`${tr(enabled ? 'Désactiver' : 'Activer')} ${tr(module.label)}`}
                  className="module-toggle"
                  disabled={!ready || !canManage || busy !== null}
                  onClick={() => void toggle(module.key)}
                >
                  <span className="sr">{tr(enabled ? 'Désactiver' : 'Activer')}</span>
                  <span aria-hidden="true" className="module-toggle-knob" />
                </button>
                {saving && <span className="sr" role="status">{tr('Enregistrement…')}</span>}
              </article>
            );
          })}
          <Button kind="t" icon="chevL" to="/equipe" full={false}>{tr('Retour au tableau de bord')}</Button>
        </section>
      </div>
    </>
  );
}
