import { request } from '@playwright/test';

import { API_URL, E2E_WEB_URL } from './api';

/** Fails fast when the E2E backend does not allow the E2E origin, instead of every UI test failing on CORS. */
export default async function globalSetup() {
  const api = await request.newContext();
  const response = await api.get(`${API_URL}/api/products`, { headers: { Origin: E2E_WEB_URL } });
  const allowed = response.headers()['access-control-allow-origin'];
  await api.dispose();
  if (!response.ok() || allowed !== E2E_WEB_URL) {
    throw new Error(
      `The backend at ${API_URL} does not allow the E2E origin ${E2E_WEB_URL} (status ${response.status()}). ` +
        'Restart it with the current app.cors.allowed-origins.'
    );
  }
}
