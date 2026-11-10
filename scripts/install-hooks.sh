#!/usr/bin/env bash
# Installs a pre-push hook that runs scripts/check-public.sh before every push.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
hook="$root/.git/hooks/pre-push"
cat > "$hook" <<'EOF'
#!/usr/bin/env bash
exec "$(git rev-parse --show-toplevel)/scripts/check-public.sh"
EOF
chmod +x "$hook" "$root/scripts/check-public.sh"
echo "Installed pre-push hook: $hook"
