// Computes the next release version from the Conventional Commits since the last `v*` tag:
// a breaking change bumps the major version, `feat` the minor one, `fix` and `perf` the patch one.
// Without any tag, the first release uses the version in package.json.
// Prints nothing when no commit since the last release calls for a new one.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

let lastTag = '';
try {
  lastTag = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*');
} catch {
  // No release yet
}

if (!lastTag) {
  console.log(JSON.parse(readFileSync('package.json', 'utf8')).version);
  process.exit(0);
}

const messages = git('log', `${lastTag}..HEAD`, '--format=%B%x00')
  .split('\0')
  .map((message) => message.trim())
  .filter(Boolean);

const BUMPS = ['none', 'patch', 'minor', 'major'];
let bump = 0;
for (const message of messages) {
  const header = message.split('\n')[0];
  if (/^\w+(\([^)]*\))?!:/.test(header) || /^BREAKING[ -]CHANGE:/m.test(message)) bump = Math.max(bump, 3);
  else if (/^feat(\([^)]*\))?:/.test(header)) bump = Math.max(bump, 2);
  else if (/^(fix|perf)(\([^)]*\))?:/.test(header)) bump = Math.max(bump, 1);
}

if (BUMPS[bump] === 'none') process.exit(0);

let [major, minor, patch] = lastTag.slice(1).split('.').map(Number);
if (BUMPS[bump] === 'major') [major, minor, patch] = [major + 1, 0, 0];
if (BUMPS[bump] === 'minor') [minor, patch] = [minor + 1, 0];
if (BUMPS[bump] === 'patch') patch += 1;
console.log(`${major}.${minor}.${patch}`);
