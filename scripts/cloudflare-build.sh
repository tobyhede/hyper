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
have_node="$(node --version)"
if [ "${have_node#v}" != "$want_node" ]; then
  echo "Node ${have_node#v} is running, but .node-version pins ${want_node}." >&2
  echo "Workers Builds reads .node-version; set the build variable NODE_VERSION=${want_node} if it did not." >&2
  exit 1
fi

package_manager="$(node -p "require('./package.json').packageManager")"
want_pnpm="${package_manager#pnpm@}"
if [ "$(pnpm --version 2>/dev/null || true)" != "$want_pnpm" ]; then
  npm install --global "pnpm@${want_pnpm}"
fi
echo "Node $(node --version), pnpm $(pnpm --version)"

if [ -n "${VITE_HYPER_DEFAULT_SOURCE:-}" ]; then
  echo "Default location: ${VITE_HYPER_DEFAULT_SOURCE}"
else
  echo "No VITE_HYPER_DEFAULT_SOURCE: the bare domain asks for a location."
fi

pnpm install --frozen-lockfile
pnpm build:mount
