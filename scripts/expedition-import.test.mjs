import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXPEDITION_IMPORT_HEADERS,
  parseExpeditionImport,
} from '../src/lib/expeditionImport.ts';

test('analyse un export CSV français séparé par des points-virgules', () => {
  const source = [
    'code;mode;étape;destination;arrivee_prevue;container_no;bl_no;awb_no',
    'LOT-2026-01;maritime_groupage;en_transit;Dakar;2026-11-15;MSCU1234567;BL-42;',
    'AIR-2026-02;aerien_fret;depart;Dakar;2026-10-20;;;176-12345678',
  ].join('\n');

  const result = parseExpeditionImport(source);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows, [
    {
      line: 2,
      code: 'LOT-2026-01',
      mode: 'maritime_groupage',
      etape: 'en_transit',
      destination: 'Dakar',
      arriveePrevue: '2026-11-15',
      containerNo: 'MSCU1234567',
      blNo: 'BL-42',
      awbNo: null,
    },
    {
      line: 3,
      code: 'AIR-2026-02',
      mode: 'aerien_fret',
      etape: 'depart',
      destination: 'Dakar',
      arriveePrevue: '2026-10-20',
      containerNo: null,
      blNo: null,
      awbNo: '176-12345678',
    },
  ]);
});

test('conserve les séparateurs placés dans un champ CSV entre guillemets', () => {
  const source = [
    EXPEDITION_IMPORT_HEADERS.join(','),
    'LOT-3,maritime_complet,regroupe,"Dakar, Sénégal",2026-12-01,CONT-3,,',
  ].join('\n');

  const result = parseExpeditionImport(source);

  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0]?.destination, 'Dakar, Sénégal');
});

test('rejette les valeurs métier invalides et les codes dupliqués', () => {
  const source = [
    EXPEDITION_IMPORT_HEADERS.join('\t'),
    'LOT-X\ttrain\tinconnue\tDakar\t01/12/2026\t\t\t',
    'LOT-X\taerien_express\tdepart\tDakar\t2026-12-01\t\t\t',
    '\tmaritime_groupage\tdepart\tDakar\t2026-12-01\t\t\t',
  ].join('\n');

  const result = parseExpeditionImport(source);

  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.errors.map((error) => error.line), [2, 2, 2, 3, 4]);
  assert.match(result.errors[0]?.message ?? '', /mode/i);
  assert.match(result.errors[1]?.message ?? '', /étape/i);
  assert.match(result.errors[2]?.message ?? '', /date/i);
  assert.match(result.errors[3]?.message ?? '', /dupliqué/i);
  assert.match(result.errors[4]?.message ?? '', /code/i);
});

test('rejette les étapes qui concernent seulement un colis', () => {
  const source = [
    EXPEDITION_IMPORT_HEADERS.join(';'),
    'LOT-COLIS;maritime_groupage;recu_chine;Dakar;;;;',
  ].join('\n');

  const result = parseExpeditionImport(source);

  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0]?.message ?? '', /étape/i);
});

test('accepte le BOM fréquemment ajouté aux CSV exportés', () => {
  const source = `\uFEFF${EXPEDITION_IMPORT_HEADERS.join(',')}\nLOT-BOM,maritime_groupage,depart,Dakar,2026-12-01,,,`;
  const result = parseExpeditionImport(source);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0]?.code, 'LOT-BOM');
});

test('détecte le séparateur sans compter les virgules dans les en-têtes cités', () => {
  const source = [
    'code;mode;etape;destination;arrivee_prevue;"container, maritime, freight, airway, bill, shipment, tracking, reference";bl_no;awb_no',
    'LOT-DELIM;maritime_groupage;depart;Dakar;2026-12-01;;BL-01;AWB-01',
  ].join(String.fromCharCode(10));
  const result = parseExpeditionImport(source);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0]?.code, 'LOT-DELIM');
  assert.equal(result.rows[0]?.blNo, 'BL-01');
});

test('accepte les dates civiles valides des années 1 à 99 sans décalage JavaScript', () => {
  const source = [
    EXPEDITION_IMPORT_HEADERS.join(';'),
    'LOT-DATE-EARLY;maritime_groupage;depart;Dakar;0001-01-01;;;',
  ].join(String.fromCharCode(10));
  const result = parseExpeditionImport(source);
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows[0]?.arriveePrevue, '0001-01-01');
});

test('rejette les dates calendaires impossibles côté client', () => {
  const source = [
    EXPEDITION_IMPORT_HEADERS.join(';'),
    'LOT-DATE-INVALID;maritime_groupage;depart;Dakar;2026-02-30;;;',
  ].join(String.fromCharCode(10));
  const result = parseExpeditionImport(source);
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0]?.message ?? '', /date/i);
});

test('rejette une date horodatée incompatible avec la RPC SQL', () => {
  const source = [
    EXPEDITION_IMPORT_HEADERS.join(';'),
    'LOT-DATE;maritime_groupage;depart;Dakar;2026-12-01T00:00:00Z;;;',
  ].join(String.fromCharCode(10));
  const result = parseExpeditionImport(source);
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0]?.message ?? '', /date/i);
});

test('rejette les guillemets CSV non fermés', () => {
  const source = [
    EXPEDITION_IMPORT_HEADERS.join(','),
    'LOT-QUOTE,maritime_groupage,depart,"Dakar, Sénégal,2026-12-01,,,,',
  ].join(String.fromCharCode(10));
  const result = parseExpeditionImport(source);
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0]?.message ?? '', /guillemet/i);
});

test('rejette un guillemet placé au milieu d’un champ CSV non cité', () => {
  const source = [
    EXPEDITION_IMPORT_HEADERS.join(','),
    'LOT-BAD,maritime_groupage,depart,Dak"ar,2026-12-01,,,,',
  ].join(String.fromCharCode(10));
  const result = parseExpeditionImport(source);
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0]?.message ?? '', /guillemet/i);
});

test('refuse les fichiers dépassant la limite d’import', () => {
  const result = parseExpeditionImport('x'.repeat(2_000_001));
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0]?.message ?? '', /2 Mo/);
});

test('plafonne l’aperçu à 200 expéditions comme la RPC', () => {
  const header = EXPEDITION_IMPORT_HEADERS.join(',');
  const rows = Array.from({ length: 201 }, (_, index) => `LOT-${index},maritime_groupage,depart,Dakar,,,,`);
  const result = parseExpeditionImport([header, ...rows].join(String.fromCharCode(10)));
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0]?.message ?? '', /200/);
});

test('rejette des lignes plus larges que leur en-tête', () => {
  const source = [
    EXPEDITION_IMPORT_HEADERS.slice(0, 3).join(','),
    'LOT-WIDE,maritime_groupage,depart,extra',
  ].join(String.fromCharCode(10));
  const result = parseExpeditionImport(source);
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0]?.message ?? '', /colonnes/i);
});

test('rejette le texte ajouté après un guillemet fermant', () => {
  const source = [
    EXPEDITION_IMPORT_HEADERS.join(','),
    'LOT-TAIL,maritime_groupage,depart,"Dakar"texte,2026-12-01,,,',
  ].join(String.fromCharCode(10));
  const result = parseExpeditionImport(source);
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0]?.message ?? '', /guillemet|après/i);
});

test('exige une ligne d’en-tête contenant les colonnes essentielles', () => {
  const result = parseExpeditionImport('code;destination\nLOT-1;Dakar');

  assert.equal(result.rows.length, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.line, 1);
  assert.match(result.errors[0]?.message ?? '', /mode.*étape/i);
});
