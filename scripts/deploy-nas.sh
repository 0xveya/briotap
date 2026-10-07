#!/usr/bin/env bash
set -euo pipefail

host=${BRIOTAP_DEPLOY_HOST:-nas}
directory=${BRIOTAP_DEPLOY_DIR:-/opt/briotap/app}
prepare=false
status=false
if [[ ${1:-} == --prepare && $# == 1 ]]; then prepare=true
elif [[ ${1:-} == --status && $# == 1 ]]; then status=true
elif [[ $# != 0 ]]; then echo "Usage: bash scripts/deploy-nas.sh [--prepare | --status]" >&2; exit 2; fi
export COMPOSE_PROJECT_NAME=briotap
[[ "$host" =~ ^[a-zA-Z0-9_.@-]+$ && "$directory" =~ ^/[a-zA-Z0-9_./-]+$ ]] || {
  echo 'Use an SSH host alias and an absolute deployment path without spaces or shell characters.' >&2
  exit 2
}
[[ "$directory" != / && "$directory" != *'/../'* && "$directory" != */.. ]] || { echo "Refusing unsafe deployment path." >&2; exit 2; }
socket="/run/user/$(id -u)/ssh-agent.socket"
if [[ -S "$socket" ]]; then export SSH_AUTH_SOCK="$socket"; fi
if "$status"; then
  ssh -o BatchMode=yes "$host" "cd '$directory' && bash scripts/stack-ops.sh status"
  exit
fi
ssh -o BatchMode=yes "$host" "mkdir -p '$directory' && test -f '$directory/.env'" || {
  echo "Create $directory/.env on $host before deployment, using .env.example and the public ORIGIN." >&2
  exit 1
}
rsync -az --delete --exclude='/.git/' --exclude='/.jj/' --exclude='/.env' --include='/.env.example' --exclude='/.env.*' \
  --exclude='/data/' --exclude='/node_modules/' --exclude='/generated/' --exclude='/.svelte-kit/' \
  --exclude='/build/' --exclude='/backups/' --exclude='/secrets/' ./ "$host:$directory/"
if "$prepare"; then
  ssh -o BatchMode=yes "$host" "cd '$directory' && COMPOSE_PROJECT_NAME=briotap docker compose build app && COMPOSE_PROJECT_NAME=briotap docker compose up -d --wait postgres"
else
  ssh -o BatchMode=yes "$host" "cd '$directory' && COMPOSE_PROJECT_NAME=briotap docker compose build app && COMPOSE_PROJECT_NAME=briotap docker compose up -d --no-build --wait && COMPOSE_PROJECT_NAME=briotap docker compose ps -a"
fi
