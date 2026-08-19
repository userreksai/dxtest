from __future__ import annotations

import base64
import hashlib
import hmac
import io
import logging
import os
import re
import secrets
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Callable

from flask import Flask, jsonify, request
from PIL import Image, ImageDraw, ImageFont
from werkzeug.middleware.proxy_fix import ProxyFix


PHONE_PATTERN = re.compile(r"^1[3-9]\d{9}$")
CODE_PATTERN = re.compile(r"^\d{6}$")
SMS_TEMPLATE = "【重庆灿乐祥科技】验证码{code}，我司人员不会向您索取验证码，谨防泄露！有问题请咨询我司人员"
SMSBAO_STATUS = {
    "0": "短信发送成功",
    "-1": "参数不全",
    "-2": "短信服务连接失败",
    "30": "短信服务认证失败",
    "40": "短信服务账号不存在",
    "41": "短信账户余额不足",
    "42": "短信账户已过期",
    "43": "短信服务限制了服务器 IP",
    "50": "短信内容未通过审核",
    "51": "手机号码不正确",
}


@dataclass(frozen=True)
class Settings:
    smsbao_user: str
    smsbao_api_key: str
    code_secret: bytes
    smsbao_product_id: str = ""
    smsbao_url: str = "https://api.smsbao.com/sms"
    code_ttl_seconds: int = 300
    captcha_ttl_seconds: int = 300
    resend_interval_seconds: int = 60
    max_phone_sends_per_hour: int = 5
    max_ip_sends_per_hour: int = 20

    @classmethod
    def from_environment(cls) -> "Settings":
        user = os.environ.get("SMSBAO_USER", "").strip()
        api_key = os.environ.get("SMSBAO_API_KEY", "").strip()
        secret = os.environ.get("SMS_CODE_SECRET", "").strip()
        if not user or not api_key:
            raise RuntimeError("SMSBAO_USER 和 SMSBAO_API_KEY 必须通过环境变量配置")
        if len(secret) < 32:
            raise RuntimeError("SMS_CODE_SECRET 必须至少包含 32 个字符")
        return cls(
            smsbao_user=user,
            smsbao_api_key=api_key,
            code_secret=secret.encode("utf-8"),
            smsbao_product_id=os.environ.get("SMSBAO_PRODUCT_ID", "").strip(),
        )


@dataclass
class CaptchaRecord:
    answer_digest: bytes
    client_ip: str
    expires_at: float
    attempts: int = 0


@dataclass
class CodeRecord:
    code_digest: bytes
    expires_at: float
    attempts: int = 0


class SmsBaoError(RuntimeError):
    def __init__(self, status_code: str):
        self.status_code = status_code
        super().__init__(SMSBAO_STATUS.get(status_code, f"短信服务返回未知状态：{status_code}"))


class SmsBaoClient:
    def __init__(self, settings: Settings):
        self.settings = settings

    def send(self, phone: str, content: str) -> None:
        params = {
            "u": self.settings.smsbao_user,
            "p": self.settings.smsbao_api_key,
            "m": phone,
            "c": content,
        }
        if self.settings.smsbao_product_id:
            params["g"] = self.settings.smsbao_product_id
        url = f"{self.settings.smsbao_url}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"User-Agent": "CanlexiangSmsService/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                status_code = response.read(64).decode("utf-8", errors="replace").strip().splitlines()[0]
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise SmsBaoError("-2") from exc
        if status_code != "0":
            raise SmsBaoError(status_code)


