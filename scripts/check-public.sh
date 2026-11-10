#!/usr/bin/env bash
# Blocks a push that would publish private files or secrets.
# Run by the pre-push hook (scripts/install-hooks.sh) and safe to run by hand.
set -euo pipefail

fail=0
tracked="$(git ls-files)"

# 1. Paths that must never be tracked in the public repo
blocked='(^|/)private/|(^|/)\.env($|\.)|(^|/)(BUILD_PLAN|GAME_DESIGN|VIDEO|SUBMISSION)\.md$|(^|/)\.near-credentials/|\.(pem|key|p12)$|\.(sql|dump)(\.gz)?$'
bad="$(printf '%s\n' "$tracked" | grep -E "$blocked" | grep -Ev '(^|/)\.env\.example$' || true)"
if [ -n "$bad" ]; then
  echo "Blocked: these files must not be public:"
  printf '  %s\n' $bad
  fail=1
fi

# 2. Secret-looking content in tracked files
#    NEAR private keys (long ed25519/secp256k1 strings), PEM private keys,
#    and common API key prefixes. Public NEAR keys are shorter and pass.
patterns='(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]{80,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|naa_[A-Za-z0-9]{16,}|sk-[A-Za-z0-9_-]{20,}|re_[A-Za-z0-9]{20,}'
hits="$(git grep -nIE "$patterns" -- . ':(exclude).env.example' ':(exclude)scripts/check-public.sh' || true)"
if [ -n "$hits" ]; then
  echo "Possible secrets in tracked files (first 120 characters of each line):"
  printf '%s\n' "$hits" | cut -c1-120
  fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo
  echo "Push stopped. Remove these from git (git rm --cached <file>), and rotate any real key."
  exit 1
fi
echo "check-public: OK"
