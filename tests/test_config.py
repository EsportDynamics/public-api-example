from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.config import Settings, load_env_file


class LoadEnvFileTests(unittest.TestCase):
    def test_load_env_file_populates_missing_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            env_path = Path(tmp_dir) / ".env"
            env_path.write_text(
                "RANKACY_BASE_URL=https://example.com\nRANKACY_TOKEN=rk_test_123456\n",
                encoding="utf-8",
            )

            with patch.dict(os.environ, {}, clear=True):
                load_env_file(env_path)
                self.assertEqual(os.environ["RANKACY_BASE_URL"], "https://example.com")
                self.assertEqual(os.environ["RANKACY_TOKEN"], "rk_test_123456")

    def test_load_env_file_does_not_override_existing_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            env_path = Path(tmp_dir) / ".env"
            env_path.write_text("RANKACY_TOKEN=rk_from_env_file\n", encoding="utf-8")

            with patch.dict(os.environ, {"RANKACY_TOKEN": "rk_existing_token"}, clear=True):
                load_env_file(env_path)
                self.assertEqual(os.environ["RANKACY_TOKEN"], "rk_existing_token")

    def test_settings_masks_token_for_display(self) -> None:
        settings = Settings(
            base_url="https://highlights-api.rankacy.com",
            token="rk_live_1234567890",
            webhook_store_path=Path("data/webhook-events.json"),
        )
        self.assertTrue(settings.token_preview.startswith("rk_liv"))
        self.assertTrue(settings.token_preview.endswith("7890"))

    def test_settings_accept_custom_timeouts(self) -> None:
        settings = Settings(
            base_url="https://highlights-api.rankacy.com",
            token="rk_live_1234567890",
            webhook_store_path=Path("data/webhook-events.json"),
            request_timeout_seconds=45.0,
            upload_timeout_seconds=240.0,
        )
        self.assertEqual(settings.request_timeout_seconds, 45.0)
        self.assertEqual(settings.upload_timeout_seconds, 240.0)


if __name__ == "__main__":
    unittest.main()
