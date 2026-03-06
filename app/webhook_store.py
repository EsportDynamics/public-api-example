from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Mapping

from .models import WebhookEventListResponse, WebhookEventRecord


class WebhookEventStore:
    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = Lock()
        self._path.parent.mkdir(parents=True, exist_ok=True)
        if not self._path.exists():
            self._write_items([])

    @property
    def path(self) -> Path:
        return self._path

    def list_events(self, *, limit: int = 100) -> WebhookEventListResponse:
        items = [WebhookEventRecord.model_validate(item) for item in self._read_items()]
        items.sort(key=lambda item: item.received_at, reverse=True)
        visible_items = items[:limit]
        return WebhookEventListResponse(items=visible_items, total=len(items))

    def record_event(
        self,
        *,
        headers: Mapping[str, str],
        payload: Mapping[str, Any],
    ) -> tuple[WebhookEventRecord, bool]:
        normalized_headers = {key.lower(): value for key, value in headers.items()}
        event_id = normalized_headers.get("x-event-id") or str(payload.get("id") or "").strip()
        if not event_id:
            raise ValueError("Missing event id")

        event_type = normalized_headers.get("x-event-type") or str(payload.get("type") or "unknown")
        request_id = normalized_headers.get("x-request-id")

        with self._lock:
            items = self._read_items()
            for item in items:
                if item.get("event_id") == event_id:
                    return WebhookEventRecord.model_validate(item), True

            record = WebhookEventRecord(
                event_id=event_id,
                event_type=event_type,
                request_id=request_id,
                received_at=datetime.now(timezone.utc).isoformat(),
                headers=dict(headers),
                payload=dict(payload),
            )
            items.insert(0, record.model_dump(mode="json"))
            self._write_items(items)
            return record, False

    def _read_items(self) -> list[dict[str, Any]]:
        if not self._path.exists():
            return []

        content = self._path.read_text(encoding="utf-8").strip()
        if not content:
            return []

        payload = json.loads(content)
        return payload.get("items", [])

    def _write_items(self, items: list[dict[str, Any]]) -> None:
        tmp_path = self._path.with_suffix(".tmp")
        tmp_path.write_text(json.dumps({"items": items}, indent=2), encoding="utf-8")
        tmp_path.replace(self._path)
