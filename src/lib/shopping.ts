import { supabase } from './supabase';

/* Liste d'achats du voyageur : un produit, une quantité, un prix visé et, si
   besoin, la fiche du fournisseur où l'acheter. Les listes sont privées (RLS :
   voir supabase/shopping_lists.sql). Sans Supabase (mode démonstration), elles
   sont conservées dans le navigateur : mêmes fonctions, mêmes types. */

export type ShoppingItem = {
  id: string;
  listId: string;
  label: string;
  qty: string;
  price: string;
  note: string;
  providerId: string | null;
  done: boolean;
};

export type ShoppingList = {
  id: string;
  title: string;
  city: string | null;
  notes: string | null;
  updatedAt: string;
  count: number;
  done: number;
};

export type NewItem = { label: string; qty?: string; price?: string; note?: string; providerId?: string | null };

const LOCAL_KEY = 'diaba-shopping-lists';

type LocalList = { id: string; title: string; city: string | null; notes: string | null; updatedAt: string; items: ShoppingItem[] };

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function readLocal(): LocalList[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function writeLocal(lists: LocalList[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(lists)); } catch { /* quota : on ignore */ }
}

function localMutate(id: string, fn: (l: LocalList) => void) {
  const lists = readLocal();
  const l = lists.find((x) => x.id === id);
  if (!l) return;
  fn(l);
  l.updatedAt = new Date().toISOString();
  writeLocal(lists);
}

const rowToList = (r: Record<string, unknown>): ShoppingList => ({
  id: String(r.id), title: String(r.title ?? ''), city: (r.city as string) ?? null,
  notes: (r.notes as string) ?? null, updatedAt: String(r.updated_at ?? ''), count: 0, done: 0,
});

const rowToItem = (r: Record<string, unknown>): ShoppingItem => ({
  id: String(r.id), listId: String(r.list_id), label: String(r.label ?? ''), qty: String(r.qty ?? ''),
  price: String(r.price ?? ''), note: String(r.note ?? ''), providerId: (r.provider_id as string) ?? null,
  done: !!r.done,
});

