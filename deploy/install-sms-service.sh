#!/usr/bin/env bash
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  printf '请使用 root 权限运行：sudo bash deploy/install-sms-service.sh\n' >&2
  exit 1
fi

info() {
  printf '[灿乐祥短信服务] %s\n' "$1"
}

die() {
  printf '[灿乐祥短信服务] 错误：%s\n' "$1" >&2
  exit 1
}

require_file() {
  [[ -f "$1" ]] || die "缺少文件：$1"
}

project_dir="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
backend_source="${project_dir}/backend"
service_source="${project_dir}/deploy/canlexiang-sms.service"
nginx_source="${project_dir}/deploy/nginx-canlexiang.conf"
runtime_root=/opt/canlexiang-sms
release_root="${runtime_root}/releases"
current_link="${runtime_root}/current"
venv_dir="${runtime_root}/venv"
release_id="$(date +%Y%m%d-%H%M%S)-$$"
release_dir="${release_root}/${release_id}"
env_dir=/etc/canlexiang
env_file="${env_dir}/sms.env"
service_target=/etc/systemd/system/canlexiang-sms.service
nginx_target=/etc/nginx/sites-available/canlexiang
nginx_enabled=/etc/nginx/sites-enabled/canlexiang
previous_release=""

for command_name in python3 systemctl nginx install cp ln; do
  command -v "${command_name}" >/dev/null 2>&1 || die "缺少命令 ${command_name}。"
done

require_file "${backend_source}/sms_service.py"
require_file "${backend_source}/wsgi.py"
require_file "${backend_source}/requirements.txt"
require_file "${service_source}"
require_file "${nginx_source}"

if [[ -L "${current_link}" ]]; then
  previous_release="$(readlink -f "${current_link}")"
fi

rollback() {
  status=$?
  trap - ERR
  if [[ -n "${previous_release}" && -d "${previous_release}" ]]; then
    ln -sfn "${previous_release}" "${current_link}"
    systemctl restart canlexiang-sms.service || true
  fi
  printf '[灿乐祥短信服务] 安装失败，退出码：%s\n' "${status}" >&2
  exit "${status}"
}
trap rollback ERR

install -d -o root -g root -m 0755 "${runtime_root}" "${release_root}" "${release_dir}"
cp -a "${backend_source}/." "${release_dir}/"

if [[ ! -x "${venv_dir}/bin/python" ]]; then
  info "正在创建 Python 虚拟环境……"
  if ! python3 -m venv "${venv_dir}"; then
    die "无法创建虚拟环境，请先安装：apt-get install -y python3-venv"
  fi
fi

info "正在安装 Python 运行依赖……"
"${venv_dir}/bin/pip" install --disable-pip-version-check --no-input -r "${release_dir}/requirements.txt"

install -d -o root -g www-data -m 0750 "${env_dir}"
if [[ ! -f "${env_file}" ]]; then
  [[ -t 0 ]] || die "缺少 ${env_file}，请在交互式终端首次运行本脚本。"
  printf '短信宝账号：'
  IFS= read -r smsbao_user
  printf '短信宝 API Key（输入不会显示）：'
  IFS= read -rs smsbao_api_key
  printf '\n'
  [[ "${smsbao_user}" =~ ^[A-Za-z0-9_.@-]+$ ]] || die "短信宝账号格式不正确。"
  [[ "${smsbao_api_key}" =~ ^[A-Za-z0-9]+$ ]] || die "短信宝 API Key 格式不正确。"
  code_secret="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  env_tmp="$(mktemp)"
  printf 'SMSBAO_USER=%s\nSMSBAO_API_KEY=%s\nSMS_CODE_SECRET=%s\n' "${smsbao_user}" "${smsbao_api_key}" "${code_secret}" >"${env_tmp}"
  install -o root -g www-data -m 0640 "${env_tmp}" "${env_file}"
  rm -f "${env_tmp}"
  unset smsbao_api_key code_secret
  info "短信密钥已保存到受保护的服务器环境文件。"
else
  chown root:www-data "${env_file}"
  chmod 0640 "${env_file}"
  grep -q '^SMSBAO_USER=' "${env_file}" || die "${env_file} 缺少 SMSBAO_USER。"
  grep -q '^SMSBAO_API_KEY=' "${env_file}" || die "${env_file} 缺少 SMSBAO_API_KEY。"
  grep -q '^SMS_CODE_SECRET=' "${env_file}" || die "${env_file} 缺少 SMS_CODE_SECRET。"
  info "保留现有短信服务环境配置。"
fi

install -o root -g root -m 0644 "${service_source}" "${service_target}"
ln -sfn "${release_dir}" "${current_link}"
systemctl daemon-reload
systemctl enable --now canlexiang-sms.service
systemctl restart canlexiang-sms.service

service_ready=0
for _attempt in {1..20}; do
  if "${venv_dir}/bin/python" -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8091/health', timeout=2).read()" >/dev/null 2>&1; then
    service_ready=1
    break
  fi
  sleep 0.5
done
[[ "${service_ready}" -eq 1 ]] || die "短信服务未能正常启动，请运行 journalctl -u canlexiang-sms -n 100 查看日志。"

install -o root -g root -m 0644 "${nginx_source}" "${nginx_target}"
ln -sfn "${nginx_target}" "${nginx_enabled}"
nginx -t
systemctl reload nginx
trap - ERR

info "短信验证码服务已启动。"
printf 'SERVICE_STATUS=http://127.0.0.1:8091/health\n'
printf 'PUBLIC_API=http://www.yyy301.com:8080/api/sms/captcha\n'
