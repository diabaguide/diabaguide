import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Field, Icon, Logo, Photo, Screen, TopBar } from '../ui';
import { useStore, type Lang } from '../store';
import { supabase } from '../lib/supabase';
import { sendPasswordReset, signIn, signOut, signUp, updatePassword } from '../lib/auth';

const LANGS: { v: Lang; l: string }[] = [{ v: 'fr', l: 'Français' }, { v: 'en', l: 'English' }, { v: 'zh', l: '中文' }];
export function LangSwitch({ dark = false }: { dark?: boolean }) {
  const { s, d } = useStore();
  return (
    <div className="seg" role="group" aria-label="Langue" style={dark ? undefined : undefined}>
      {LANGS.map((x) => (
        <button key={x.v} type="button" className={s.lang === x.v ? 'on' : ''} aria-pressed={s.lang === x.v} onClick={() => d({ t: 'lang', v: x.v })}>
          {s.lang === x.v && '✓ '}{x.l}
        </button>
      ))}
    </div>
  );
}

export function Welcome() {
  return (
    <Screen nav={false}>
      <div className="hero">
        <LangSwitch dark />
        <Logo height={56} tail="GUIDE" />
        <div className="gold-rule" />
        <h1 className="display" style={{ fontSize: 34 }}>Vos adresses professionnelles en Chine</h1>
        <p>Fournisseurs en gros, hôtels, restaurants, transporteurs et transitaires à Guangzhou et Shenzhen, pour préparer vos déplacements d’affaires.</p>
        <Photo label="Marché de gros, Guangzhou" h={150} round={16} />
      </div>
      <div className="main" style={{ paddingTop: 26 }}>
        {[['shield', 'Des adresses relues et vérifiées par l’équipe Diaba'], ['pin', 'L’adresse en chinois, prête à montrer au chauffeur'], ['download', 'Vos fiches favorites, même sans connexion']].map(([i, t]) => (
          <div className="benefit" key={t}><span className="ico"><Icon name={i as 'shield'} /></span><span>{t}</span></div>
        ))}
      </div>
      <div className="stack" style={{ padding: '0 20px 20px' }}>
        <Button to="/inscription">Créer mon compte</Button>
        <Button to="/connexion" kind="s">Se connecter</Button>
        <p className="small muted center">Un compte est nécessaire pour consulter les adresses. Version de démonstration.</p>
      </div>
    </Screen>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Signup() {
  const { d } = useStore();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', pw: '', terms: false });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const errs = {
    name: f.name.trim() ? null : 'Saisissez votre nom.',
    email: EMAIL.test(f.email) ? null : 'Saisissez une adresse e-mail complète, par exemple nom@exemple.com.',
    pw: f.pw.length >= 8 ? null : 'Le mot de passe doit contenir au moins 8 caractères.',
    terms: f.terms ? null : 'Acceptez les conditions pour créer votre compte.',
  };
  const count = Object.values(errs).filter(Boolean).length;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    setApiErr(null);
    setInfo(null);
    if (count) return;
    if (!supabase) {
      d({ t: 'login', user: { name: f.name, email: f.email, role: 'traveler' } });
      nav('/inscription/confirmation');
      return;
    }
    setBusy(true);
    const res = await signUp(f.name, f.email, f.pw);
    setBusy(false);
    if (res.error) { setApiErr(res.error); return; }
    if (res.needsConfirm) {
      setInfo('Compte créé. Vérifiez votre boîte e-mail pour confirmer votre inscription, puis connectez-vous.');
      return;
    }
    // La session est ouverte : le store se synchronise via onAuthStateChange.
    nav('/inscription/confirmation');
  };
  const show = (k: keyof typeof errs) => (tried ? errs[k] : null);
  return (
    <Screen nav={false}>
      <TopBar title="Créer mon compte" back="/" />
      <form className="main" onSubmit={submit} noValidate>
        {tried && count > 0 && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{count} information{count > 1 ? 's sont' : ' est'} à corriger avant de continuer.</span></div>}
        {apiErr && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{apiErr}</span></div>}
        {info && <div role="status" className="notice"><Icon name="check" size={20} sw={2} /><span>{info}</span></div>}
        <p className="muted small">Un compte est nécessaire pour consulter les adresses et en proposer. Les champs marqués * sont obligatoires.</p>
        <Field id="nom" label="Nom complet" value={f.name} onChange={(v) => setF({ ...f, name: v })} req error={show('name')} />
        <Field id="mail" label="Adresse e-mail" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} req error={show('email')} />
        <Field id="mdp" label="Mot de passe" type="password" value={f.pw} onChange={(v) => setF({ ...f, pw: v })} req hint="Au moins 8 caractères." error={show('pw')} />
        <div>
          <label className="check">
            <input type="checkbox" checked={f.terms} onChange={(e) => setF({ ...f, terms: e.target.checked })} />
            <span>J’accepte les conditions d’utilisation et la politique de confidentialité de Diaba Guide.</span>
          </label>
          {show('terms') && <div className="error"><Icon name="alert" size={16} sw={2} /><span>{errs.terms}</span></div>}
        </div>
        <Button type="submit" disabled={busy}>{busy ? 'Création…' : 'Créer mon compte'}</Button>
        <p className="center">Déjà inscrit ? <Link className="link" to="/connexion">Se connecter</Link></p>
      </form>
    </Screen>
  );
}

