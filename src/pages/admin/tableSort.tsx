import { useState } from 'react';
import { useI18n } from '../../i18n';

/* Tri par colonne partagé par les tableaux de l'espace équipe. */
export type SortState<K extends string> = { k: K; dir: 1 | -1 };

export function useSort<K extends string>(initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial);
  const toggle = (k: K) => setSort((c) => (c.k === k ? { k, dir: c.dir === 1 ? -1 : 1 } : { k, dir: 1 }));
  return { sort, toggle };
}

export const compare = (x: string | number, y: string | number, dir: 1 | -1) => (x < y ? -1 : x > y ? 1 : 0) * dir;

export function SortTh<K extends string>({ k, label, sort, onSort }: { k: K; label: string; sort: SortState<K>; onSort: (k: K) => void }) {
  const { tr } = useI18n();
  const on = sort.k === k;
  return (
    <th aria-sort={on ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sortbtn" onClick={() => onSort(k)}>{tr(label)}<span className="arrow" aria-hidden="true">{on ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span></button>
    </th>
  );
}