/** Les listes du voyageur connecté, la plus récente en tête. */
export async function fetchLists(): Promise<ShoppingList[]> {
  if (!supabase) {
    return readLocal()
      .map((l) => ({ id: l.id, title: l.title, city: l.city, notes: l.notes, updatedAt: l.updatedAt, count: l.items.length, done: l.items.filter((i) => i.done).length }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const { data, error } = await supabase.from('shopping_lists')
    .select('id, title, city, notes, updated_at').order('updated_at', { ascending: false });
  if (error || !data) return [];
  const lists = (data as Record<string, unknown>[]).map(rowToList);
  if (lists.length === 0) return lists;
  const { data: items } = await supabase.from('shopping_items').select('list_id, done').in('list_id', lists.map((l) => l.id));
  for (const l of lists) {
    const mine = (items ?? []).filter((i) => (i as { list_id: string }).list_id === l.id);
    l.count = mine.length;
    l.done = mine.filter((i) => (i as { done: boolean }).done).length;
  }
  return lists;
}

/** Une liste et ses lignes. */
export async function fetchList(id: string): Promise<{ list?: ShoppingList; items: ShoppingItem[]; error?: string }> {
  if (!supabase) {
    const l = readLocal().find((x) => x.id === id);
    if (!l) return { items: [], error: 'Cette liste est introuvable.' };
    return { list: { id: l.id, title: l.title, city: l.city, notes: l.notes, updatedAt: l.updatedAt, count: l.items.length, done: l.items.filter((i) => i.done).length }, items: l.items };
  }
  const { data, error } = await supabase.from('shopping_lists').select('id, title, city, notes, updated_at').eq('id', id).maybeSingle();
  if (error || !data) return { items: [], error: 'Cette liste est introuvable.' };
  const list = rowToList(data as Record<string, unknown>);
  const { data: items, error: e2 } = await supabase.from('shopping_items')
    .select('id, list_id, label, qty, price, note, provider_id, done').eq('list_id', id).order('sort').order('created_at');
  if (e2) return { list, items: [], error: 'Les lignes de la liste n’ont pas pu être chargées.' };
  const rows = (items as Record<string, unknown>[]).map(rowToItem);
  list.count = rows.length;
  list.done = rows.filter((i) => i.done).length;
  return { list, items: rows };
}

/** Crée une liste vide ; renvoie son identifiant. */
export async function createList(title: string, city?: string | null): Promise<{ id?: string; error?: string }> {
  const clean = title.trim() || 'Ma liste d’achats';
  if (!supabase) {
    const l: LocalList = { id: uid(), title: clean, city: city ?? null, notes: null, updatedAt: new Date().toISOString(), items: [] };
    writeLocal([l, ...readLocal()]);
    return { id: l.id };
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Connectez-vous pour créer une liste d’achats.' };
  const { data, error } = await supabase.from('shopping_lists').insert({ title: clean, city: city ?? null }).select('id').single();
  if (error || !data) return { error: humanize(error?.message) };
  return { id: (data as { id: string }).id };
}

/** Renomme une liste ou change sa ville / ses notes. */
export async function updateList(id: string, patch: { title?: string; city?: string | null; notes?: string | null }): Promise<{ error?: string }> {
  if (!supabase) { localMutate(id, (l) => { Object.assign(l, patch); }); return {}; }
  const { error } = await supabase.from('shopping_lists').update(patch).eq('id', id);
  return { error: error ? humanize(error.message) : undefined };
}

export async function deleteList(id: string): Promise<{ error?: string }> {
  if (!supabase) { writeLocal(readLocal().filter((l) => l.id !== id)); return {}; }
  const { error } = await supabase.from('shopping_lists').delete().eq('id', id);
  return { error: error ? humanize(error.message) : undefined };
}

/** Ajoute une ligne. `providerId` rattache la ligne à la fiche d'un fournisseur. */
export async function addItem(listId: string, item: NewItem): Promise<{ id?: string; error?: string }> {
  const label = item.label.trim().slice(0, 120);
  if (!label) return { error: 'Indiquez le produit à acheter.' };
  if (!supabase) {
    const row: ShoppingItem = {
      id: uid(), listId, label, qty: item.qty?.trim() ?? '', price: item.price?.trim() ?? '',
      note: item.note?.trim() ?? '', providerId: item.providerId ?? null, done: false,
    };
    localMutate(listId, (l) => { l.items.push(row); });
    return { id: row.id };
  }
  const { data, error } = await supabase.from('shopping_items').insert({
    list_id: listId, label, qty: item.qty?.trim() || null, price: item.price?.trim() || null,
    note: item.note?.trim() || null, provider_id: item.providerId ?? null,
  }).select('id').single();
  if (error || !data) return { error: humanize(error?.message) };
  return { id: (data as { id: string }).id };
}

export async function updateItem(id: string, patch: Partial<Omit<ShoppingItem, 'id' | 'listId'>>): Promise<{ error?: string }> {
  if (!supabase) {
    const lists = readLocal();
    for (const l of lists) {
      const it = l.items.find((x) => x.id === id);
      if (it) { Object.assign(it, patch); l.updatedAt = new Date().toISOString(); writeLocal(lists); return {}; }
    }
    return {};
  }
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) row.label = patch.label.trim().slice(0, 120);
  if (patch.qty !== undefined) row.qty = patch.qty.trim() || null;
  if (patch.price !== undefined) row.price = patch.price.trim() || null;
  if (patch.note !== undefined) row.note = patch.note.trim() || null;
  if (patch.done !== undefined) row.done = patch.done;
  if (patch.providerId !== undefined) row.provider_id = patch.providerId;
  const { error } = await supabase.from('shopping_items').update(row).eq('id', id);
  return { error: error ? humanize(error.message) : undefined };
}

export const toggleItem = (id: string, done: boolean) => updateItem(id, { done });

export async function deleteItem(id: string): Promise<{ error?: string }> {
  if (!supabase) {
    const lists = readLocal();
    for (const l of lists) {
      const i = l.items.findIndex((x) => x.id === id);
      if (i >= 0) { l.items.splice(i, 1); l.updatedAt = new Date().toISOString(); writeLocal(lists); return {}; }
    }
    return {};
  }
  const { error } = await supabase.from('shopping_items').delete().eq('id', id);
  return { error: error ? humanize(error.message) : undefined };
}

/** La liste en texte clair, pour WhatsApp, le presse-papiers ou le PDF. */
export function listText(list: { title: string; city?: string | null }, items: ShoppingItem[], providerName?: (id: string) => string | undefined): string {
  const lignes = items.map((i) => {
    const parts = [`${i.done ? '☑' : '☐'} ${i.label}`];
    if (i.qty.trim()) parts.push(`· ${i.qty.trim()}`);
    if (i.price.trim()) parts.push(`· ${i.price.trim()}`);
    const f = i.providerId ? providerName?.(i.providerId) : undefined;
    if (f) parts.push(`· chez ${f}`);
    if (i.note.trim()) parts.push(`· ${i.note.trim()}`);
    return parts.join(' ');
  });
  const restant = items.filter((i) => !i.done).length;
  return [
    `*${list.title}*${list.city ? ` (${list.city})` : ''}`,
    '',
    ...lignes,
    '',
    `${items.length - restant}/${items.length} acheté(s) — liste préparée sur Diaba Guide`,
    'https://www.diabaguide.com',
  ].join('\n');
}

/** Lien de partage WhatsApp (fonctionne aussi sur téléphone sans l'application). */
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

function humanize(msg?: string): string {
  if (!msg) return 'L’enregistrement a échoué. Réessayez.';
  if (/row-level security|permission denied/i.test(msg)) return 'Connectez-vous pour utiliser vos listes d’achats.';
  return msg;
}
