#!/usr/bin/env bash
set -eu

web_root=/var/www/canlexiang
backup="/root/canlexiang-footer-backup-$(date +%Y%m%d-%H%M%S)"

install -d -o root -g root -m 0700 "$backup/login" "$backup/about" "$backup/assets"
cp -a "$web_root/login/index.html" "$backup/login/index.html"
cp -a "$web_root/about/index.html" "$backup/about/index.html"
cp -a "$web_root/assets/site.css" "$backup/assets/site.css"

install -o root -g root -m 0644 /tmp/canlexiang-login-index.html "$web_root/login/index.html"
install -o root -g root -m 0644 /tmp/canlexiang-about-index.html "$web_root/about/index.html"
install -o root -g root -m 0644 /tmp/canlexiang-site.css "$web_root/assets/site.css"

nginx -t
printf 'BACKUP=%s\n' "$backup"
