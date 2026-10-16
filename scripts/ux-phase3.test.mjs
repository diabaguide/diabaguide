import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { lienPartageWhatsApp, textePartageFiche, langueVoix } from '../src/lib/voixPartage.ts';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('partage WhatsApp : nom, adresse chinoise et lien sont tous présents', () => {
  const p = { name: 'Restaurant Test', addrCn: '广州市越秀区测试路 1 号' };
  const texte = textePartageFiche(p, 'https://www.diabaguide.com/adresses/test');
  assert.match(texte, /Restaurant Test/);
  assert.match(texte, /广州市越秀区测试路 1 号/);
  assert.match(texte, /https:\/\/www\.diabaguide\.com\/adresses\/test/);
  const lien = lienPartageWhatsApp(p, 'https://www.diabaguide.com/adresses/test');
  assert.match(lien, /^https:\/\/wa\.me\/\?text=/);
  assert.ok(decodeURIComponent(lien).includes('广州市越秀区测试路 1 号'));
});

test('partage WhatsApp : adresse absente non remplacée par une invention', () => {
  const texte = textePartageFiche({ name: 'Lieu test', addrCn: '' }, 'https://x.test/f');
  assert.match(texte, /Lieu test/);
  assert.match(texte, /https:\/\/x\.test\/f/);
  assert.doesNotMatch(texte, /Adresse chinoise:/);
});

test('langueVoix : français et chinois mandarin', () => {
  assert.equal(langueVoix('fr'), 'fr-FR');
  assert.equal(langueVoix('zh'), 'zh-CN');
  assert.equal(langueVoix('ar'), 'ar-SA');
  assert.equal(langueVoix('inconnue'), 'fr-FR');
});

test('migration halal : cible uniquement tous les restaurants, complète le texte sans l’écraser et confirme le statut', async () => {
  const sql = await read('supabase/640_restaurants_halal.sql');
  assert.match(sql, /where cat = 'resto'/i);
  assert.match(sql, /Cuisine halal\. Halal\./);
  assert.match(sql, /halal = 'Oui'/);
  assert.match(sql, /information_schema\.columns/i);
  assert.match(sql, /halal_status[\s\S]*confirmed/);
  assert.match(sql, /concat_ws/i);
  assert.match(sql, /retour arrière|rollback/i);
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /delete from|truncate|drop table|drop column/i);
});

test('phase 3 : accueil avec trois grandes tuiles illustrées, autres services et recherche vocale', async () => {
  const home = await read('src/pages/Home.tsx');
  const search = await read('src/pages/Search.tsx');
  assert.match(home, /Acheter en gros/);
  assert.match(home, /Dormir/);
  assert.match(home, /Manger/);
  assert.match(home, /Autres services/);
  assert.match(home, /wholesale\.svg/);
  assert.match(home, /sleep\.svg/);
  assert.match(home, /eat\.svg/);
  assert.match(home, /Marchés de gros, hôtels et restaurants vérifiés en Chine/);
  assert.match(search, /SpeechRecognition|webkitSpeechRecognition/);
  assert.match(search, /Recherche vocale/);
});

test('phase 3 : une fiche se lit à voix haute et propose un partage WhatsApp', async () => {
  const fiche = await read('src/pages/Fiche.tsx');
  assert.match(fiche, /lireFiche/);
  assert.match(fiche, /speechSynthesis/);
  assert.match(fiche, /Écouter la fiche/);
  assert.match(fiche, /lienPartageWhatsApp/);
  assert.match(fiche, /Partager sur WhatsApp/);
});

test('phase 3 : les nouvelles clés voyageur sont traduites dans toutes les langues', async () => {
  const messages = JSON.parse(await read('src/i18n/messages.json'));
  for (const key of ['Acheter en gros', 'Dormir', 'Manger', 'Autres services', 'Recherche vocale', 'Écouter la fiche', 'Partager sur WhatsApp']) {
    assert.ok(messages[key], `clé absente : ${key}`);
    for (const lang of ['en', 'zh', 'ar']) assert.ok(messages[key][lang]?.trim(), `${key} sans ${lang}`);
  }
});
