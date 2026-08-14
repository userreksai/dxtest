#!/usr/bin/env bash
set -Eeuo pipefail

repo_url="${CLX_REPO_URL:-https://github.com/userreksai/dxtest.git}"
target_dir="${1:-/usr/local/clx}"

info() {
  printf '[灿乐祥] %s\n' "$1"
}

die() {
  printf '[灿乐祥] 错误：%s\n' "$1" >&2
  exit 1
}

on_error() {
  status=$?
  printf '[灿乐祥] 安装失败（脚本第 %s 行，退出码 %s）。\n' "${BASH_LINENO[0]:-未知}" "${status}" >&2
  exit "${status}"
}
trap on_error ERR

[[ "${EUID}" -eq 0 ]] || die "请使用 root 权限运行：sudo bash installclx.sh /usr/local/clx/"

for command_name in git nginx systemctl readlink; do
  command -v "${command_name}" >/dev/null 2>&1 || die "缺少命令 ${command_name}，请先安装 Git 和 Nginx。"
done

target_dir="$(readlink -m -- "${target_dir}")"
[[ "${target_dir}" != "/" ]] || die "安装目录不能是根目录 /。"

info "安装目录：${target_dir}"

if [[ -d "${target_dir}/.git" ]]; then
  [[ -z "$(git -C "${target_dir}" status --porcelain)" ]] || die "安装目录中存在未提交修改，为避免覆盖已停止更新。"
  info "发现现有源码，正在更新 main 分支……"
  git -C "${target_dir}" fetch origin main
  git -C "${target_dir}" checkout main
  git -C "${target_dir}" merge --ff-only origin/main
elif [[ -e "${target_dir}" ]] && [[ -n "$(find "${target_dir}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  die "安装目录不是 Git 仓库且不为空：${target_dir}"
else
  info "正在从 GitHub 下载灿乐祥站点源码……"
  install -d -o root -g root -m 0755 "$(dirname "${target_dir}")"
  git clone --depth 1 --branch main "${repo_url}" "${target_dir}"
fi

[[ -f "${target_dir}/deploy/deploy.sh" ]] || die "源码不完整，缺少 deploy/deploy.sh。"

info "源码准备完成，开始配置 Nginx 并发布站点……"
bash "${target_dir}/deploy/deploy.sh" "${target_dir}"
info "安装完成：http://www.yyy301.com:8080/"
