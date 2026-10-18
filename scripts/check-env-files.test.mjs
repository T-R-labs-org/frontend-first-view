import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const guard = fileURLToPath(new URL('./check-env-files.mjs', import.meta.url));

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'matrixqa-env-guard-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('matrixqa-env-guard-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
  git('init', '--quiet');
  const emptyBlob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: directory, input: '', encoding: 'utf8' }).trim();
  return {
    track: (filename) => git('update-index', '--add', '--cacheinfo', `100644,${emptyBlob},${filename}`),
    check: () => spawnSync(process.execPath, [guard], { cwd: directory, encoding: 'utf8' }),
    directory,
  };
}

test('example files and an ignored local env pass without reading values', (t) => {
  const repo = fixture(t);
  repo.track('.env.example');
  repo.track('config/.env.staging.example');
  repo.track('.gitignore');
  writeFileSync(join(repo.directory, '.gitignore'), '.env\n');
  writeFileSync(join(repo.directory, '.env'), 'LOCAL_ONLY=synthetic-private-fixture\n');
  const result = repo.check();
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-fixture/);
});

for (const filename of ['.env', 'config/.env.production', '.env.local', 'config/.ENV']) {
  test(`a tracked ${filename} fails even when its contents are empty`, (t) => {
    const repo = fixture(t);
    repo.track('.env.example');
    repo.track(filename);
    const result = repo.check();
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.ok(result.stderr.includes(JSON.stringify(filename)));
  });
}
