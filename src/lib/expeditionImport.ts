import type { EtapeType, FretMode } from './fret';

export const EXPEDITION_IMPORT_HEADERS = [
  'code',
  'mode',
  'etape',
  'destination',
  'arrivee_prevue',
  'container_no',
  'bl_no',
  'awb_no',
] as const;

export type ExpeditionImportRow = {
  line: number;
  code: string;
  mode: FretMode;
  etape: EtapeType | null;
  destination: string;
  arriveePrevue: string | null;
  containerNo: string | null;
  blNo: string | null;
  awbNo: string | null;
};

export type ExpeditionImportError = {
  line: number;
  message: string;
};

const MODES = new Set<FretMode>(['maritime_groupage', 'maritime_complet', 'aerien_fret', 'aerien_express']);
const ETAPES = new Set<EtapeType>([
  'regroupe', 'depart', 'en_transit', 'arrive_dakar', 'chez_diaba',
  'dispo_retrait', 'en_livraison', 'remis',
]);

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

const HEADER_ALIASES: Record<string, typeof EXPEDITION_IMPORT_HEADERS[number]> = {
  code: 'code',
  mode: 'mode',
  etape: 'etape',
  statut: 'etape',
  destination: 'destination',
  arrivee_prevue: 'arrivee_prevue',
  date_arrivee_prevue: 'arrivee_prevue',
  container_no: 'container_no',
  conteneur: 'container_no',
  numero_conteneur: 'container_no',
  bl_no: 'bl_no',
  bl: 'bl_no',
  connaissement: 'bl_no',
  awb_no: 'awb_no',
  awb: 'awb_no',
};

function delimiterFor(header: string): ',' | ';' | '\t' {
  const counts: Record<',' | ';' | '\t', number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (let index = 0; index < header.length; index += 1) {
    const char = header[index];
    if (char === '"') {
      if (quoted && header[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && char in counts) {
      counts[char as ',' | ';' | '\t'] += 1;
    }
  }
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ',') as ',' | ';' | '\t';
}

function hasUnclosedQuote(source: string) {
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '"') continue;
    if (quoted && source[index + 1] === '"') { index += 1; continue; }
    quoted = !quoted;
  }
  return quoted;
}

function parseDelimited(source: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let quoteClosed = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (quoted) {
        quoted = false;
        quoteClosed = true;
      } else if (field.length === 0 && !quoteClosed) {
        quoted = true;
      } else {
        throw new Error('Guillemet mal placé dans le fichier CSV.');
      }
    } else if (char === delimiter && !quoted) {
      record.push(field.trim());
      field = '';
      quoteClosed = false;
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      record.push(field.trim());
      field = '';
      if (record.some(Boolean)) records.push(record);
      record = [];
      quoteClosed = false;
    } else {
      if (quoteClosed) throw new Error('Texte après un guillemet fermant.');
      field += char;
    }
  }

  if (quoted) throw new Error('Guillemet CSV non fermé.');
  record.push(field.trim());
  if (record.some(Boolean)) records.push(record);
  return records;
}

const nullable = (value: string | undefined) => value?.trim() || null;
const validDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
};

export function parseExpeditionImport(source: string): {
  rows: ExpeditionImportRow[];
  errors: ExpeditionImportError[];
} {
  if (source.length > 2_000_000) return { rows: [], errors: [{ line: 1, message: 'Le fichier dépasse la limite de 2 Mo.' }] };
  if (hasUnclosedQuote(source)) return { rows: [], errors: [{ line: 1, message: 'Guillemet CSV non fermé.' }] };
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  let records: string[][];
  try {
    records = parseDelimited(source.trim().replace(/^\uFEFF/, ''), delimiterFor(firstLine.replace(/^\uFEFF/, '')));
  } catch (error) {
    return { rows: [], errors: [{ line: 1, message: error instanceof Error ? error.message : 'Fichier CSV invalide.' }] };
  }
  if (records.length === 0) return { rows: [], errors: [{ line: 1, message: 'Ajoutez une ligne d’en-tête et au moins une expédition.' }] };

  if (records.length > 201) return { rows: [], errors: [{ line: 202, message: 'Un import est limité à 200 expéditions.' }] };

  const indexes = new Map<typeof EXPEDITION_IMPORT_HEADERS[number], number>();
  records[0].forEach((header, index) => {
    const canonical = HEADER_ALIASES[normalizeHeader(header)];
    if (canonical && !indexes.has(canonical)) indexes.set(canonical, index);
  });
  const missing = (['code', 'mode', 'etape'] as const).filter((header) => !indexes.has(header));
  if (missing.length > 0) {
    const labels = missing.map((header) => header === 'etape' ? 'étape' : header);
    return {
      rows: [],
      errors: [{ line: 1, message: `Colonnes obligatoires manquantes : ${labels.join(', ')}.` }],
    };
  }

  const requiredWidth = Math.max(...(['code', 'mode', 'etape'] as const).map((header) => indexes.get(header)! + 1));
  const rows: ExpeditionImportRow[] = [];
  const errors: ExpeditionImportError[] = [];
  const codes = new Set<string>();
  const cell = (record: string[], header: typeof EXPEDITION_IMPORT_HEADERS[number]) => {
    const index = indexes.get(header);
    return index === undefined ? '' : (record[index] ?? '').trim();
  };

  records.slice(1).forEach((record, offset) => {
    const line = offset + 2;
    if (record.length < requiredWidth || record.length > records[0].length) {
      errors.push({ line, message: `Nombre de colonnes incohérent : ${record.length} valeur(s) pour ${records[0].length} colonne(s).` });
      return;
    }
    const code = cell(record, 'code');
    const mode = cell(record, 'mode') as FretMode;
    const etapeValue = cell(record, 'etape') as EtapeType | '';
    const arriveePrevue = cell(record, 'arrivee_prevue');
    let invalid = false;

    if (!code) {
      errors.push({ line, message: 'Le code du lot est obligatoire.' });
      invalid = true;
    } else if (codes.has(code.toLocaleUpperCase('fr'))) {
      errors.push({ line, message: `Le code ${code} est dupliqué dans le fichier.` });
      invalid = true;
    } else {
      codes.add(code.toLocaleUpperCase('fr'));
    }
    if (!MODES.has(mode)) {
      errors.push({ line, message: `Mode invalide : ${mode || 'vide'}.` });
      invalid = true;
    }
    if (etapeValue && !ETAPES.has(etapeValue)) {
      errors.push({ line, message: `Étape invalide : ${etapeValue}.` });
      invalid = true;
    }
    if (arriveePrevue && !validDate(arriveePrevue)) {
      errors.push({ line, message: `Date d’arrivée invalide : ${arriveePrevue}. Utilisez AAAA-MM-JJ.` });
      invalid = true;
    }
    if (invalid) return;

    rows.push({
      line,
      code,
      mode,
      etape: etapeValue || null,
      destination: cell(record, 'destination') || 'Dakar',
      arriveePrevue: nullable(arriveePrevue),
      containerNo: nullable(cell(record, 'container_no')),
      blNo: nullable(cell(record, 'bl_no')),
      awbNo: nullable(cell(record, 'awb_no')),
    });
  });

  return { rows, errors };
}
