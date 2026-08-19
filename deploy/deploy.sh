#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf '请使用 root 权限运行：sudo bash deploy/deploy.sh\n' >&2
  exit 1
fi

info() {
  printf '[灿乐祥部署] %s\n' "$1"
}

die() {
  printf '[灿乐祥部署] 错误：%s\n' "$1" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || die "缺少文件：$1"
}

project_dir="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
public_dir="${project_dir}/public"
nginx_source="${project_dir}/deploy/nginx-canlexiang.conf"
sms_installer="${project_dir}/deploy/install-sms-service.sh"

site_root=/var/www/canlexiang
release_root="${site_root}/releases"
current_link="${site_root}/current"
nginx_target=/etc/nginx/sites-available/canlexiang
nginx_enabled=/etc/nginx/sites-enabled/canlexiang
release_id="$(date +%Y%m%d-%H%M%S)-$$"
release_dir="${release_root}/${release_id}"
backup_dir="/var/backups/canlexiang/${release_id}"
previous_release=""

for command_name in nginx systemctl install cp grep ln readlink; do
  command -v "${command_name}" >/dev/null 2>&1 || die "缺少命令 ${command_name}，请先安装 Nginx。"
done

info "项目目录：${project_dir}"
require_file "${public_dir}/login/index.html"
require_file "${public_dir}/about/index.html"
require_file "${public_dir}/assets/site.css"
require_file "${public_dir}/assets/login.js"
require_file "${public_dir}/assets/og.png"
require_file "${nginx_source}"
require_file "${project_dir}/backend/sms_service.py"
require_file "${project_dir}/backend/requirements.txt"
require_file "${project_dir}/deploy/canlexiang-sms.service"
require_file "${sms_installer}"

if [[ -e "${current_link}" && ! -L "${current_link}" ]]; then
  die "${current_link} 已存在但不是符号链接，请先人工处理。"
fi

info "站点文件检查通过，正在创建发布版本……"

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

info "Nginx 配置检查通过，服务已重新加载。"
printf 'DEPLOYED_RELEASE=%s\n' "${release_dir}"
printf 'SITE_URL=http://www.yyy301.com:8080/\n'
printf 'BACKUP_DIR=%s\n' "${backup_dir}"
printf 'SMS_INSTALL_COMMAND=sudo bash %s %s\n' "${sms_installer}" "${project_dir}"
