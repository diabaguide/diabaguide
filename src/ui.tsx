import { useI18n } from './i18n';
import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { photoUrl, type PhotoBucket } from './lib/photos';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { ICONS, type IconName } from './icons';
import { STATUS_STYLE, type Status } from './data';

export function Icon({ name, size = 22, sw = 1.9 }: { name: IconName; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true" className={name === 'chevL' || name === 'chevR' ? 'icon icon-dir' : 'icon'} dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
  );
}

export function Logo({ height = 40, tail }: { height?: number; tail?: string }) {
  const { tr } = useI18n();
  return (
    <span className="logo-pill">
      <img src="/logo.png" alt={tr("Diaba")} height={height} width={Math.round((height * 776) / 204)} />
      {tail && <span className="logo-tail">{tr(tail)}</span>}
    </span>
  );
}

/* Photo privée du bucket Supabase : URL temporaire ; emplacement rayé si absente ou illisible. */
export function StoredPhoto({ path, label, h, w, round, bucket }: { path?: string; label: string; h?: number; w?: number | string; round?: number; bucket?: PhotoBucket }) {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    let live = true;
    setUrl(undefined);
    if (path) photoUrl(path, 3600, bucket).then((u) => { if (live && u) setUrl(u); });
    return () => { live = false; };
  }, [path, bucket]);
  return <Photo label={label} h={h} w={w} round={round} src={url} />;
}

