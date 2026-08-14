import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

test("静态页面包含完整灿乐祥品牌内容与资源", async () => {
  const [login, about, css, loginJs, aboutJs] = await Promise.all([
    readFile(new URL("public/login/index.html", root), "utf8"),
    readFile(new URL("public/about/index.html", root), "utf8"),
    readFile(new URL("public/assets/site.css", root), "utf8"),
    readFile(new URL("public/assets/login.js", root), "utf8"),
    readFile(new URL("public/assets/about.js", root), "utf8"),
  ]);

  assert.match(login, /<title>灿乐祥动力网<\/title>/);
  assert.match(login, /重庆灿乐祥科技有限公司/);
  assert.match(login, /手机号快捷登录/);
  assert.match(login, /获取验证码/);
  assert.match(login, /href="\.\.\/about\/index\.html">关于灿乐祥<\/a>/);
  assert.match(login, /渝ICP备2025066131号-1/);
  assert.match(about, /洞察产业趋势/);
  assert.match(about, /核心业务/);
  assert.match(about, /www\.yyy301\.com:7777/);
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
  assert.match(css, /--gold:#e16b3d/);
  assert.match(loginJs, /yyy301/);

  await Promise.all([
    access(new URL("public/assets/og.png", root)),
    access(new URL("nginx.example.conf", root)),
  ]);
});

test("登录脚本只接受指定账号并跳转到介绍页", async () => {
  const source = await readFile(new URL("public/assets/login.js", root), "utf8");
  const nodes = new Map();
  const makeNode = () => ({
    value: "", disabled: false, hidden: false, textContent: "", className: "", type: "text",
    listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; },
    attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, focus() {},
    classList: { values: new Set(), toggle(name, active) { active ? this.values.add(name) : this.values.delete(name); } },
  });
  [
    "loginForm", "username", "password", "loginButton", "formMessage", "togglePassword", "currentYear",
    "phoneTab", "accountTab", "phonePanel", "accountPanel", "phoneLoginForm", "phoneMessage", "getCodeButton",
  ].forEach((id) => nodes.set(id, makeNode()));
  const store = new Map();
  let destination = "";
  const context = {
    document: { querySelector(selector) { return nodes.get(selector.slice(1)); } },
    sessionStorage: { setItem(key, value) { store.set(key, value); } },
    window: { setTimeout(fn) { fn(); }, location: { assign(url) { destination = url; } } },
    Date,
  };
  vm.runInNewContext(source, context);

  assert.equal(nodes.get("phonePanel").hidden, false);
  assert.equal(nodes.get("accountPanel").hidden, true);
  nodes.get("getCodeButton").listeners.click();
  assert.match(nodes.get("phoneMessage").textContent, /功能开发中，请使用账号登录/);
  nodes.get("accountTab").listeners.click();
  assert.equal(nodes.get("phonePanel").hidden, true);
  assert.equal(nodes.get("accountPanel").hidden, false);

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