export function SignupDone() {
  return (
    <Screen nav={false}>
      <div className="main" style={{ padding: '40px 24px 32px' }}>
        <div className="center-screen">
          <span className="bigcheck"><Icon name="check" size={48} sw={2.6} /></span>
          <h1 className="display" style={{ fontSize: 32 }}>Votre compte est créé</h1>
          <p className="muted">Bienvenue sur Diaba Guide. Vous pouvez maintenant consulter les adresses de Guangzhou et de Shenzhen.</p>
        </div>
        <Button to="/accueil">Découvrir les adresses</Button>
      </div>
    </Screen>
  );
}

export function Login() {
  const { d } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!EMAIL.test(email) || !pw) { setErr('Vérifiez votre adresse e-mail et votre mot de passe.'); return; }
    if (!supabase) {
      // Repli démo : tout compte est accepté ; « equipe » ouvre l’espace équipe.
      const team = email.toLowerCase().includes('equipe');
      d({ t: 'login', user: { name: team ? 'Agent Diaba' : email.split('@')[0], email, role: team ? 'team' : 'traveler' } });
      nav(next ?? (team ? '/equipe' : '/accueil'), { replace: true });
      return;
    }
    setBusy(true);
    const res = await signIn(email, pw);
    setBusy(false);
    if (res.error || !res.user) { setErr(res.error ?? 'Connexion impossible.'); return; }
    // Le store se synchronise via onAuthStateChange ; on navigue selon le rôle.
    nav(next ?? (res.user.role === 'team' ? '/equipe' : '/accueil'), { replace: true });
  };
  return (
    <Screen nav={false}>
      <TopBar title="Se connecter" back="/" />
      <form className="main" onSubmit={submit} noValidate style={{ gap: 20 }}>
        {next && next.startsWith('/adresses/') && (
          <div className="notice warn"><Icon name="share" size={22} /><div><strong>Une fiche vous a été partagée</strong><div className="small">Connectez-vous pour la consulter. Un compte est nécessaire.</div></div></div>
        )}
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{err}</span></div>}
        <Field id="mail" label="Adresse e-mail" type="email" value={email} onChange={setEmail} placeholder="nom@exemple.com" />
        <Field id="mdp" label="Mot de passe" type="password" value={pw} onChange={setPw} />
        <div style={{ textAlign: 'right' }}><Link className="link" to="/mot-de-passe">Mot de passe oublié ?</Link></div>
        <Button type="submit" disabled={busy}>{busy ? 'Connexion…' : (next?.startsWith('/adresses/') ? 'Se connecter et ouvrir la fiche' : 'Se connecter')}</Button>
        <p className="center">Pas encore de compte ? <Link className="link" to="/inscription">Créer mon compte</Link></p>
        {!supabase && <p className="small muted center">Démo : toute adresse valide est acceptée ; une adresse contenant « equipe » ouvre l’espace équipe.</p>}
      </form>
    </Screen>
  );
}

