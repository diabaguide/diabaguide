import { handlePurgeTrash } from './purge-corbeille-core.js';

export default function handler(req, res) {
  return handlePurgeTrash(req, res);
}