class VerificationState:
    def __init__(self, settings: Settings, clock: Callable[[], float] = time.time):
        self.settings = settings
        self.clock = clock
        self.lock = threading.RLock()
        self.captchas: dict[str, CaptchaRecord] = {}
        self.codes: dict[str, CodeRecord] = {}
        self.last_send_at: dict[str, float] = {}
        self.phone_events: dict[str, deque[float]] = defaultdict(deque)
        self.ip_events: dict[str, deque[float]] = defaultdict(deque)
        self.captcha_events: dict[str, deque[float]] = defaultdict(deque)

    def _digest(self, namespace: str, identity: str, value: str) -> bytes:
        payload = f"{namespace}:{identity}:{value}".encode("utf-8")
        return hmac.new(self.settings.code_secret, payload, hashlib.sha256).digest()

    @staticmethod
    def _prune(events: deque[float], cutoff: float) -> None:
        while events and events[0] <= cutoff:
            events.popleft()

    def _cleanup(self, now: float) -> None:
        for captcha_id in [key for key, item in self.captchas.items() if item.expires_at <= now]:
            self.captchas.pop(captcha_id, None)
        for phone in [key for key, item in self.codes.items() if item.expires_at <= now]:
            self.codes.pop(phone, None)

    def issue_captcha(self, client_ip: str, answer: str) -> str:
        now = self.clock()
        with self.lock:
            self._cleanup(now)
            events = self.captcha_events[client_ip]
            self._prune(events, now - 60)
            if len(events) >= 20:
                raise PermissionError("图形验证码请求过于频繁，请稍后再试")
            events.append(now)
            captcha_id = secrets.token_urlsafe(24)
            self.captchas[captcha_id] = CaptchaRecord(
                answer_digest=self._digest("captcha", captcha_id, answer.strip()),
                client_ip=client_ip,
                expires_at=now + self.settings.captcha_ttl_seconds,
            )
            return captcha_id

    def check_send_limits(self, phone: str, client_ip: str) -> int:
        now = self.clock()
        with self.lock:
            self._cleanup(now)
            last_send = self.last_send_at.get(phone, 0)
            retry_after = int(self.settings.resend_interval_seconds - (now - last_send))
            if retry_after > 0:
                return retry_after

            phone_events = self.phone_events[phone]
            ip_events = self.ip_events[client_ip]
            self._prune(phone_events, now - 3600)
            self._prune(ip_events, now - 3600)
            if len(phone_events) >= self.settings.max_phone_sends_per_hour:
                return 3600
            if len(ip_events) >= self.settings.max_ip_sends_per_hour:
                return 3600
            return 0

    def verify_captcha(self, captcha_id: str, answer: str, client_ip: str) -> bool:
        now = self.clock()
        with self.lock:
            self._cleanup(now)
            record = self.captchas.get(captcha_id)
            if not record or record.client_ip != client_ip:
                return False
            record.attempts += 1
            valid = hmac.compare_digest(
                record.answer_digest,
                self._digest("captcha", captcha_id, answer.strip()),
            )
            if valid or record.attempts >= 3:
                self.captchas.pop(captcha_id, None)
            return valid

    def reserve_send(self, phone: str, client_ip: str) -> int:
        now = self.clock()
        with self.lock:
            retry_after = self.check_send_limits(phone, client_ip)
            if retry_after:
                return retry_after
            self.last_send_at[phone] = now
            self.phone_events[phone].append(now)
            self.ip_events[client_ip].append(now)
            return 0

    def mark_provider_failure(self, phone: str) -> None:
        with self.lock:
            self.last_send_at[phone] = self.clock() - self.settings.resend_interval_seconds + 10

    def store_code(self, phone: str, code: str) -> None:
        now = self.clock()
        with self.lock:
            self.codes[phone] = CodeRecord(
                code_digest=self._digest("sms", phone, code),
                expires_at=now + self.settings.code_ttl_seconds,
            )

    def verify_code(self, phone: str, code: str) -> str:
        now = self.clock()
        with self.lock:
            self._cleanup(now)
            record = self.codes.get(phone)
            if not record:
                return "expired"
            record.attempts += 1
            valid = hmac.compare_digest(record.code_digest, self._digest("sms", phone, code))
            if valid:
                self.codes.pop(phone, None)
                return "ok"
            if record.attempts >= 5:
                self.codes.pop(phone, None)
                return "locked"
            return "invalid"


def render_captcha() -> tuple[str, str]:
    left = secrets.randbelow(8) + 1
    right = secrets.randbelow(8) + 1
    answer = str(left + right)
    question = f"{left} + {right} = ?"
    image = Image.new("RGB", (176, 54), "#fff6ef")
    draw = ImageDraw.Draw(image)
    palette = ("#a41127", "#760b19", "#ef5c43", "#d28b77")
    for _ in range(7):
        x1, y1 = secrets.randbelow(176), secrets.randbelow(54)
        x2, y2 = secrets.randbelow(176), secrets.randbelow(54)
        draw.line((x1, y1, x2, y2), fill=secrets.choice(palette), width=1)
    for _ in range(35):
        x, y = secrets.randbelow(176), secrets.randbelow(54)
        draw.point((x, y), fill=secrets.choice(palette))
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 27)
    except OSError:
        font = ImageFont.load_default()
    bounds = draw.textbbox((0, 0), question, font=font)
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    draw.rounded_rectangle((8, 7, 168, 47), radius=5, fill="#fffaf7", outline="#e7c8c0")
    draw.text(((176 - width) / 2, (54 - height) / 2 - 2), question, fill="#760b19", font=font)
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    encoded = base64.b64encode(output.getvalue()).decode("ascii")
    return answer, f"data:image/png;base64,{encoded}"


