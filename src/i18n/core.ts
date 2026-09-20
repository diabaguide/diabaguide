import messages from './messages.json';
export type Language = 'fr' | 'en' | 'zh';
export const languageOf = (value: unknown): Language => value === 'en' || value === 'zh' ? value : 'fr';
const catalog: Record<string, {en:string; zh:string}> = messages;
const normalize = (s: string) => s.replace(/’/g, "'").replace(/\s+/g, ' ').trim();
const exact = new Map(Object.entries(catalog).map(([key, value]) => [normalize(key), value]));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Legacy UI messages may already contain their variables. Only anchored,
// catalogued templates are recognized; unmatched/user-provided text is retained.
const patterns = Object.entries(catalog).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
  const ids: string[] = [];
  const pieces = normalize(key).split(/(\{\d+\})/g);
  const source = pieces.map(piece => /^\{\d+\}$/.test(piece) ? (ids.push(piece.slice(1,-1)), '(.*?)') : escape(piece)).join('');
  return { re: new RegExp('^' + source + '$'), ids, value };
});
export function translate(text: string, language: Language, values?: Record<string, string | number>): string {
  const interpolate = (s: string) => s.replace(/\{(\d+|[a-zA-Z]+)\}/g, (match, key: string) => values?.[key] === undefined ? match : String(values[key]));
  if (language === 'fr') return interpolate(text);
  const key = normalize(text);
  let translated = exact.get(key)?.[language];
  if (translated === undefined) {
    for (const entry of patterns) {
      const match = entry.re.exec(key);
      if (!match) continue;
      translated = entry.value[language].replace(/\{(\d+)\}/g, (_, id: string) => match[entry.ids.indexOf(id)+1] ?? '');
      break;
    }
  }
  if (translated === undefined) return interpolate(text);
  return (text.match(/^\s*/)?.[0] ?? '') + interpolate(translated) + (text.match(/\s*$/)?.[0] ?? '');
}
export function translateValue<T>(value: T, language: Language): T {
  if (typeof value === 'string') return translate(value, language) as T;
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? translate(item, language) : item) as T;
  return value;
}
