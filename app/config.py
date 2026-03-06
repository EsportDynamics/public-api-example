from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def load_env_file(path: Path | None = None) -> None:
    env_path = path or Path.cwd() / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()

        if value and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


@dataclass(slots=True)
class Settings:
    base_url: str
    token: str
    webhook_store_path: Path
    request_timeout_seconds: float = 30.0
    upload_timeout_seconds: float = 180.0
    demo_page_size: int = 10
    highlight_page_size: int = 10
    kill_page_size: int = 10

    @property
    def api_base(self) -> str:
        return f"{self.base_url.rstrip('/')}/api/public/v1"

    @property
    def token_configured(self) -> bool:
        return bool(self.token.strip())

    @property
    def token_preview(self) -> str:
        if not self.token_configured:
            return "missing"
        if len(self.token) <= 10:
            return "*" * len(self.token)
        return f"{self.token[:6]}...{self.token[-4:]}"


def get_settings() -> Settings:
    load_env_file()

    base_url = os.getenv("RANKACY_BASE_URL", "https://highlights-api.rankacy.com").strip()
    token = os.getenv("RANKACY_TOKEN", "").strip()
    webhook_store_path = Path.cwd() / "data" / "webhook-events.json"
    request_timeout_seconds = float(os.getenv("RANKACY_REQUEST_TIMEOUT_SECONDS", "30").strip())
    upload_timeout_seconds = float(os.getenv("RANKACY_UPLOAD_TIMEOUT_SECONDS", "180").strip())

    return Settings(
        base_url=base_url or "https://highlights-api.rankacy.com",
        token=token,
        webhook_store_path=webhook_store_path,
        request_timeout_seconds=request_timeout_seconds,
        upload_timeout_seconds=upload_timeout_seconds,
    )
