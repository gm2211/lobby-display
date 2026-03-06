const POLL_INTERVAL_MS = 3_000;
const DEFAULT_TIMEOUT_MS = 90_000;

export async function waitForServer(
  baseURL: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const healthUrl = `${baseURL}/api/health`;
  const deadline = Date.now() + timeoutMs;

  console.log(`Waiting for server at ${healthUrl} ...`);

  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5_000) });
      if (res.ok) {
        const body = await res.json();
        if (body?.status === 'ok') {
          console.log('Server is ready.');
          return;
        }
      }
    } catch {
      // Server not up yet — retry
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Server at ${healthUrl} did not become ready within ${timeoutMs / 1000}s`);
}
