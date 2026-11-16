import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const release = JSON.parse(readFileSync(resolve(root, 'bundle/release.json')));
for (const name of ['backend', 'frontend', 'cli']) {
  const actual = execFileSync('git', ['-C', resolve(root, name), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(actual, release.sources[name], `${name} must match release provenance`);
}
for (const [source, target] of [['backend/server.js', 'bundle/server.js'], ['cli/cli.js', 'bundle/cli.js']]) {
  // Git may materialize different platform line endings; source semantics must match.
  const read = p => readFileSync(resolve(root, p), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(read(source), read(target), `${target} must be copied from source`);
}
assert(!JSON.parse(readFileSync(resolve(root, 'bundle/package.json'))).type, 'CLI must remain CommonJS');
assert.match(release.baseImage, /@sha256:[a-f0-9]{64}$/);
console.log('PASS: pinned source revisions, unmodified server and CLI, CommonJS packaging, base-image digest');
