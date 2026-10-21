#!/usr/bin/env bash
# The build command for Workers Builds (docs/deploy-cloudflare.md): installs with
# the pinned Node and pnpm, then writes `pnpm build:mount`'s static build to
# packages/app/dist-mount, which wrangler.jsonc serves.
#
# Set the build variable SKIP_DEPENDENCY_INSTALL=1 so the install below, with
# the pinned pnpm, is the only one. VITE_HYPER_DEFAULT_SOURCE, when set, names
# the GitHub location the bare domain opens (ADR 0130).
set -euo pipefail

cd "$(dirname "$0")/.."

want_node="$(tr -d '[:space:]' < .node-version)"
have_node="$(node -p 'process.versions.node')"
# package.json's engines asks for this major at or above .node-version, so a
# later patch or minor builds and an older or different major does not.
if ! node -e '
  const [want, have] = process.argv.slice(1).map((v) => v.split(".").map(Number));
  const ok = have[0] === want[0] && (have[1] > want[1] || (have[1] === want[1] && have[2] >= want[2]));
  process.exit(ok ? 0 : 1);
' "$want_node" "$have_node"; then
  echo "Node ${have_node} is running, but .node-version pins ${want_node}." >&2
  echo "Workers Builds reads .node-version; set the build variable NODE_VERSION=${want_node} if it did not." >&2
  exit 1
fi
if [ "$have_node" != "$want_node" ]; then
  echo "Node ${have_node} is running; .node-version pins ${want_node}. Building anyway." >&2
fi

package_manager="$(node -p "require('./package.json').packageManager")"
want_pnpm="${package_manager#pnpm@}"
if [ "$(pnpm --version 2>/dev/null || true)" != "$want_pnpm" ]; then
  # Into a prefix of its own and first on PATH, so neither a read-only global
  # prefix nor an older pnpm earlier on PATH decides which one runs.
  prefix="${TMPDIR:-/tmp}/pnpm-${want_pnpm}"
  npm install --prefix "$prefix" --no-save --no-audit --no-fund "pnpm@${want_pnpm}"
  export PATH="${prefix}/node_modules/.bin:${PATH}"
fi
have_pnpm="$(pnpm --version)"
if [ "$have_pnpm" != "$want_pnpm" ]; then
  echo "pnpm ${have_pnpm} is running, but package.json pins ${want_pnpm}." >&2
  exit 1
fi
echo "Node $(node --version), pnpm ${have_pnpm}"

if [ -n "${VITE_HYPER_DEFAULT_SOURCE:-}" ]; then
  echo "Default location: ${VITE_HYPER_DEFAULT_SOURCE}"
else
  echo "No VITE_HYPER_DEFAULT_SOURCE: the bare domain asks for a location."
fi

pnpm install --frozen-lockfile
pnpm build:mount
