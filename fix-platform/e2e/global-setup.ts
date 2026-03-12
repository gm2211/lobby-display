import { waitForServer } from './helpers/wait-for-server';

async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
  await waitForServer(baseURL);
}

export default globalSetup;
