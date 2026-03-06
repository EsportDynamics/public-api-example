from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .client import RankacyClient
from .config import Settings, get_settings
from .errors import ConfigurationError, RankacyApiError
from .models import (
    DemoUploadAcceptedResponse,
    DemoDetailResponse,
    DemoKillsResponse,
    DemoListResponse,
    DemoPlayersResponse,
    DemoStatus,
    HealthResponse,
    HighlightByKillRequest,
    HighlightCostResponse,
    HighlightDeletedResponse,
    HighlightDetailResponse,
    HighlightFpsListResponse,
    HighlightListResponse,
    HighlightQueuedResponse,
    HighlightResolutionListResponse,
    HighlightStatus,
    HighlightByTicksRequest,
    PublicMyCreditResponse,
    PublicMyTransactionsResponse,
    StandardHighlightRequest,
    WebhookEventListResponse,
)
from .services import ShowcaseService
from .webhook_store import WebhookEventStore

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"


def serve_page(filename: str) -> FileResponse:
    return FileResponse(STATIC_DIR / filename)


def create_app(settings: Settings | None = None) -> FastAPI:
    app_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        client = RankacyClient(app_settings)
        webhook_store = WebhookEventStore(app_settings.webhook_store_path)
        app.state.settings = app_settings
        app.state.client = client
        app.state.service = ShowcaseService(
            client=client,
            settings=app_settings,
            webhook_store=webhook_store,
        )
        yield
        await client.aclose()

    app = FastAPI(
        title="Rankacy Public API Showcase",
        summary="Small FastAPI integration demo for Rankacy highlights.",
        version="0.1.0",
        lifespan=lifespan,
    )
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.exception_handler(ConfigurationError)
    async def configuration_error_handler(_: Request, exc: ConfigurationError) -> JSONResponse:
        return JSONResponse(
            status_code=503,
            content={
                "detail": str(exc),
                "status_code": 503,
                "error_type": "configuration_error",
            },
        )

    @app.exception_handler(RankacyApiError)
    async def rankacy_error_handler(_: Request, exc: RankacyApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "status_code": exc.status_code,
                "error_type": exc.category,
                "endpoint": exc.endpoint,
                "upstream_payload": exc.payload,
            },
        )

    def get_service(request: Request) -> ShowcaseService:
        return request.app.state.service

    @app.get("/", include_in_schema=False)
    async def home() -> FileResponse:
        return serve_page("index.html")

    @app.get("/demos", include_in_schema=False)
    async def demos_page() -> FileResponse:
        return serve_page("demos.html")

    @app.get("/highlights", include_in_schema=False)
    async def highlights_page() -> FileResponse:
        return serve_page("highlights.html")

    @app.get("/webhooks", include_in_schema=False)
    async def webhooks_page() -> FileResponse:
        return serve_page("webhooks.html")

    @app.get("/showcase/health", response_model=HealthResponse, include_in_schema=False)
    async def showcase_health(request: Request) -> HealthResponse:
        return await get_service(request).health()

    @app.get("/showcase/webhook-events", response_model=WebhookEventListResponse, include_in_schema=False)
    async def showcase_webhook_events(
        request: Request,
        limit: int = Query(100, ge=1, le=500),
    ) -> WebhookEventListResponse:
        return get_service(request).list_webhook_events(limit=limit)

    @app.post("/api/public/v1/demos/upload", response_model=DemoUploadAcceptedResponse, tags=["Public API"])
    async def public_upload_demo_proxy(
        request: Request,
        file: Annotated[UploadFile, File(description="Counter-Strike .dem file to upload")],
        generate_auto_highlight: Annotated[bool, Form()] = False,
        resolution_id: Annotated[int | None, Form()] = None,
        fps_id: Annotated[int | None, Form()] = None,
    ) -> DemoUploadAcceptedResponse:
        content = await file.read()
        return await request.app.state.client.upload_demo(
            filename=file.filename or "upload.dem",
            content=content,
            content_type=file.content_type,
            generate_auto_highlight=generate_auto_highlight,
            resolution_id=resolution_id if generate_auto_highlight else None,
            fps_id=fps_id if generate_auto_highlight else None,
        )

    @app.get("/api/public/v1/demos", response_model=DemoListResponse, tags=["Public API"])
    async def public_list_demos_proxy(
        request: Request,
        limit: int = Query(app_settings.demo_page_size, ge=1, le=100),
        offset: int = Query(0, ge=0),
        status: DemoStatus | None = None,
        search: str | None = None,
        map_name: str | None = Query(default=None, alias="map"),
    ) -> DemoListResponse:
        return await request.app.state.client.list_demos(
            limit=limit,
            offset=offset,
            status=status.value if status else None,
            search=search,
            map_name=map_name,
        )

    @app.get("/api/public/v1/demos/{demo_id}", response_model=DemoDetailResponse, tags=["Public API"])
    async def public_get_demo_proxy(request: Request, demo_id: int) -> DemoDetailResponse:
        return await request.app.state.client.get_demo(demo_id)

    @app.get("/api/public/v1/demos/{demo_id}/kills", response_model=DemoKillsResponse, tags=["Public API"])
    async def public_get_demo_kills_proxy(
        request: Request,
        demo_id: int,
        limit: int = Query(app_settings.kill_page_size, ge=1, le=500),
        offset: int = Query(0, ge=0),
    ) -> DemoKillsResponse:
        return await request.app.state.client.get_demo_kills(demo_id, limit=limit, offset=offset)

    @app.get("/api/public/v1/demos/{demo_id}/players", response_model=DemoPlayersResponse, tags=["Public API"])
    async def public_get_demo_players_proxy(request: Request, demo_id: int) -> DemoPlayersResponse:
        return await request.app.state.client.get_demo_players(demo_id)

    @app.get("/api/public/v1/highlights", response_model=HighlightListResponse, tags=["Public API"])
    async def public_list_highlights_proxy(
        request: Request,
        limit: int = Query(app_settings.highlight_page_size, ge=1, le=100),
        offset: int = Query(0, ge=0),
        demo_id: int | None = None,
        status: HighlightStatus | None = None,
    ) -> HighlightListResponse:
        return await request.app.state.client.list_highlights(
            limit=limit,
            offset=offset,
            demo_id=demo_id,
            status=status.value if status else None,
        )

    @app.get("/api/public/v1/highlights/resolutions", response_model=HighlightResolutionListResponse, tags=["Public API"])
    async def public_list_resolutions_proxy(request: Request) -> HighlightResolutionListResponse:
        return await request.app.state.client.list_resolutions()

    @app.get("/api/public/v1/highlights/fps", response_model=HighlightFpsListResponse, tags=["Public API"])
    async def public_list_fps_proxy(request: Request) -> HighlightFpsListResponse:
        return await request.app.state.client.list_fps_options()

    @app.get("/api/public/v1/highlights/cost", response_model=HighlightCostResponse, tags=["Public API"])
    async def public_highlight_cost_proxy(
        request: Request,
        resolution_id: int = Query(..., ge=1),
        fps_id: int = Query(..., ge=1),
    ) -> HighlightCostResponse:
        return await request.app.state.client.estimate_cost(resolution_id=resolution_id, fps_id=fps_id)

    @app.post("/api/public/v1/highlights", response_model=HighlightQueuedResponse, tags=["Public API"])
    async def public_create_highlight_proxy(
        request: Request,
        payload: StandardHighlightRequest,
    ) -> HighlightQueuedResponse:
        return await request.app.state.client.create_standard_highlight(payload)

    @app.post("/api/public/v1/highlights/by-ticks", response_model=HighlightQueuedResponse, tags=["Public API"])
    async def public_create_highlight_by_ticks_proxy(
        request: Request,
        payload: HighlightByTicksRequest,
    ) -> HighlightQueuedResponse:
        return await request.app.state.client.create_highlight_by_ticks(payload)

    @app.post("/api/public/v1/highlights/by-kill", response_model=HighlightQueuedResponse, tags=["Public API"])
    async def public_create_highlight_by_kill_proxy(
        request: Request,
        payload: HighlightByKillRequest,
    ) -> HighlightQueuedResponse:
        return await request.app.state.client.create_highlight_by_kill(payload)

    @app.get("/api/public/v1/highlights/{highlight_id}", response_model=HighlightDetailResponse, tags=["Public API"])
    async def public_get_highlight_proxy(request: Request, highlight_id: int) -> HighlightDetailResponse:
        return await request.app.state.client.get_highlight(highlight_id)

    @app.delete("/api/public/v1/highlights/{highlight_id}", response_model=HighlightDeletedResponse, tags=["Public API"])
    async def public_delete_highlight_proxy(request: Request, highlight_id: int) -> HighlightDeletedResponse:
        return await request.app.state.client.delete_highlight(highlight_id)

    @app.get("/api/public/v1/me/credit", response_model=PublicMyCreditResponse, tags=["Public API"])
    async def public_me_credit_proxy(request: Request) -> PublicMyCreditResponse:
        return await request.app.state.client.get_credit()

    @app.get("/api/public/v1/me/transactions", response_model=PublicMyTransactionsResponse, tags=["Public API"])
    async def public_me_transactions_proxy(
        request: Request,
        limit: int = Query(app_settings.highlight_page_size, ge=1, le=100),
        offset: int = Query(0, ge=0),
    ) -> PublicMyTransactionsResponse:
        return await request.app.state.client.get_transactions(limit=limit, offset=offset)

    @app.post("/webhooks/rankacy", tags=["Webhooks"])
    async def rankacy_webhook(request: Request):
        try:
            payload = await request.json()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Webhook payload must be valid JSON.") from exc

        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Webhook payload must be a JSON object.")

        try:
            record, duplicate = get_service(request).record_webhook(
                headers=dict(request.headers),
                payload=payload,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        return {
            "ok": True,
            "duplicate": duplicate,
            "event_id": record.event_id,
            "event_type": record.event_type,
        }

    return app


app = create_app()
