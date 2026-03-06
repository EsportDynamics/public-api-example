from __future__ import annotations

import asyncio

from .client import RankacyClient
from .config import Settings
from .models import DashboardResponse, DemoWorkspaceResponse, HealthResponse
from .webhook_store import WebhookEventStore


class ShowcaseService:
    def __init__(self, *, client: RankacyClient, settings: Settings, webhook_store: WebhookEventStore) -> None:
        self._client = client
        self._settings = settings
        self._webhook_store = webhook_store

    async def health(self) -> HealthResponse:
        return HealthResponse(
            status="ok" if self._settings.token_configured else "needs_configuration",
            base_url=self._settings.base_url,
            api_base=self._settings.api_base,
            token_configured=self._settings.token_configured,
            token_preview=self._settings.token_preview,
            webhook_store_path=str(self._webhook_store.path),
            docs={
                "swagger_ui": f"{self._settings.base_url.rstrip('/')}/docs",
                "documentation": f"{self._settings.base_url.rstrip('/')}/ui/docs/",
                "local_swagger_ui": "http://localhost:9000/docs",
            },
        )

    async def dashboard(self) -> DashboardResponse:
        demos, highlights, resolutions, fps_options, credit, transactions = await asyncio.gather(
            self._client.list_demos(limit=self._settings.demo_page_size, offset=0),
            self._client.list_highlights(limit=self._settings.highlight_page_size, offset=0),
            self._client.list_resolutions(),
            self._client.list_fps_options(),
            self._client.get_credit(),
            self._client.get_transactions(limit=self._settings.highlight_page_size, offset=0),
        )
        return DashboardResponse(
            demos=demos,
            highlights=highlights,
            resolutions=resolutions,
            fps_options=fps_options,
            credit=credit,
            transactions=transactions,
            webhook_events=self._webhook_store.list_events(limit=50),
        )

    async def demo_workspace(self, demo_id: int, *, limit: int, offset: int) -> DemoWorkspaceResponse:
        demo, kills, players = await asyncio.gather(
            self._client.get_demo(demo_id),
            self._client.get_demo_kills(demo_id, limit=limit, offset=offset),
            self._client.get_demo_players(demo_id),
        )
        return DemoWorkspaceResponse(demo=demo, kills=kills, players=players)

    def list_webhook_events(self, *, limit: int = 100):
        return self._webhook_store.list_events(limit=limit)

    def record_webhook(self, *, headers: dict[str, str], payload: dict[str, object]):
        return self._webhook_store.record_event(headers=headers, payload=payload)
