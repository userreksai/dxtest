(function () {
  "use strict";
  const key = "canlexiang_portal_auth";
  const value = "yyy301";
  const form = document.querySelector("#loginForm");
  const username = document.querySelector("#username");
  const password = document.querySelector("#password");
  const submit = document.querySelector("#loginButton");
  const message = document.querySelector("#formMessage");
  const toggle = document.querySelector("#togglePassword");
  const phoneTab = document.querySelector("#phoneTab");
  const accountTab = document.querySelector("#accountTab");
  const phonePanel = document.querySelector("#phonePanel");
  const accountPanel = document.querySelector("#accountPanel");
  const phoneForm = document.querySelector("#phoneLoginForm");
  const phoneMessage = document.querySelector("#phoneMessage");
  const getCodeButton = document.querySelector("#getCodeButton");

  function activateMode(mode) {
    const phoneActive = mode === "phone";
    phoneTab.classList.toggle("active", phoneActive);
    accountTab.classList.toggle("active", !phoneActive);
    phoneTab.setAttribute("aria-selected", String(phoneActive));
    accountTab.setAttribute("aria-selected", String(!phoneActive));
    phonePanel.hidden = !phoneActive;
    accountPanel.hidden = phoneActive;
    if (!phoneActive) username.focus();
  }

  function showPhoneNotice() {
    phoneMessage.textContent = "功能开发中，请使用账号登录。";
    phoneMessage.className = "form-message feature-notice";
  }

  function updateButton() {
    submit.disabled = !(username.value.trim() && password.value);
  }
  function showMessage(text, type) {
    message.textContent = text;
    message.className = "form-message" + (type ? " " + type : "");
  }
  username.addEventListener("input", function () { showMessage(""); updateButton(); });
  password.addEventListener("input", function () { showMessage(""); updateButton(); });
  toggle.addEventListener("click", function () {
    const visible = password.type === "text";
    password.type = visible ? "password" : "text";
    toggle.textContent = visible ? "显示" : "隐藏";
    toggle.setAttribute("aria-label", visible ? "显示密码" : "隐藏密码");
  });
  phoneTab.addEventListener("click", function () { activateMode("phone"); });
  accountTab.addEventListener("click", function () { activateMode("account"); });
  getCodeButton.addEventListener("click", showPhoneNotice);
  phoneForm.addEventListener("submit", function (event) {
    event.preventDefault();
    showPhoneNotice();
  });
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (username.value.trim() === "yyy301" && password.value === "yyy301") {
      sessionStorage.setItem(key, value);
      submit.disabled = true;
      submit.textContent = "登录成功";
      showMessage("验证成功，正在进入灿乐祥科技服务门户……", "success");
      window.setTimeout(function () { window.location.assign("../about/index.html"); }, 420);
      return;
    }
    showMessage("账号或密码不正确，请重新输入。");
    password.value = "";
    updateButton();
    password.focus();
  });
  document.querySelector("#currentYear").textContent = new Date().getFullYear();
  updateButton();
  activateMode("phone");
})();
