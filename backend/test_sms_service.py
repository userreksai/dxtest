import base64
import re
import unittest

from sms_service import SMS_TEMPLATE, Settings, create_app, render_captcha


class FakeSmsClient:
    def __init__(self):
        self.messages = []

    def send(self, phone, content):
        self.messages.append((phone, content))


class SmsServiceTest(unittest.TestCase):
    def setUp(self):
        self.client_adapter = FakeSmsClient()
        self.settings = Settings(
            smsbao_user="test-user",
            smsbao_api_key="test-key",
            code_secret=b"test-secret-that-is-longer-than-32-characters",
        )
        app = create_app(
            settings=self.settings,
            sms_client=self.client_adapter,
            captcha_factory=lambda: ("12", "data:image/png;base64,dGVzdA=="),
        )
        app.testing = True
        self.client = app.test_client()

    def captcha(self):
        response = self.client.get("/api/sms/captcha")
        self.assertEqual(response.status_code, 200)
        return response.get_json()["captcha_id"]

    def test_send_and_verify_six_digit_code(self):
        response = self.client.post(
            "/api/sms/send-code",
            json={"phone": "13800138000", "captcha_id": self.captcha(), "captcha_answer": "12"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("code", response.get_json())
        phone, content = self.client_adapter.messages[0]
        self.assertEqual(phone, "13800138000")
        match = re.search(r"验证码(\d{6})，", content)
        self.assertIsNotNone(match)
        code = match.group(1)
        self.assertEqual(content, SMS_TEMPLATE.format(code=code))

        wrong = self.client.post("/api/sms/verify-code", json={"phone": phone, "code": "000000"})
        self.assertEqual(wrong.status_code, 400)
        verified = self.client.post("/api/sms/verify-code", json={"phone": phone, "code": code})
        self.assertEqual(verified.status_code, 200)
        reused = self.client.post("/api/sms/verify-code", json={"phone": phone, "code": code})
        self.assertEqual(reused.status_code, 400)

    def test_rejects_invalid_phone_and_wrong_captcha(self):
        invalid_phone = self.client.post(
            "/api/sms/send-code",
            json={"phone": "123", "captcha_id": self.captcha(), "captcha_answer": "12"},
        )
        self.assertEqual(invalid_phone.status_code, 400)
        wrong_captcha = self.client.post(
            "/api/sms/send-code",
            json={"phone": "13900139000", "captcha_id": self.captcha(), "captcha_answer": "99"},
        )
        self.assertEqual(wrong_captcha.status_code, 400)
        self.assertEqual(self.client_adapter.messages, [])

    def test_enforces_resend_cooldown(self):
        phone = "13700137000"
        first = self.client.post(
            "/api/sms/send-code",
            json={"phone": phone, "captcha_id": self.captcha(), "captcha_answer": "12"},
        )
        self.assertEqual(first.status_code, 200)
        second = self.client.post(
            "/api/sms/send-code",
            json={"phone": phone, "captcha_id": self.captcha(), "captcha_answer": "12"},
        )
        self.assertEqual(second.status_code, 429)
        self.assertGreater(second.get_json()["retry_after"], 0)
        self.assertEqual(len(self.client_adapter.messages), 1)

    def test_real_captcha_is_a_png_with_numeric_answer(self):
        answer, image = render_captcha()
        self.assertRegex(answer, r"^\d{1,2}$")
        prefix = "data:image/png;base64,"
        self.assertTrue(image.startswith(prefix))
        self.assertTrue(base64.b64decode(image[len(prefix):]).startswith(b"\x89PNG\r\n\x1a\n"))


if __name__ == "__main__":
    unittest.main()