def mask_phone(phone: str) -> str:
    return f"{phone[:3]}****{phone[-4:]}"


def create_app(
    settings: Settings | None = None,
    sms_client: SmsBaoClient | None = None,
    clock: Callable[[], float] = time.time,
    captcha_factory: Callable[[], tuple[str, str]] = render_captcha,
) -> Flask:
    settings = settings or Settings.from_environment()
    sms_client = sms_client or SmsBaoClient(settings)
    state = VerificationState(settings, clock)
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = 4096
    app.json.ensure_ascii = False
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
    app.extensions["sms_state"] = state
    logger = logging.getLogger("canlexiang.sms")

    def client_ip() -> str:
        return request.remote_addr or "unknown"

    def error(message: str, status: int, retry_after: int | None = None):
        body = {"ok": False, "message": message}
        if retry_after is not None:
            body["retry_after"] = retry_after
        response = jsonify(body)
        response.status_code = status
        if retry_after is not None:
            response.headers["Retry-After"] = str(retry_after)
        return response

    @app.after_request
    def secure_api_response(response):
        if request.path.startswith("/api/") or request.path == "/health":
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/health")
    @app.get("/api/sms/health")
    def health():
        return jsonify({"ok": True, "service": "canlexiang-sms"})

    @app.get("/api/sms/captcha")
    def captcha():
        try:
            answer, image_data = captcha_factory()
            captcha_id = state.issue_captcha(client_ip(), answer)
        except PermissionError as exc:
            return error(str(exc), 429, 60)
        return jsonify(
            {
                "ok": True,
                "captcha_id": captcha_id,
                "image": image_data,
                "expires_in": settings.captcha_ttl_seconds,
            }
        )

    @app.post("/api/sms/send-code")
    def send_code():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return error("请求格式不正确", 400)
        phone = str(payload.get("phone", "")).strip()
        captcha_id = str(payload.get("captcha_id", "")).strip()
        captcha_answer = str(payload.get("captcha_answer", "")).strip()
        if not PHONE_PATTERN.fullmatch(phone):
            return error("请输入正确的中国大陆手机号", 400)
        if not captcha_id or not captcha_answer:
            return error("请完成图形验证", 400)

        ip_address = client_ip()
        retry_after = state.check_send_limits(phone, ip_address)
        if retry_after:
            return error("发送过于频繁，请稍后再试", 429, retry_after)
        if not state.verify_captcha(captcha_id, captcha_answer, ip_address):
            return error("图形验证码错误或已过期，请刷新后重试", 400)

        code = f"{secrets.randbelow(900000) + 100000:06d}"
        content = SMS_TEMPLATE.format(code=code)
        retry_after = state.reserve_send(phone, ip_address)
        if retry_after:
            return error("发送过于频繁，请稍后再试", 429, retry_after)
        try:
            sms_client.send(phone, content)
        except SmsBaoError as exc:
            state.mark_provider_failure(phone)
            logger.warning("短信宝拒绝向 %s 发送短信：%s", mask_phone(phone), exc)
            return error("短信暂时发送失败，请稍后重试", 502, 10)
        except Exception:
            state.mark_provider_failure(phone)
            logger.exception("短信服务调用异常，手机号：%s", mask_phone(phone))
            return error("短信暂时发送失败，请稍后重试", 502, 10)

        state.store_code(phone, code)
        logger.info("验证码已发送至 %s", mask_phone(phone))
        return jsonify(
            {
                "ok": True,
                "message": "验证码已发送",
                "expires_in": settings.code_ttl_seconds,
                "retry_after": settings.resend_interval_seconds,
            }
        )

    @app.post("/api/sms/verify-code")
    def verify_code():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return error("请求格式不正确", 400)
        phone = str(payload.get("phone", "")).strip()
        code = str(payload.get("code", "")).strip()
        if not PHONE_PATTERN.fullmatch(phone) or not CODE_PATTERN.fullmatch(code):
            return error("手机号或验证码格式不正确", 400)
        result = state.verify_code(phone, code)
        if result == "ok":
            return jsonify({"ok": True, "message": "验证成功"})
        if result == "locked":
            return error("错误次数过多，请重新获取验证码", 429, 60)
        if result == "expired":
            return error("验证码不存在或已过期，请重新获取", 400)
        return error("验证码不正确", 400)

    @app.errorhandler(413)
    def request_too_large(_exc):
        return error("请求内容过大", 413)

    return app
