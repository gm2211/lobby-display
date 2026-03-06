import { execSync } from 'child_process';

const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:5432/renzo_test';

function tryExec(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function runPsql(sql: string): boolean {
  // 1. Try psql directly
  if (tryExec(`psql "postgresql://postgres:postgres@localhost:5432/postgres" -c "${sql}"`)) return true;
  // 2. Try docker compose
  if (tryExec(`docker compose exec -T postgres psql -U postgres -c "${sql}"`)) return true;
  // 3. Try any running postgres container by image
  try {
    const containerId = execSync(
      `docker ps --filter "ancestor=postgres" --filter "ancestor=postgres:15" --filter "ancestor=postgres:16-alpine" -q`,
      { stdio: 'pipe', encoding: 'utf-8' },
    ).trim().split('\n')[0];
    if (containerId && tryExec(`docker exec ${containerId} psql -U postgres -c "${sql}"`)) return true;
  } catch { /* ignore */ }
  return false;
}

export function setup() {
  // Recreate the test database
  runPsql('DROP DATABASE IF EXISTS renzo_test;');
  if (!runPsql('CREATE DATABASE renzo_test;')) {
    console.warn(
      'Could not create test database. Make sure PostgreSQL is running locally or via docker compose.\n' +
      'Skipping DB creation — tests will fail if the database does not exist.'
    );
    return;
  }

  // Push schema to test database
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
  });
}

export function teardown() {
  runPsql('DROP DATABASE IF EXISTS renzo_test;');
}
