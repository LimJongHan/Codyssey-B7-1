import unittest

from app.auth.passwords import hash_password, verify_password


class PasswordTests(unittest.TestCase):
    def test_hashes_use_random_salts_and_verify(self):
        first = hash_password("correct-password")
        second = hash_password("correct-password")
        self.assertTrue(first.startswith("$argon2id$"))
        self.assertNotEqual(first, second)
        self.assertNotIn("correct-password", first)
        self.assertTrue(verify_password("correct-password", first))
        self.assertFalse(verify_password("wrong-password", first))

    def test_invalid_hash_is_not_an_authentication_bypass(self):
        for value in ("", "plaintext", "$argon2id$broken"):
            with self.subTest(value=value):
                self.assertFalse(verify_password("password", value))

    def test_password_is_not_trimmed_or_normalized(self):
        password = "  비밀번호가 있는 문장  "
        encoded = hash_password(password)
        self.assertTrue(verify_password(password, encoded))
        self.assertFalse(verify_password(password.strip(), encoded))
