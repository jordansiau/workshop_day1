import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pushing = process.argv.includes('--push');
const frozen = process.argv.includes('--frozen');
const trailer = 'Co-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>';
function run(command, args, cwd = root, capture = false) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${result.error?.message || result.stderr || result.status}`);
  return capture ? result.stdout.trim() : '';
}
const git = (args, cwd = root) => run('git', args, cwd, true);
const bundle = join(root, 'bundle');
if (git(['branch', '--show-current']) !== 'main') throw new Error('Run from the main checkout');
if (git(['diff', '--cached', '--name-only'])) throw new Error('Commit or unstage existing staged changes first');
for (const name of ['backend', 'frontend', 'cli', 'bundle']) {
  if (existsSync(join(root, name, '.git')) && git(['status', '--porcelain', '--untracked-files=normal'], join(root, name))) {
    throw new Error(`Refusing to overwrite dirty ${name} submodule`);
  }
}
run('git', ['submodule', 'update', '--init', ...(frozen ? [] : ['--remote']), 'backend', 'frontend', 'cli']);
run('git', ['submodule', 'update', '--init', 'bundle']);
const frontend = join(root, 'frontend');
// npm's JavaScript entry avoids Windows .cmd shell quoting and works on all platforms.
const npmCli = process.env.npm_execpath || (process.platform === 'win32'
  ? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js') : null);
function npm(args) { run(npmCli ? process.execPath : 'npm', npmCli ? [npmCli, ...args] : args, frontend); }
npm(['ci', '--no-fund', '--no-audit']);
npm(['run', 'build', '--', '--configuration', 'production']);
const browser = join(frontend, 'dist', 'snip-frontend', 'browser');
if (!existsSync(join(browser, 'index.html'))) throw new Error('Missing dist/snip-frontend/browser/index.html');
const revisions = Object.fromEntries(['backend', 'frontend', 'cli'].map(name => [name, git(['rev-parse', 'HEAD'], join(root, name))]));
const baseImage = 'oven/bun:1.4.4-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a';
mkdirSync(bundle, { recursive: true });
// Only the generated public tree is replaced, after the clean-submodule guard above.
rmSync(join(bundle, 'public'), { recursive: true, force: true });
cpSync(browser, join(bundle, 'public'), { recursive: true });
cpSync(join(root, 'backend', 'server.js'), join(bundle, 'server.js'));
cpSync(join(root, 'cli', 'cli.js'), join(bundle, 'cli.js'));
const files = {
  '.env': 'PUBLIC_DIR=./public\n',
  'README.md': '# Generated Snip release\n\nDo not hand-edit. Run scripts/build-bundle.mjs on main. One Bun process serves the web UI, API and redirects. Node 20+ can run cli.js; SNIP_API selects the API origin. Storage resets on restart.\n',
  'package.json': JSON.stringify({ name: 'snip-bundle', version: '1.0.0', private: true, scripts: { start: 'bun server.js' }, bin: { snip: './cli.js' } }, null, 2) + '\n',
  'release.json': JSON.stringify({ sources: revisions, baseImage }, null, 2) + '\n',
  'Dockerfile': `FROM ${baseImage}\nWORKDIR /app\nCOPY --chown=bun:bun . .\nENV PORT=3000 PUBLIC_DIR=./public\nUSER bun\nEXPOSE 3000\nHEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/links').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"\nCMD ["bun", "server.js"]\n`,
  '.dockerignore': '.git\nnode_modules\n*.log\n',
  'railway.json': JSON.stringify({ '$schema': 'https://railway.com/railway.schema.json', build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' }, deploy: { healthcheckPath: '/api/links', healthcheckTimeout: 30, restartPolicyType: 'ON_FAILURE', restartPolicyMaxRetries: 3 } }, null, 2) + '\n',
};
for (const [name, content] of Object.entries(files)) writeFileSync(join(bundle, name), content);
run('git', ['add', '--all'], bundle);
if (git(['diff', '--cached', '--name-only'], bundle)) {
  run('git', ['commit', '-m', 'Generate Snip release from pinned source revisions', '-m', trailer], bundle);
} else console.log('Bundle unchanged: nothing to commit');
// Explicit refspec works in detached submodules and retries an earlier unpushed build.
if (pushing) run('git', ['push', 'origin', 'HEAD:bundle'], bundle);
run('git', ['add', 'backend', 'frontend', 'cli', 'bundle']);
if (git(['diff', '--cached', '--name-only'])) {
  run('git', ['commit', '-m', 'Pin generated Snip release and source revisions', '-m', trailer]);
} else console.log('Superproject unchanged: nothing to commit');
if (pushing) run('git', ['push', 'origin', 'HEAD:main']);
console.log(JSON.stringify({ bundle: git(['rev-parse', 'HEAD'], bundle), sources: revisions }));
