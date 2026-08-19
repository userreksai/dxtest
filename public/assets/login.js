(function () {
  "use strict";

  const authKey = "canlexiang_portal_auth";
  const demoValue = "yyy301";
  const phonePattern = /^1[3-9]\d{9}$/;
  const codePattern = /^\d{6}$/;
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
  const phone = document.querySelector("#phone");
  const smsCode = document.querySelector("#smsCode");
  const phoneSubmit = document.querySelector("#phoneLoginButton");
  const getCodeButton = document.querySelector("#getCodeButton");
  const captchaAnswer = document.querySelector("#captchaAnswer");
  const captchaImage = document.querySelector("#captchaImage");
  const captchaLoading = document.querySelector("#captchaLoading");
  const refreshCaptcha = document.querySelector("#refreshCaptcha");

  let captchaId = "";
  let captchaPending = false;
  let sendingCode = false;
  let verifyingCode = false;
  let countdownRemaining = 0;
  let countdownTimer = null;

  function activateMode(mode) {
    const phoneActive = mode === "phone";
    phoneTab.classList.toggle("active", phoneActive);
    accountTab.classList.toggle("active", !phoneActive);
    phoneTab.setAttribute("aria-selected", String(phoneActive));
    accountTab.setAttribute("aria-selected", String(!phoneActive));
    phonePanel.hidden = !phoneActive;
    accountPanel.hidden = phoneActive;
    if (phoneActive) {
      phone.focus();
      if (!captchaId && !captchaPending) void loadCaptcha();
    } else {
      username.focus();
    }
  }

  function showMessage(text, type) {
    message.textContent = text;
    message.className = "form-message" + (type ? " " + type : "");
  }

  function showPhoneMessage(text, type) {
    phoneMessage.textContent = text;
    phoneMessage.className = "form-message" + (type ? " " + type : "");
  }

  function updateButton() {
    submit.disabled = !(username.value.trim() && password.value);
  }

  function updatePhoneButton() {
    phoneSubmit.disabled = verifyingCode || !(phonePattern.test(phone.value.trim()) && codePattern.test(smsCode.value.trim()));
  }

  function updateCodeButton() {
    getCodeButton.disabled = sendingCode || countdownRemaining > 0;
    getCodeButton.textContent = countdownRemaining > 0 ? `重新获取 ${countdownRemaining}s` : "获取验证码";
  }

  async function requestJson(url, options) {
    const response = await fetch(url, options);
    let data = {};
    try {
      data = await response.json();
    } catch (_error) {
      data = { message: "服务响应格式不正确" };
    }
    if (!response.ok || !data.ok) {
      const error = new Error(data.message || "请求失败，请稍后重试");
      error.status = response.status;
      error.retryAfter = Number(data.retry_after || 0);
      throw error;
    }
    return data;
  }

  async function loadCaptcha() {
    if (captchaPending) return;
    captchaPending = true;
    captchaId = "";
    refreshCaptcha.disabled = true;
    refreshCaptcha.classList.remove("loaded");
    captchaLoading.textContent = "加载中";
    try {
      const data = await requestJson("/api/sms/captcha", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      captchaId = data.captcha_id;
      captchaImage.src = data.image;
      refreshCaptcha.classList.add("loaded");
    } catch (error) {
      captchaLoading.textContent = "点击重试";
      showPhoneMessage(error.message || "图形验证码加载失败");
    } finally {
      captchaPending = false;
      refreshCaptcha.disabled = false;
    }
  }

  function startCountdown(seconds) {
    if (countdownTimer) window.clearInterval(countdownTimer);
    countdownRemaining = Math.max(1, Number(seconds) || 60);
    updateCodeButton();
    countdownTimer = window.setInterval(function () {
      countdownRemaining -= 1;
      if (countdownRemaining <= 0) {
        window.clearInterval(countdownTimer);
        countdownTimer = null;
        countdownRemaining = 0;
      }
      updateCodeButton();
    }, 1000);
  }

  async function sendSmsCode() {
    const phoneValue = phone.value.trim();
    if (!phonePattern.test(phoneValue)) {
      showPhoneMessage("请输入正确的中国大陆手机号。");
      phone.focus();
      return;
    }
    if (!captchaId || !captchaAnswer.value.trim()) {
      showPhoneMessage("请先完成图形验证。");
      captchaAnswer.focus();
      return;
    }

    sendingCode = true;
    updateCodeButton();
    showPhoneMessage("正在发送验证码……");
    try {
      const data = await requestJson("/api/sms/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          phone: phoneValue,
          captcha_id: captchaId,
          captcha_answer: captchaAnswer.value.trim(),
        }),
      });
      showPhoneMessage("验证码已发送，请在5分钟内完成验证。", "success");
      startCountdown(data.retry_after || 60);
      smsCode.focus();
    } catch (error) {
      showPhoneMessage(error.message || "验证码发送失败，请稍后重试。");
      if (error.retryAfter) startCountdown(error.retryAfter);
    } finally {
      sendingCode = false;
      captchaId = "";
      captchaAnswer.value = "";
      updateCodeButton();
      await loadCaptcha();
    }
  }

  username.addEventListener("input", function () { showMessage(""); updateButton(); });
  password.addEventListener("input", function () { showMessage(""); updateButton(); });
  phone.addEventListener("input", function () {
    phone.value = phone.value.replace(/\D/g, "").slice(0, 11);
    showPhoneMessage("");
    updatePhoneButton();
  });
  smsCode.addEventListener("input", function () {
    smsCode.value = smsCode.value.replace(/\D/g, "").slice(0, 6);
    showPhoneMessage("");
    updatePhoneButton();
  });
  captchaAnswer.addEventListener("input", function () {
    captchaAnswer.value = captchaAnswer.value.replace(/\D/g, "").slice(0, 2);
    showPhoneMessage("");
  });

  toggle.addEventListener("click", function () {
    const visible = password.type === "text";
    password.type = visible ? "password" : "text";
    toggle.textContent = visible ? "显示" : "隐藏";
    toggle.setAttribute("aria-label", visible ? "显示密码" : "隐藏密码");
  });
  phoneTab.addEventListener("click", function () { activateMode("phone"); });
  accountTab.addEventListener("click", function () { activateMode("account"); });
  refreshCaptcha.addEventListener("click", function () { void loadCaptcha(); });
  getCodeButton.addEventListener("click", function () { void sendSmsCode(); });

  phoneForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const phoneValue = phone.value.trim();
    const codeValue = smsCode.value.trim();
    if (!phonePattern.test(phoneValue) || !codePattern.test(codeValue)) {
      showPhoneMessage("请输入正确的手机号和6位短信验证码。");
      return;
    }
    verifyingCode = true;
    updatePhoneButton();
    showPhoneMessage("正在验证……");
    try {
      await requestJson("/api/sms/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ phone: phoneValue, code: codeValue }),
      });
      sessionStorage.setItem(authKey, `phone:${phoneValue}`);
      showPhoneMessage("验证成功，正在进入灿乐祥科技服务门户……", "success");
      window.setTimeout(function () { window.location.assign("../about/index.html"); }, 420);
    } catch (error) {
      showPhoneMessage(error.message || "验证码验证失败，请重新输入。");
      smsCode.value = "";
      smsCode.focus();
    } finally {
      verifyingCode = false;
      updatePhoneButton();
    }
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (username.value.trim() === demoValue && password.value === demoValue) {
      sessionStorage.setItem(authKey, demoValue);
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
  updatePhoneButton();
  updateCodeButton();
  activateMode("account");
})();
