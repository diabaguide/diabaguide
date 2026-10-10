import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migration = await readFile(new URL('../supabase/fret_shipsgo_integrity.sql', import.meta.url), 'utf8');

test('blocks forged ShipsGo fields on expedition inserts and updates', () => {
  assert.match(migration, /before insert or update on public\.expeditions/i);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/i);
  for (const field of ['shipsgo_id', 'shipsgo_type', 'shipsgo_status', 'shipsgo_synced_at', 'shipsgo_tracking_state', 'shipsgo_claimed_at']) {
    assert.ok(migration.includes(`new.${field}`), `missing protected field: ${field}`);
  }
});

test('reserves ShipsGo event provenance for the service role', () => {
  assert.match(migration, /before insert or update on public\.expedition_etapes/i);
  assert.match(migration, /new\.source is distinct from 'equipe'/i);
  assert.match(migration, /new\.ref_shipsgo is not null/i);
  assert.match(migration, /new\.source is distinct from old\.source/i);
  assert.match(migration, /new\.ref_shipsgo is distinct from old\.ref_shipsgo/i);
});
