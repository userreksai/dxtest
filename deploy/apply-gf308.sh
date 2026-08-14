#!/usr/bin/env bash
set -Eeuo pipefail

web_root=/var/www/canlexiang
nginx_target=/etc/nginx/sites-available/canlexiang
certificate=/var/www/cert.pem
private_key=/var/www/key.pem
backup="/root/canlexiang-yyy301-backup-$(date +%Y%m%d-%H%M%S)"

install -d -o root -g root -m 0700 "$backup"
cp -a "$web_root/login/index.html" "$backup/login-index.html"
cp -a "$web_root/about/index.html" "$backup/about-index.html"
cp -a "$web_root/assets/site.css" "$backup/site.css"
cp -a "$web_root/assets/login.js" "$backup/login.js"
cp -a "$web_root/assets/about.js" "$backup/about.js"
cp -a "$web_root/assets/og.png" "$backup/og.png"
cp -a "$nginx_target" "$backup/nginx-canlexiang.conf"

rollback() {
  trap - ERR
  install -o root -g root -m 0644 "$backup/login-index.html" "$web_root/login/index.html"
  install -o root -g root -m 0644 "$backup/about-index.html" "$web_root/about/index.html"
  install -o root -g root -m 0644 "$backup/site.css" "$web_root/assets/site.css"
  install -o root -g root -m 0644 "$backup/login.js" "$web_root/assets/login.js"
  install -o root -g root -m 0644 "$backup/about.js" "$web_root/assets/about.js"
  install -o root -g root -m 0644 "$backup/og.png" "$web_root/assets/og.png"
  install -o root -g root -m 0644 "$backup/nginx-canlexiang.conf" "$nginx_target"
  nginx -t
  systemctl reload nginx
  printf 'ROLLBACK=%s\n' "$backup" >&2
}
trap rollback ERR

test -s "$certificate"
test -s "$private_key"
certificate_key_hash="$(openssl x509 -in "$certificate" -pubkey -noout | openssl pkey -pubin -outform der | sha256sum | awk '{print $1}')"
private_key_hash="$(openssl pkey -in "$private_key" -pubout -outform der | sha256sum | awk '{print $1}')"
test "$certificate_key_hash" = "$private_key_hash"
openssl x509 -in "$certificate" -noout -checkend 86400

grep -q '关于灿乐祥' /tmp/canlexiang-login-index.html
grep -q '重庆灿乐祥科技有限公司' /tmp/canlexiang-login-index.html
grep -q '渝ICP备2025066131号-1' /tmp/canlexiang-login-index.html
grep -q '北京市丰台区造甲街120号永乐文智园15幢-A3-180' /tmp/canlexiang-about-index.html
grep -q 'run@ss308.com' /tmp/canlexiang-about-index.html
grep -q '北京总部' /tmp/canlexiang-about-index.html
grep -q '灿乐祥科技服务门户' /tmp/site-login.js
test -s /tmp/site-og.png
grep -q 'www.yyy301.com' /tmp/nginx-canlexiang.conf.codex

install -o root -g root -m 0644 /tmp/canlexiang-login-index.html "$web_root/login/index.html"
install -o root -g root -m 0644 /tmp/canlexiang-about-index.html "$web_root/about/index.html"
install -o root -g root -m 0644 /tmp/canlexiang-site.css "$web_root/assets/site.css"
install -o root -g root -m 0644 /tmp/site-login.js "$web_root/assets/login.js"
install -o root -g root -m 0644 /tmp/canlexiang-about.js "$web_root/assets/about.js"
install -o root -g root -m 0644 /tmp/site-og.png "$web_root/assets/og.png"
install -o root -g root -m 0644 /tmp/nginx-canlexiang.conf.codex "$nginx_target"
chown root:root "$certificate" "$private_key"
chmod 0644 "$certificate"
chmod 0600 "$private_key"

nginx -t
systemctl reload nginx
trap - ERR

printf 'BACKUP=%s\n' "$backup"
printf 'NGINX_RELOADED=1\n'
