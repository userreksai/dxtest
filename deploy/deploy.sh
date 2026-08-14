#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf '请使用 root 权限运行：sudo bash deploy/deploy.sh\n' >&2
  exit 1
fi

project_dir="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
public_dir="${project_dir}/public"
nginx_source="${project_dir}/deploy/nginx-canlexiang.conf"

site_root=/var/www/canlexiang
release_root="${site_root}/releases"
current_link="${site_root}/current"
nginx_target=/etc/nginx/sites-available/canlexiang
nginx_enabled=/etc/nginx/sites-enabled/canlexiang
release_id="$(date +%Y%m%d-%H%M%S)-$$"
release_dir="${release_root}/${release_id}"
backup_dir="/var/backups/canlexiang/${release_id}"
previous_release=""

test -f "${public_dir}/login/index.html"
test -f "${public_dir}/about/index.html"
test -f "${public_dir}/assets/site.css"
test -f "${public_dir}/assets/login.js"
test -f "${public_dir}/assets/og.png"
test -f "${nginx_source}"

if [[ -L "${current_link}" ]]; then
  previous_release="$(readlink -f "${current_link}")"
fi

rollback() {
  trap - ERR
  if [[ -n "${previous_release}" && -d "${previous_release}" ]]; then
    ln -sfn "${previous_release}" "${current_link}"
  else
    rm -f "${current_link}"
  fi
  if [[ -f "${backup_dir}/nginx-canlexiang.conf" ]]; then
    install -o root -g root -m 0644 "${backup_dir}/nginx-canlexiang.conf" "${nginx_target}"
  fi
  nginx -t && systemctl reload nginx
  printf '部署失败，已回滚。备份目录：%s\n' "${backup_dir}" >&2
}
trap rollback ERR

install -d -o root -g root -m 0755 "${release_root}" "${release_dir}"
install -d -o root -g root -m 0700 "${backup_dir}"
cp -a "${public_dir}/." "${release_dir}/"

grep -q '灿乐祥动力网' "${release_dir}/login/index.html"
grep -q '重庆灿乐祥科技有限公司' "${release_dir}/about/index.html"
grep -q '渝ICP备2025066131号-1' "${release_dir}/about/index.html"
grep -q 'www.yyy301.com:8080' "${release_dir}/about/index.html"
grep -q 'yyy301' "${release_dir}/assets/login.js"

if [[ -f "${nginx_target}" ]]; then
  cp -a "${nginx_target}" "${backup_dir}/nginx-canlexiang.conf"
fi

install -o root -g root -m 0644 "${nginx_source}" "${nginx_target}"
ln -sfn "${nginx_target}" "${nginx_enabled}"
ln -sfn "${release_dir}" "${current_link}"

nginx -t
systemctl reload nginx
trap - ERR

printf 'DEPLOYED_RELEASE=%s\n' "${release_dir}"
printf 'SITE_URL=http://www.yyy301.com:8080/\n'
printf 'BACKUP_DIR=%s\n' "${backup_dir}"
