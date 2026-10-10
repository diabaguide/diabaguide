import { handleShipsGoSync } from './shipsgo-server.js';

export default function handler(req, res) {
  return handleShipsGoSync(req, res);
}
