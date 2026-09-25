#!/usr/bin/env bash
# PreToolUse hook (Bash): deny any `git commit` whose message carries a Co-Authored-By trailer.
# Only the trailer form counts: the name followed by `:` (or `=`, as --trailer accepts) at the start of a
# message line, so prose naming the trailer mid-line passes. A message line starts after a newline, a `\n`
# escape, an opening quote, or a -m/--message/--trailer option.
# Reads the message from the command text (-m, --trailer, heredoc, $(cat ...)) and from any -F/--file argument.
set -euo pipefail

command=$(jq -r '.tool_input.command // ""')

# Only git commit invocations, including `git -C dir commit`, `git -C "a dir" commit` and `git -c k=v commit`.
# A shell word is a run of unquoted non-space characters and quoted strings; an option's argument is a word not
# starting with `-`.
piece='([^[:space:]"'\'']|"[^"]*"|'\''[^'\'']*'\'')'
arg='([^-[:space:]"'\'']|"[^"]*"|'\''[^'\'']*'\'')'"$piece*"
if ! grep -Eq '(^|[^[:alnum:]_-])git([[:space:]]+-'"$piece"'+([[:space:]]+'"$arg"')?)*[[:space:]]+commit([[:space:]]|$)' <<<"$command"; then
  exit 0
fi

message="$command"

# Append the contents of any message file named with -F/--file.
while IFS= read -r file; do
  file="${file%\"}"; file="${file#\"}"; file="${file%\'}"; file="${file#\'}"
  if [[ -f "$file" ]]; then
    message+=$'\n'"$(cat -- "$file")"
  fi
done < <(grep -Eo '(^|[[:space:]])(-F[[:space:]]*|--file(=|[[:space:]]+))[^[:space:]]+' <<<"$command" | sed -E 's/^[[:space:]]*(-F[[:space:]]*|--file(=|[[:space:]]+))//')

if grep -Eiq '(^|\\n|["'\'']|(-m|--message|--trailer)(=|[[:space:]]+))[[:space:]]*co-authored-by[[:space:]]*[:=]' <<<"$message"; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Commit message contains a Co-Authored-By trailer. Remove it and commit again."
    }
  }'
fi
exit 0
