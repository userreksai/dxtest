#!/usr/bin/env bash
set -eu

target=/etc/nginx/sites-available/canlexiang
source_file=/tmp/nginx-canlexiang.conf.codex
backup="${target}.bak-$(date +%Y%m%d-%H%M%S)"

cp -a "$target" "$backup"
install -o root -g root -m 0644 "$source_file" "$target"

if nginx -t; then
    systemctl reload nginx
    printf 'BACKUP=%s\n' "$backup"
    printf 'NGINX_RELOADED=1\n'
else
    cp -a "$backup" "$target"
    nginx -t
    printf 'NGINX_RESTORED=1\n' >&2
    exit 1
fi
