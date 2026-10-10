import { createHash } from 'node:crypto';

const OCEAN_TRANSIT_EVENTS = new Set(['DEPA']);
const OCEAN_ARRIVAL_EVENTS = new Set(['ARRV', 'DISC']);
const AIR_TRANSIT_EVENTS = new Set(['DEP']);
const AIR_ARRIVAL_EVENTS = new Set(['ARR', 'RCF', 'DLV']);

function isDakarOceanLocation(location) {
  const code = String(location?.code ?? '').trim().toUpperCase();
  const name = String(location?.name ?? '').trim().toUpperCase();
  return code === 'SNDKR' || name === 'DAKAR' || name.startsWith('DAKAR ');
}

function isDakarAirLocation(location) {
  return String(location?.iata ?? '').trim().toUpperCase() === 'DSS';
}

/** Construis la requête à partir des colonnes réellement utilisées en production. */
export function buildShipsGoRegistration(expedition) {
  const code = typeof expedition?.code === 'string' ? expedition.code.trim() : '';
  if (code.length < 5 || code.length > 128) throw new Error('Code d’expédition invalide.');

  if (expedition.mode === 'maritime_groupage' || expedition.mode === 'maritime_complet') {
    const container = typeof expedition.container_no === 'string'
      ? expedition.container_no.toUpperCase().replace(/\s+/g, '')
      : '';
    if (!/^[A-Z]{4}\d{7}$/.test(container)) {
      throw new Error('Un numéro de conteneur valide est requis pour le suivi maritime.');
    }
    return { type: 'ocean', body: { reference: code, container_number: container } };
  }

  if (expedition.mode === 'aerien_fret' || expedition.mode === 'aerien_express') {
    const awb = typeof expedition.awb_no === 'string'
      ? expedition.awb_no.replace(/[\s-]+/g, '')
      : '';
    if (!/^\d{11}$/.test(awb)) {
      throw new Error('Un numéro AWB valide est requis pour le suivi aérien.');
    }
    return {
      type: 'air',
      body: { reference: code, awb_number: `${awb.slice(0, 3)}-${awb.slice(3)}` },
    };
  }

  throw new Error('Mode de transport non pris en charge par ShipsGo.');
}

/** L'arrivée n'est validée que par un événement réel au point final de Dakar. */
export function mapShipsGoStatus(type, status, events = []) {
  if ((type === 'ocean' && status === 'SAILING') || (type === 'air' && status === 'EN_ROUTE')) return 'partie';
  const hasDakarArrival = Array.isArray(events) && events.some((event) => event?.type === 'arrive_dakar');
  if (!hasDakarArrival) return null;
  if (type === 'ocean' && ['ARRIVED', 'DISCHARGED'].includes(status)) return 'arrivee';
  if (type === 'air' && ['LANDED', 'DELIVERED'].includes(status)) return 'arrivee';
  return null;
}

/** Convertit uniquement les mouvements réels au départ ou à l'arrivée à Dakar. */
export function prepareShipsGoEvents(type, shipmentId, shipment) {
  if (!Number.isSafeInteger(shipmentId) || shipmentId <= 0) return [];
  const source = type === 'ocean'
    ? (Array.isArray(shipment?.containers)
      ? shipment.containers.flatMap((container) => (Array.isArray(container?.movements)
        ? container.movements.map((movement) => ({ movement, container: container.number ?? '' }))
        : []))
      : [])
    : type === 'air' && Array.isArray(shipment?.movements)
      ? shipment.movements.map((movement) => ({ movement, container: '' }))
      : [];
  const oceanDestination = shipment?.route?.port_of_discharge?.location;
  const airDestination = shipment?.route?.destination?.location;
  const seen = new Set();
  const seenArrival = new Set();
  const events = [];
  source.sort((left, right) => {
    const leftTime = Date.parse(left.movement?.timestamp ?? '');
    const rightTime = Date.parse(right.movement?.timestamp ?? '');
    return (Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER)
      - (Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER);
  });

  for (const { movement, container } of source) {
    if (movement?.status !== 'ACT' || typeof movement?.timestamp !== 'string') continue;
    const instant = Date.parse(movement.timestamp);
    if (!Number.isFinite(instant)) continue;

    let stage = null;
    if (type === 'ocean' && OCEAN_TRANSIT_EVENTS.has(movement.event)) stage = 'en_transit';
    if (type === 'ocean' && OCEAN_ARRIVAL_EVENTS.has(movement.event)
      && isDakarOceanLocation(oceanDestination) && isDakarOceanLocation(movement.location)) stage = 'arrive_dakar';
    if (type === 'air' && AIR_TRANSIT_EVENTS.has(movement.event)) stage = 'en_transit';
    if (type === 'air' && AIR_ARRIVAL_EVENTS.has(movement.event)
      && isDakarAirLocation(airDestination) && isDakarAirLocation(movement.location)) stage = 'arrive_dakar';
    if (!stage) continue;
    const arrivalKey = stage === 'arrive_dakar'
      ? (type === 'ocean' ? `ocean:${container}` : 'air')
      : null;
    if (arrivalKey && seenArrival.has(arrivalKey)) continue;

    const au = new Date(instant).toISOString();
    const identity = JSON.stringify([
      type, shipmentId, container, movement.event, movement.status, au,
      movement.location?.code ?? movement.location?.iata ?? movement.location?.name ?? '',
    ]);
    const ref = createHash('sha256').update(identity, 'utf8').digest('hex');
    if (seen.has(ref)) continue;
    seen.add(ref);
    if (arrivalKey) seenArrival.add(arrivalKey);
    events.push({ type: stage, au, ref, visible_client: true });
  }

  return events;
}

/** Évite de créer un second suivi après un délai réseau ou une réponse perdue. */
export function matchExistingShipsGoShipment(type, code, identifier, shipments) {
  if (!Array.isArray(shipments)) return null;
  const matches = shipments.filter((shipment) => {
    if (shipment?.reference !== code || !Number.isSafeInteger(shipment?.id) || shipment.id <= 0) return false;
    return type === 'ocean'
      ? shipment.container_number === identifier
      : type === 'air' && typeof shipment.awb_number === 'string'
        && shipment.awb_number.replace(/[\s-]+/g, '') === identifier.replace(/[\s-]+/g, '');
  });
  if (matches.length > 1) throw new Error('Plusieurs suivis ShipsGo correspondent à ce lot.');
  return matches[0] ?? null;
}