/* Emplacement photo :remplacer par <img> quand les visuels sont disponibles. */
export function Photo({ label, h = 120, w, round = 14, src }: { label: string; h?: number; w?: number | string; round?: number; src?: string }) {
  const { tr } = useI18n();
  const small = h < 110;
  if (src) {
    return (
      <div role="img" aria-label={label} className="photo" style={{ height: h, width: w ?? '100%', borderRadius: round, backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        {!small && <span className="photo-cap"><Icon name="image" size={14} />{tr(label)}</span>}
      </div>
    );
  }
  return (
    <div role="img" aria-label={tr(`Photo à fournir : ${label}`)} className="photo" style={{ height: h, width: w ?? '100%', borderRadius: round }}>
      {small ? <Icon name="image" size={26} /> : <span className="photo-cap"><Icon name="image" size={14} />{tr(label)}</span>}
    </div>
  );
}

type Kind = 'p' | 's' | 'g' | 't' | 'd';
interface BtnProps {
  kind?: Kind; icon?: IconName; to?: string; href?: string; full?: boolean; children: ReactNode;
  onClick?: () => void; type?: ButtonHTMLAttributes<HTMLButtonElement>['type']; disabled?: boolean; className?: string;
}
export function Button({ kind = 'p', icon, to, href, full = true, children, onClick, type = 'button', disabled, className = '' }: BtnProps) {
  const cls = `btn btn-${kind} ${full ? 'btn-full' : ''} ${className}`;
  const inner = <>{icon && <Icon name={icon} size={20} />}<span>{children}</span></>;
  if (to) return <Link to={to} className={cls} onClick={onClick}>{inner}</Link>;
  if (href) return <a href={href} className={cls} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">{inner}</a>;
  return <button type={type} className={cls} onClick={onClick} disabled={disabled}>{inner}</button>;
}

export function Field(p: {
  id: string; label: string; value: string; onChange?: (v: string) => void; type?: string; req?: boolean;
  hint?: string; error?: string | null; placeholder?: string;
}) {
  const { tr } = useI18n();
  return (
    <div className="field">
      <label htmlFor={p.id}>{tr(p.label)}{p.req && <span className="req" aria-hidden="true"> *</span>}</label>
      <input id={p.id} type={p.type ?? 'text'} value={p.value} placeholder={tr(p.placeholder)} aria-invalid={!!p.error}
        aria-describedby={p.error ? p.id + '-err' : undefined} className={p.error ? 'err' : ''} onChange={(e) => p.onChange?.(e.target.value)} />
      {p.hint && !p.error && <div className="hint">{tr(p.hint)}</div>}
      {p.error && <div id={p.id + '-err'} className="error"><Icon name="alert" size={16} sw={2} /><span>{tr(p.error)}</span></div>}
    </div>
  );
}
export function TextArea(p: { id: string; label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; hint?: string }) {
  const { tr } = useI18n();
  return (
    <div className="field">
      <label htmlFor={p.id}>{tr(p.label)}</label>
      <textarea id={p.id} rows={p.rows ?? 3} value={p.value} placeholder={tr(p.placeholder)} onChange={(e) => p.onChange(e.target.value)} />
      {p.hint && <div className="hint">{tr(p.hint)}</div>}
    </div>
  );
}
export function Select<T extends string>(p: { id: string; label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; req?: boolean }) {
  const { tr } = useI18n();
  return (
    <div className="field">
      <label htmlFor={p.id}>{tr(p.label)}{p.req && <span className="req" aria-hidden="true"> *</span>}</label>
      <select id={p.id} value={p.value} onChange={(e) => p.onChange(e.target.value as T)}>
        {p.options.map((o) => <option key={o.v} value={o.v}>{tr(o.l)}</option>)}
      </select>
    </div>
  );
}
export function RadioCard(p: { name: string; label: string; checked: boolean; onChange: () => void; icon?: IconName; sub?: string }) {
  const { tr } = useI18n();
  return (
    <label className={`radio ${p.checked ? 'on' : ''}`}>
      <input type="radio" name={p.name} checked={p.checked} onChange={p.onChange} />
      {p.icon && <Icon name={p.icon} size={20} />}
      <span>{tr(p.label)}{p.sub && <small>{tr(p.sub)}</small>}</span>
    </label>
  );
}
export function Chip({ on, children, icon, onClick, to }: { on?: boolean; children: ReactNode; icon?: IconName; onClick?: () => void; to?: string }) {
  const inner = <>{on && <Icon name="check" size={16} sw={2.4} />}{icon && <Icon name={icon} size={18} />}{children}</>;
  if (to) return <Link to={to} className={`chip ${on ? 'on' : ''}`}>{inner}</Link>;
  return <button type="button" className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>{inner}</button>;
}
export function Tag({ children, icon, tone = 'info' }: { children: ReactNode; icon?: IconName; tone?: 'info' | 'ok' | 'warn' | 'fav' | 'muted' }) {
  return <span className={`tag tag-${tone}`}>{icon && <Icon name={icon} size={15} sw={2} />}{children}</span>;
}
export function Verified({ date }: { date?: string }) {
  const { tr } = useI18n();
  return <span className="verified"><Icon name="shield" size={16} sw={2} />{tr("Vérifié par Diaba")}{tr(date ? ` · ${date}` : '')}</span>;
}
export function StatusBadge({ status, big }: { status: Status; big?: boolean }) {
  const { tr } = useI18n();
  const st = STATUS_STYLE[status];
  return <span className={`status ${big ? 'big' : ''}`} style={{ background: st.bg, color: st.fg }}><Icon name={st.icon} size={16} sw={2.2} />{tr(status)}</span>;
}
export const NotProvided = () => { const { tr } = useI18n(); return (<span className="np">{tr("Non renseigné")}</span>); };
export function KV({ k, children }: { k: string; children?: ReactNode }) {
  const { tr } = useI18n();
  return <div className="kv"><span>{tr(k)}</span><div>{children ?? <NotProvided />}</div></div>;
}
export function Section({ title, icon, children }: { title: string; icon?: IconName; children: ReactNode }) {
  const { tr } = useI18n();
  return <section className="card sec"><h2>{icon && <Icon name={icon} size={20} />}{tr(title)}</h2>{children}</section>;
}
export const DemoNote = () => { const { tr } = useI18n(); return (<div className="demo"><Icon name="info" size={16} /><span>{tr("Données de démonstration : noms, adresses et numéros fictifs.")}</span></div>); };

export function TopBar({ title, back, right }: { title: string; back?: string | -1; right?: ReactNode }) {
  const { tr } = useI18n();
  const nav = useNavigate();
  return (
    <header className="topbar">
      {back !== undefined && (
        <button type="button" className="iconbtn" aria-label={tr("Retour")} onClick={() => (back === -1 ? nav(-1) : nav(back))}><Icon name="chevL" size={24} sw={2.2} /></button>
      )}
      <h1>{tr(title)}</h1>
      {right}
    </header>
  );
}

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/accueil', label: 'Accueil', icon: 'home' },
  { to: '/recherche', label: 'Explorer', icon: 'compass' },
  { to: '/favoris', label: 'Favoris', icon: 'heart' },
  { to: '/contributions', label: 'Contributions', icon: 'pen' },
  { to: '/profil', label: 'Profil', icon: 'user' },
];
export function BottomNav() {
  const { tr } = useI18n();
  return (
    <nav className="bottomnav" aria-label={tr("Navigation principale")}>
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name={n.icon} size={24} /><span>{tr(n.label)}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Screen({ children, nav = true, className = '' }: { children: ReactNode; nav?: boolean; className?: string }) {
  return (
    <div className="phone">
      <div className={`screen ${className}`}>{children}</div>
      {nav && <BottomNav />}
    </div>
  );
}
