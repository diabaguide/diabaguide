export const PRODUCT_CATEGORY_SUGGESTIONS = [
  'Textile et tissus',
  'Vêtements et accessoires',
  'Téléphones et électronique',
  'Maison et décoration',
  'Beauté et cosmétiques',
  'Chaussures et maroquinerie',
  'Bijoux et accessoires',
  'Jouets et loisirs',
  'Pièces détachées',
  'Emballages et fournitures',
  'Alimentation',
] as const;

export function normalizeProductCategory(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function addProductCategory(
  current: readonly string[],
  rawValue: string,
  suggestions: readonly string[] = PRODUCT_CATEGORY_SUGGESTIONS,
): { values: string[]; error: string | null } {
  const label = rawValue.trim().replace(/\s+/g, ' ');
  if (!label) return { values: [...current], error: 'Saisissez une catégorie.' };
  if (label.length > 80) return { values: [...current], error: 'La catégorie ne peut pas dépasser 80 caractères.' };
  const normalized = normalizeProductCategory(label);
  if (current.some((value) => normalizeProductCategory(value) === normalized)) {
    return { values: [...current], error: 'Cette catégorie est déjà ajoutée.' };
  }
  const canonical = suggestions.find((suggestion) => normalizeProductCategory(suggestion) === normalized) ?? label;
  return { values: [...current, canonical], error: null };
}
