import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { joinPhone, normalizePhone } from '../src/lib/phone.ts';
import { isValidSecretCode, isWeakSecretCode, normalizeSecretCode } from '../src/lib/secretCode.ts';

const base = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, base), 'utf8');

const [access, auth, supabaseClient, ui, messagesText] = await Promise.all([
  read('src/pages/Access.tsx'),
  read('src/lib/auth.ts'),
  read('src/lib/supabase.ts'),
  read('src/ui.tsx'),
  read('src/i18n/messages.json'),
]);
const messages = JSON.parse(messagesText);

test('le code secret conserve uniquement 3 à 6 chiffres', () => {
  assert.equal(normalizeSecretCode(' 1+2 a3 '), '123');
  assert.equal(normalizeSecretCode('12-34 56 78'), '123456');
  assert.equal(isValidSecretCode('12'), false);
  assert.equal(isValidSecretCode('274'), true);
  assert.equal(isValidSecretCode('385196'), true);
  assert.equal(isValidSecretCode('1234567'), false);
  assert.equal(isWeakSecretCode('000'), true);
  assert.equal(isWeakSecretCode('1111'), true);
  assert.equal(isWeakSecretCode('123'), true);
  assert.equal(isWeakSecretCode('654321'), true);
  assert.equal(isWeakSecretCode('274'), false);
});

test('la normalisation produit un E.164 valide selon le pays sélectionné', () => {
  assert.equal(normalizePhone('77 123 45 67', 'SN'), '+221771234567');
  assert.equal(normalizePhone('06 12 34 56 78', 'FR'), '+33612345678');
  assert.equal(normalizePhone('02 1234 5678', 'IT'), '+390212345678');
  assert.equal(normalizePhone('(202) 555-0123', 'US'), '+12025550123');
  assert.equal(normalizePhone('+33 6 12 34 56 78', 'SN'), '+33612345678');
  assert.equal(normalizePhone('0033 6 12 34 56 78', 'SN'), '+33612345678');
  assert.equal(normalizePhone('123', 'SN'), '');
  assert.equal(normalizePhone('+1234567890123456', 'US'), '');
});

test('joinPhone conserve la compatibilité des indicatifs existants', () => {
  assert.equal(joinPhone('+221', '77 123 45 67'), '+221771234567');
  assert.equal(joinPhone('+33', '06 12 34 56 78'), '+33612345678');
  assert.equal(joinPhone('+39', '02 1234 5678'), '+390212345678');
  assert.equal(joinPhone('+1', '(202) 555-0123'), '+12025550123');
  assert.equal(joinPhone('+221', '+33 6 12 34 56 78'), '+33612345678');
});

test('inscription et connexion utilisent indicatif, téléphone et code secret simple', () => {
  assert.match(access, /const \[dial, setDial\] = useState\('\+221'\)/);
  assert.match(access, /Code secret/);
  assert.match(access, /Confirmer le code secret/);
  assert.match(access, /De 3 à 6 chiffres/);
  assert.match(access, /inputMode="numeric"/);
  assert.match(access, /joinPhone\(dial,/);
  assert.doesNotMatch(access, /id="mail" label=.*Adresse e-mail \(facultatif\)/);
  assert.match(ui, /inputMode\?:/);
  assert.match(ui, /maxLength\?:/);
});

test('le navigateur délègue le PIN à l’API serveur sans fabriquer le mot de passe technique', () => {
  assert.match(auth, /\/api\/auth-pin/);
  assert.doesNotMatch(auth, /secretCodePassword/);
  assert.doesNotMatch(auth, /begin_phone_login|clear_phone_login_limit/);
  assert.doesNotMatch(auth, /supabase\.auth\.signInWithPassword/);
  assert.doesNotMatch(auth, /supabase\.auth\.signUp/);
});

test('la connexion historique par e-mail et ancien mot de passe reste séparée', () => {
  assert.match(access, /legacyEmail/);
  assert.match(access, /Adresse e-mail/);
  assert.match(access, /Ancien mot de passe/);
  assert.match(auth, /legacyEmail/);
});

test('la session reste enregistrée et renouvelée sur le navigateur', () => {
  assert.match(supabaseClient, /persistSession:\s*true/);
  assert.match(supabaseClient, /autoRefreshToken:\s*true/);
  assert.match(access, /Vous resterez connecté sur cet appareil/);
});


test('les libellés simplifiés existent dans toutes les langues', () => {
  const keys = [
    'Code secret',
    'Confirmer le code secret',
    'De 3 à 6 chiffres.',
    'Le code secret doit contenir entre 3 et 6 chiffres.',
    'Choisissez un code moins facile à deviner.',
    'Les deux codes secrets ne correspondent pas.',
    'Le numéro ou le code secret n’est pas correct.',
    'Afficher le code secret',
    'Masquer le code secret',
    'Ancien mot de passe',
    'Utiliser mon code secret',
    'J’utilise encore un ancien mot de passe',
    'Code secret oublié ?',
    'Nouveau code secret',
    'Code secret modifié',
    'Vous pouvez maintenant vous connecter avec votre nouveau code secret.',
    'Choisissez un nouveau code secret de 3 à 6 chiffres.',
    'Enregistrer le code secret',
    'Code secret actuel ou ancien mot de passe',
    'Changer le code secret',
    'Le code secret actuel est incorrect.',
    'Vérifiez votre adresse e-mail et votre ancien mot de passe.',
  ];
  for (const key of keys) {
    assert.ok(messages[key], `traduction manquante : ${key}`);
    for (const locale of ['en', 'zh', 'ar']) {
      assert.equal(typeof messages[key][locale], 'string', `${key} (${locale})`);
      assert.ok(messages[key][locale].trim(), `${key} (${locale}) vide`);
    }
  }
});
