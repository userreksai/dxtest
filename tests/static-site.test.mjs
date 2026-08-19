import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

test("静态页面包含完整灿乐祥品牌内容与资源", async () => {
  const [login, about, css, loginJs, aboutJs, smsService] = await Promise.all([
    readFile(new URL("public/login/index.html", root), "utf8"),
    readFile(new URL("public/about/index.html", root), "utf8"),
    readFile(new URL("public/assets/site.css", root), "utf8"),
    readFile(new URL("public/assets/login.js", root), "utf8"),
    readFile(new URL("public/assets/about.js", root), "utf8"),
    readFile(new URL("backend/sms_service.py", root), "utf8"),
  ]);

  assert.match(login, /<title>灿乐祥动力网<\/title>/);
  assert.match(login, /重庆灿乐祥科技有限公司/);
  assert.match(login, /演示账号/);
  assert.match(login, /<code>yyy301<\/code>/);
  assert.match(login, /手机快捷/);
  assert.match(login, /获取验证码/);
  assert.match(login, /安全验证/);
  assert.match(login, /验证码5分钟内有效/);
  assert.match(login, /href="\.\.\/about\/index\.html">关于灿乐祥<\/a>/);
  assert.match(login, /渝ICP备2025066131号-1/);
  assert.match(about, /洞察产业趋势/);
  assert.match(about, /核心业务/);
  assert.match(about, /www\.yyy301\.com:8080/);
  assert.match(about, /run@ss308\.com/);
  assert.match(about, /yangxueli@ss308\.com/);
  assert.match(about, /qiuyi@ss308\.com/);
  assert.match(about, /010-88825777/);
  assert.match(about, /北京市丰台区造甲街120号永乐文智园15幢-A3-180/);
  assert.match(about, /浙江省杭州市萧山区建设二路777号信息港六期2幢三层/);
  assert.match(about, /江苏省常熟市莫城街道莫干路2号云裳大厦A座/);
  assert.match(about, /四川省成都市高新区交子大道122号中海国际中心B座7层/);
  assert.match(about, /广州市海珠区新港东路1888号中洲中心北塔1066/);
  assert.match(about, /搜索“灿乐祥动力”/);
  assert.match(about, /微信公众号“灿乐祥动力网”/);
  assert.match(about, /重庆灿乐祥科技有限公司/);
  [
    "run@ss308.com",
    "yangxueli@ss308.com",
    "wanglei@ss308.com",
    "maihaochao@ss308.com",
    "yuming@ss308.com",
    "yuqian@ss308.com",
    "qiuyi@ss308.com",
  ].forEach((email) => assert.ok(about.includes(email), `缺少联系方式：${email}`));
  ["北京总部", "杭州分公司", "常熟分公司", "四川分公司", "广州分公司"]
    .forEach((office) => assert.ok(about.includes(office), `缺少办公地点：${office}`));
  assert.doesNotMatch(login + about + loginJs, /晟世辰|瀚海|gf308|hh308|2025066135/);
  assert.match(about, /渝ICP备2025066131号-1/);
  assert.doesNotMatch(about, /canlexiang_portal_auth/);
  assert.doesNotMatch(aboutJs, /canlexiang_portal_auth|logoutButton/);
  assert.doesNotMatch(login + about, /亿邦|其他登录方式|马蹄社/);
  assert.match(css, /--red: #a41127/);
  assert.match(css, /\.action-primary/);
  assert.match(css, /\.login-surface/);
  assert.match(loginJs, /yyy301/);
  assert.match(loginJs, /\/api\/sms\/captcha/);
  assert.match(loginJs, /\/api\/sms\/send-code/);
  assert.match(loginJs, /\/api\/sms\/verify-code/);
  assert.match(smsService, /【重庆灿乐祥科技】验证码\{code\}/);
  assert.match(smsService, /secrets\.randbelow\(900000\) \+ 100000/);
  assert.match(smsService, /os\.environ\.get\("SMSBAO_USER"/);
  assert.match(smsService, /os\.environ\.get\("SMSBAO_API_KEY"/);

  await Promise.all([
    access(new URL("public/assets/og.png", root)),
    access(new URL("nginx.example.conf", root)),
    access(new URL("installclx.sh", root)),
    access(new URL("deploy/deploy.sh", root)),
    access(new URL("deploy/nginx-canlexiang.conf", root)),
    access(new URL("deploy/install-sms-service.sh", root)),
    access(new URL("deploy/canlexiang-sms.service", root)),
    access(new URL("backend/requirements.txt", root)),
    access(new URL("backend/test_sms_service.py", root)),
  ]);
});

test("登录脚本支持演示账号和服务器短信验证码登录", async () => {
  const source = await readFile(new URL("public/assets/login.js", root), "utf8");
  const nodes = new Map();
  const makeNode = () => ({
    value: "", disabled: false, hidden: false, textContent: "", className: "", type: "text",
    listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; },
    attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, focus() {},
    classList: {
      values: new Set(),
      toggle(name, active) { active ? this.values.add(name) : this.values.delete(name); },
      add(name) { this.values.add(name); },
      remove(name) { this.values.delete(name); },
    },
  });
  [
    "loginForm", "username", "password", "loginButton", "formMessage", "togglePassword", "currentYear",
    "phoneTab", "accountTab", "phonePanel", "accountPanel", "phoneLoginForm", "phoneMessage",
    "phone", "smsCode", "phoneLoginButton", "getCodeButton", "captchaAnswer", "captchaImage",
    "captchaLoading", "refreshCaptcha",
  ].forEach((id) => nodes.set(id, makeNode()));
  const store = new Map();
  const requests = [];
  let destination = "";
  const fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url === "/api/sms/captcha") {
      return { ok: true, status: 200, json: async () => ({ ok: true, captcha_id: "captcha-1", image: "data:image/png;base64,dGVzdA==" }) };
    }
    if (url === "/api/sms/send-code") {
      return { ok: true, status: 200, json: async () => ({ ok: true, retry_after: 60 }) };
    }
    if (url === "/api/sms/verify-code") {
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  const context = {
    document: { querySelector(selector) { return nodes.get(selector.slice(1)); } },
    sessionStorage: { setItem(key, value) { store.set(key, value); } },
    window: {
      setTimeout(fn) { fn(); },
      setInterval() { return 1; },
      clearInterval() {},
      location: { assign(url) { destination = url; } },
    },
    fetch,
    Date,
  };
  vm.runInNewContext(source, context);

  assert.equal(nodes.get("phonePanel").hidden, true);
  assert.equal(nodes.get("accountPanel").hidden, false);
  nodes.get("phoneTab").listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nodes.get("phonePanel").hidden, false);
  assert.equal(nodes.get("accountPanel").hidden, true);
  assert.equal(nodes.get("captchaImage").src, "data:image/png;base64,dGVzdA==");

  nodes.get("phone").value = "13800138000";
  nodes.get("phone").listeners.input();
  nodes.get("captchaAnswer").value = "12";
  nodes.get("captchaAnswer").listeners.input();
  nodes.get("getCodeButton").listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(requests.some((item) => item.url === "/api/sms/send-code"));
  assert.match(nodes.get("phoneMessage").textContent, /验证码已发送/);

  nodes.get("smsCode").value = "123456";
  nodes.get("smsCode").listeners.input();
  assert.equal(nodes.get("phoneLoginButton").disabled, false);
  await nodes.get("phoneLoginForm").listeners.submit({ preventDefault() {} });
  assert.equal(store.get("canlexiang_portal_auth"), "phone:13800138000");
  assert.equal(destination, "../about/index.html");

  nodes.get("accountTab").listeners.click();
  assert.equal(nodes.get("phonePanel").hidden, true);
  assert.equal(nodes.get("accountPanel").hidden, false);
  destination = "";

  const username = nodes.get("username");
  const password = nodes.get("password");
  const form = nodes.get("loginForm");
  username.value = "wrong";
  password.value = "yyy301";
  username.listeners.input();
  password.listeners.input();
  form.listeners.submit({ preventDefault() {} });
  assert.equal(destination, "");
  assert.match(nodes.get("formMessage").textContent, /不正确/);

  username.value = "yyy301";
  password.value = "yyy301";
  username.listeners.input();
  password.listeners.input();
  form.listeners.submit({ preventDefault() {} });
  assert.equal(store.get("canlexiang_portal_auth"), "yyy301");
  assert.equal(destination, "../about/index.html");
});

test("8080 端口部署配置完整且短信服务只通过 Nginx 代理", async () => {
  const [installer, deployScript, smsInstaller, smsRequirements, systemdService, nginxConfig, docs] = await Promise.all([
    readFile(new URL("installclx.sh", root), "utf8"),
    readFile(new URL("deploy/deploy.sh", root), "utf8"),
    readFile(new URL("deploy/install-sms-service.sh", root), "utf8"),
    readFile(new URL("backend/requirements.txt", root), "utf8"),
    readFile(new URL("deploy/canlexiang-sms.service", root), "utf8"),
    readFile(new URL("deploy/nginx-canlexiang.conf", root), "utf8"),
    readFile(new URL("部署说明.md", root), "utf8"),
  ]);

  assert.match(nginxConfig, /listen 8080 default_server/);
  assert.match(nginxConfig, /www\.yyy301\.com/);
  assert.match(nginxConfig, /\/var\/www\/canlexiang\/current/);
  assert.match(nginxConfig, /location \^~ \/api\/sms\//);
  assert.match(nginxConfig, /proxy_pass http:\/\/127\.0\.0\.1:8091/);
  assert.match(deployScript, /nginx -t/);
  assert.match(deployScript, /systemctl reload nginx/);
  assert.match(deployScript, /rollback/);
  assert.match(deployScript, /require_file/);
  assert.match(deployScript, /缺少文件/);
  assert.match(installer, /https:\/\/github\.com\/userreksai\/dxtest\.git/);
  assert.match(installer, /git clone --depth 1 --branch main/);
  assert.match(installer, /deploy\/deploy\.sh/);
  assert.match(installer, /install-sms-service\.sh/);
  assert.match(installer, /安装目录不是 Git 仓库且不为空/);
  assert.match(docs, /sudo bash deploy\/deploy\.sh/);
  assert.match(docs, /sudo bash installclx\.sh \/usr\/local\/clx\//);
  assert.match(smsInstaller, /SMSBAO_API_KEY/);
  assert.match(smsInstaller, /read -rs smsbao_api_key/);
  assert.match(smsInstaller, /chmod 0640/);
  assert.match(smsInstaller, /venv_is_ready/);
  assert.match(smsInstaller, /bin\/python" -m pip install/);
  assert.match(smsInstaller, /venv-incomplete-/);
  assert.doesNotMatch(smsInstaller, /bin\/pip" install/);
  assert.match(smsInstaller, /--upgrade pip/);
  assert.match(smsInstaller, /https:\/\/pypi\.org\/simple/);
  assert.match(smsRequirements, /^blinker>=1\.9,<2$/m);
  assert.match(systemdService, /127\.0\.0\.1:8091/);
  assert.match(systemdService, /--workers 1 --threads 8/);
  assert.match(systemdService, /EnvironmentFile=\/etc\/canlexiang\/sms\.env/);
  assert.doesNotMatch(installer + deployScript + smsInstaller + systemdService + nginxConfig + docs, /7777|8888|gf308|hanhai/);
});
