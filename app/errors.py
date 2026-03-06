from __future__ import annotations

from typing import Any


class ConfigurationError(RuntimeError):
    """Raised when required local configuration is missing."""


class RankacyApiError(Exception):
    """Wraps a non-success response from the Rankacy public API."""

    def __init__(
        self,
        *,
        status_code: int,
        detail: str,
        endpoint: str,
        payload: Any | None = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.endpoint = endpoint
        self.payload = payload

    @property
    def category(self) -> str:
        if self.status_code == 401:
            return "unauthorized"
        if self.status_code == 403:
            return "forbidden"
        if self.status_code == 404:
            return "not_found"
        if self.status_code == 422:
            return "validation_error"
        return "upstream_error"
