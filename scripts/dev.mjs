#!/usr/bin/env node
import { execSync, spawn } from 'child_process';
import { existsSync, copyFileSync } from 'fs';
import { resolve } from 'path';
import { checkFork } from './fork-check.mjs';

const root = resolve(import.meta.dirname, '..');
const backendDir = resolve(root, 'packages/backend');
const envFile = resolve(backendDir, '.env');
const envExample = resolve(backendDir, '.env.example');

// --check-fork-only (TASK-8): run only the fork-reachability check and exit —
// no Docker, no migrations, no dev servers. Exit 0 either way; prints the
// hint only when no chain node answers under RPC_URL.
if (process.argv.includes('--check-fork-only')) {
  const { hint } = await checkFork({ envFilePath: envFile });
  if (hint) console.log(hint);
  process.exit(0);
}

// 1. Ensure backend .env exists
if (!existsSync(envFile)) {
  copyFileSync(envExample, envFile);
  console.log('Created packages/backend/.env from .env.example');
  console.log('  → Edit JWT_SECRET before going to production!\n');
}

// 2. Start PostgreSQL via Docker Compose
console.log('Starting PostgreSQL...');
try {
  execSync('docker compose up -d db', { cwd: root, stdio: 'inherit' });
} catch {
  console.error('\nDocker is not running or docker compose failed.');
  console.error('Start Docker Desktop and try again.\n');
  process.exit(1);
}

// 3. Wait for Postgres to accept connections
console.log('Waiting for PostgreSQL to be ready...');
for (let i = 0; i < 30; i++) {
  try {
    execSync(
      'docker compose exec -T db pg_isready -U pecunity',
      { cwd: root, stdio: 'ignore' },
    );
    break;
  } catch {
    if (i === 29) {
      console.error('PostgreSQL did not become ready in time.');
      process.exit(1);
    }
    execSync('sleep 1');
  }
}
console.log('PostgreSQL ready.\n');

// 3b. Non-blocking hint if the local fork (RPC_URL) isn't reachable (TASK-8).
// Without this, a missing fork just shows up later as the indexer's
// misleading per-tick "failed to detect network" — looks like a backend bug.
const { hint: forkHint } = await checkFork({ envFilePath: envFile });
if (forkHint) console.log(`${forkHint}\n`);

// 4. Run Prisma migrations
console.log('Running Prisma migrations...');
execSync('npx prisma migrate dev --skip-generate', {
  cwd: backendDir,
  stdio: 'inherit',
});
console.log('');

// 5. Build the shared package once (frontend + backend consume its dist/),
//    then keep it rebuilding in watch mode alongside the dev servers.
console.log('Building shared package...');
execSync('pnpm --filter shared build', { cwd: root, stdio: 'inherit' });
console.log('');

// 6. Start shared watch + backend and frontend in parallel
const procs = [];

const sharedWatch = spawn('pnpm', ['shared:build:watch'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
});
sharedWatch.on('error', (e) => console.error('Shared watch error:', e.message));
procs.push(sharedWatch);

const backend = spawn('pnpm', ['backend:dev'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
});
backend.on('error', (e) => console.error('Backend error:', e.message));
procs.push(backend);

const frontend = spawn('pnpm', ['frontend:dev'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '1' },
});
frontend.on('error', (e) => console.error('Frontend error:', e.message));
procs.push(frontend);

console.log('\n  Backend:  http://localhost:3001');
console.log('  Frontend: http://localhost:5173\n');

// Graceful shutdown
function cleanup() {
  for (const p of procs) p.kill('SIGTERM');
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
