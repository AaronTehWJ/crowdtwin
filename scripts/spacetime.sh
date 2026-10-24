#!/bin/sh
# Use the project-pinned runtime and identity without changing other projects.
set -eu
script="$0"
if [ -L "$script" ]; then script="$(dirname -- "$script")/$(readlink "$script")"; fi
root=$(CDPATH= cd -- "$(dirname -- "$script")/.." && pwd)
cli="$root/.local/spacetime-1.12.0/spacetimedb-cli"
if [ ! -x "$cli" ]; then
  echo 'Install SpacetimeDB 1.12.0 in .local/spacetime-1.12.0; see FACTORY_BUILD_PROMPT.md.' >&2
  exit 1
fi
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"
exec "$cli" --root-dir "$root/.local/spacetime-runtime" "$@"
