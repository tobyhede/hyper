#!/usr/bin/env bash
# PreToolUse hook (Bash): deny any `git commit` whose message carries a Co-Authored-By trailer.
# Only the trailer form counts (the name followed by a colon), so prose naming the trailer passes.
# Reads the message from the command text (-m, heredoc, $(cat ...)) and from any -F/--file argument.
set -euo pipefail

command=$(jq -r '.tool_input.command // ""')

# Only git commit invocations, including `git -C dir commit` and `git -c k=v commit`.
if ! grep -Eq '(^|[^[:alnum:]_-])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+commit([[:space:]]|$)' <<<"$command"; then
  exit 0
fi

message="$command"

# Append the contents of any message file named with -F/--file.
while IFS= read -r file; do
  file="${file%\"}"; file="${file#\"}"; file="${file%\'}"; file="${file#\'}"
  if [[ -f "$file" ]]; then
    message+=$'\n'"$(cat -- "$file")"
  fi
done < <(grep -Eo '(-F|--file)(=|[[:space:]]+)[^[:space:]]+' <<<"$command" | sed -E 's/^(-F|--file)(=|[[:space:]]+)//')

if grep -Eiq 'co-authored-by[[:space:]]*:' <<<"$message"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Commit message contains a Co-Authored-By trailer. Remove it and commit again."
    }
  }'
fi
exit 0
