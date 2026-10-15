import { Outlet } from 'react-router-dom';
import { useI18n } from './i18n';
import { MODULE_CATALOG, type ModuleKey, useModules } from './lib/modules';
import { Icon, Screen, TopBar } from './ui';

export function ModuleGate({ module }: { module: ModuleKey }) {
  const { tr } = useI18n();
  const { settings, ready } = useModules();
  if (!ready) return <div className="center-screen" style={{ minHeight: '60vh' }} role="status">{tr('Chargement…')}</div>;
  if (!settings[module]) {
    const title = MODULE_CATALOG.find((item) => item.key === module)?.label ?? 'Module';
    return (
      <Screen>
        <TopBar title={tr(title)} back="/recherche" />
        <div className="main" style={{ paddingTop: 18 }}>
          <div className="notice info" role="status">
            <Icon name="info" size={20} />
            <span>{tr('Ce module est temporairement indisponible. Vos données sont conservées.')}</span>
          </div>
        </div>
      </Screen>
    );
  }
  return <Outlet />;
}
