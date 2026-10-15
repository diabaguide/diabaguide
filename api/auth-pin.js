import { handleAuthPin } from './auth-pin-core.js';

export default function handler(req, res) {
  return handleAuthPin(req, res);
}