export function Forgot() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const send = async () => {
    if (!EMAIL.test(email)) return;
    setBusy(true);
    // On ignore volontairement l'éventuelle erreur : message neutre pour ne pas
    // révéler si un compte existe pour cette adresse.
    if (supabase) await sendPasswordReset(email);
    setBusy(false);
    setSent(true);
  };
  return (
    <Screen nav={false}>
      <TopBar title="Mot de passe oublié" back="/connexion" />
      <div className="main" style={{ gap: 18 }}>
        {!sent ? (
          <>
            <p className="muted">Saisissez l’adresse e-mail de votre compte. Nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
            <Field id="mail" label="Adresse e-mail" type="email" value={email} onChange={setEmail} placeholder="nom@exemple.com" />
            <Button icon="send" onClick={send} disabled={busy}>{busy ? 'Envoi…' : 'Envoyer le lien'}</Button>
          </>
        ) : (
          <>
            <div role="status" className="card center-screen" style={{ borderColor: 'var(--ok)', padding: '28px 20px', flex: 'none' }}>
              <span className="bigcheck" style={{ width: 64, height: 64, border: 0 }}><Icon name="check" size={34} sw={2.6} /></span>
              <div className="display" style={{ fontSize: 24 }}>Lien envoyé</div>
              <div className="muted">Si un compte existe pour cette adresse, vous recevrez un e-mail dans quelques minutes. Pensez à vérifier vos courriers indésirables.</div>
            </div>
            <Button to="/connexion" kind="s">Retour à la connexion</Button>
          </>
        )}
      </div>
    </Screen>
  );
}

/* Page atterrissage du lien de réinitialisation : Supabase ouvre une session
   de récupération (token dans l'URL) puis on demande le nouveau mot de passe. */
export function ResetPassword() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null); // null = en cours de détection

  useEffect(() => {
    if (!supabase) { setReady(false); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setReady(!!data.session); });
    const { data: sub } = supabase.auth.onAuthStateChange((e, session) => {
      if (!alive) return;
      if (e === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) { setErr('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    if (pw !== pw2) { setErr('Les deux mots de passe ne correspondent pas.'); return; }
    setBusy(true);
    const res = await updatePassword(pw);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    await signOut(); // on ferme la session de récupération : reconnexion avec le nouveau mot de passe
    setDone(true);
  };

  return (
    <Screen nav={false}>
      <TopBar title="Nouveau mot de passe" back="/connexion" />
      <div className="main" style={{ gap: 18 }}>
        {done ? (
          <>
            <div role="status" className="card center-screen" style={{ borderColor: 'var(--ok)', padding: '28px 20px', flex: 'none' }}>
              <span className="bigcheck" style={{ width: 64, height: 64, border: 0 }}><Icon name="check" size={34} sw={2.6} /></span>
              <div className="display" style={{ fontSize: 24 }}>Mot de passe modifié</div>
              <div className="muted">Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</div>
            </div>
            <Button to="/connexion">Se connecter</Button>
          </>
        ) : ready === false ? (
          <>
            <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>Ce lien de réinitialisation est invalide ou a expiré.</span></div>
            <Button to="/mot-de-passe" kind="s">Demander un nouveau lien</Button>
          </>
        ) : ready === null ? (
          <p className="muted" role="status" aria-live="polite">Vérification du lien…</p>
        ) : (
          <form onSubmit={submit} noValidate className="stack" style={{ gap: 18 }}>
            <p className="muted">Choisissez un nouveau mot de passe pour votre compte.</p>
            {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{err}</span></div>}
            <Field id="np" label="Nouveau mot de passe" type="password" value={pw} onChange={setPw} req hint="Au moins 8 caractères." />
            <Field id="np2" label="Confirmer le mot de passe" type="password" value={pw2} onChange={setPw2} req />
            <Button type="submit" disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</Button>
          </form>
        )}
      </div>
    </Screen>
  );
}
