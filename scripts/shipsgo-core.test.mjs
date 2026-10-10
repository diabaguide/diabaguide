import assert from 'node:assert/strict';
import { test } from 'node:test';

let shipsgo = {};
try {
  shipsgo = await import('../api/shipsgo-core.js');
} catch {
  // A missing implementation must fail the behavior assertions below.
}

const { buildShipsGoRegistration, mapShipsGoStatus, matchExistingShipsGoShipment, prepareShipsGoEvents } = shipsgo;

test('builds a maritime registration using the production container field', () => {
  assert.deepEqual(buildShipsGoRegistration({
    code: 'EXP-2026-AB12', mode: 'maritime_groupage', container_no: 'MSCU1234567',
  }), {
    type: 'ocean',
    body: { reference: 'EXP-2026-AB12', container_number: 'MSCU1234567' },
  });
});

test('rejects a maritime registration without a valid container number', () => {
  assert.throws(() => buildShipsGoRegistration({
    code: 'EXP-2026-AB12', mode: 'maritime_complet', container_no: null, bl_no: 'BL123',
  }));
  assert.throws(() => buildShipsGoRegistration({
    code: 'EXP-2026-AB12', mode: 'maritime_complet', container_no: 'BAD',
  }));
});

test('builds an air registration from the production AWB field', () => {
  assert.deepEqual(buildShipsGoRegistration({
    code: 'EXP-2026-AIR1', mode: 'aerien_fret', awb_no: '333-88888888',
  }), {
    type: 'air',
    body: { reference: 'EXP-2026-AIR1', awb_number: '333-88888888' },
  });
});

test('rejects malformed air waybills before any provider request', () => {
  assert.throws(() => buildShipsGoRegistration({
    code: 'EXP-2026-AIR1', mode: 'aerien_express', awb_no: '123-45',
  }));
});

test('maps only actual and meaningful ocean/air movements into public stages', () => {
  const events = prepareShipsGoEvents('ocean', 123, {
    route: { port_of_discharge: { location: { code: 'SNDKR', name: 'Dakar' } } },
    containers: [{ number: 'MSCU1234567', movements: [
      { event: 'DEPA', status: 'ACT', timestamp: '2026-10-10T08:00:00Z', location: { code: 'CNSHA', name: 'Shanghai' } },
      { event: 'ARRV', status: 'EST', timestamp: '2026-10-20T08:00:00Z', location: { code: 'SNDKR', name: 'Dakar' } },
      { event: 'DISC', status: 'ACT', timestamp: '2026-10-20T10:00:00Z', location: { code: 'SNDKR', name: 'Dakar' } },
      { event: 'DISC', status: 'ACT', timestamp: '2026-10-21T10:00:00Z', location: { code: 'CNSHA', name: 'Shanghai' } },
      { event: 'EMRT', status: 'ACT', timestamp: '2026-10-21T11:00:00Z', location: { code: 'SNDKR', name: 'Dakar' } },
    ] }],
  });
  assert.deepEqual(events.map(({ type, au }) => ({ type, au })), [
    { type: 'en_transit', au: '2026-10-10T08:00:00.000Z' },
    { type: 'arrive_dakar', au: '2026-10-20T10:00:00.000Z' },
  ]);
  assert.ok(events.every((event) => event.visible_client === true));
  assert.ok(events.every((event) => /^[a-f0-9]{64}$/.test(event.ref)));

  const air = prepareShipsGoEvents('air', 456, {
    route: { destination: { location: { iata: 'DSS' } } },
    movements: [
      { event: 'DEP', status: 'ACT', timestamp: '2026-10-10T08:00:00Z', location: { iata: 'CAN' } },
      { event: 'RCF', status: 'ACT', timestamp: '2026-10-10T10:00:00Z', location: { iata: 'IST' } },
      { event: 'RCF', status: 'ACT', timestamp: '2026-10-10T11:00:00Z', location: { iata: 'DSS' } },
      { event: 'DLV', status: 'ACT', timestamp: '2026-10-10T12:00:00Z', location: { iata: 'DSS' } },
    ],
  });
  assert.deepEqual(air.map((event) => event.type), ['en_transit', 'arrive_dakar']);
});

test('only advances transit automatically and requires a confirmed Dakar event for arrival', () => {
  assert.equal(mapShipsGoStatus('ocean', 'SAILING'), 'partie');
  assert.equal(mapShipsGoStatus('ocean', 'DISCHARGED'), null);
  assert.equal(mapShipsGoStatus('ocean', 'DISCHARGED', [{ type: 'arrive_dakar' }]), 'arrivee');
  assert.equal(mapShipsGoStatus('air', 'EN_ROUTE'), 'partie');
  assert.equal(mapShipsGoStatus('air', 'LANDED'), null);
  assert.equal(mapShipsGoStatus('air', 'LANDED', [{ type: 'arrive_dakar' }]), 'arrivee');
  assert.equal(mapShipsGoStatus('air', 'DELIVERED'), null);
  assert.equal(mapShipsGoStatus('ocean', 'BOOKED'), null);
});

test('reuses only an existing provider shipment with matching reference and identifier', () => {
  const rows = [
    { id: 10, reference: 'EXP-2026-AB12', container_number: 'OTHER1234567' },
    { id: 11, reference: 'EXP-2026-AB12', container_number: 'MSCU1234567' },
  ];
  assert.deepEqual(matchExistingShipsGoShipment('ocean', 'EXP-2026-AB12', 'MSCU1234567', rows), rows[1]);
  assert.equal(matchExistingShipsGoShipment('ocean', 'EXP-2026-AB12', 'MSCU0000000', rows), null);
});

test('normalizes punctuation when matching an air waybill already registered at ShipsGo', () => {
  const row = { id: 33, reference: 'EXP-2026-AIR1', awb_number: '333-88888888' };
  assert.deepEqual(matchExistingShipsGoShipment('air', 'EXP-2026-AIR1', '33388888888', [row]), row);
});

test('rejects ambiguous duplicate provider references rather than linking the wrong shipment', () => {
  const rows = [
    { id: 11, reference: 'EXP-2026-AB12', container_number: 'MSCU1234567' },
    { id: 12, reference: 'EXP-2026-AB12', container_number: 'MSCU1234567' },
  ];
  assert.throws(() => matchExistingShipsGoShipment('ocean', 'EXP-2026-AB12', 'MSCU1234567', rows));
});
