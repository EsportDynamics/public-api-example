from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.webhook_store import WebhookEventStore


class WebhookEventStoreTests(unittest.TestCase):
    def test_record_event_deduplicates_by_event_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = WebhookEventStore(Path(tmp_dir) / "webhook-events.json")
            headers = {
                "X-Event-Id": "evt_123",
                "X-Event-Type": "demo.processed.success",
                "X-Request-Id": "evt_123",
            }
            payload = {
                "id": "evt_123",
                "type": "demo.processed.success",
                "data": {"demo_id": 52, "status": "success"},
            }

            record, duplicate = store.record_event(headers=headers, payload=payload)
            self.assertFalse(duplicate)
            self.assertEqual(record.event_id, "evt_123")

            same_record, duplicate = store.record_event(headers=headers, payload=payload)
            self.assertTrue(duplicate)
            self.assertEqual(same_record.event_id, "evt_123")

            events = store.list_events()
            self.assertEqual(events.total, 1)
            self.assertEqual(events.items[0].event_type, "demo.processed.success")

    def test_record_event_uses_payload_id_as_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            store = WebhookEventStore(Path(tmp_dir) / "webhook-events.json")
            record, duplicate = store.record_event(
                headers={},
                payload={
                    "id": "evt_payload",
                    "type": "highlight.processed.failed",
                    "data": {"demo_id": 1, "highlight_id": 2, "status": "failed"},
                },
            )
            self.assertFalse(duplicate)
            self.assertEqual(record.event_id, "evt_payload")


if __name__ == "__main__":
    unittest.main()
