from __future__ import annotations

from typing import Any

import httpx

from .config import Settings
from .errors import ConfigurationError, RankacyApiError
from .models import (
    DemoDetailResponse,
    DemoKillsResponse,
    DemoListResponse,
    DemoPlayersResponse,
    DemoUploadAcceptedResponse,
    HighlightByKillRequest,
    HighlightByTicksRequest,
    HighlightCostResponse,
    HighlightDeletedResponse,
    HighlightDetailResponse,
    HighlightFpsListResponse,
    HighlightListResponse,
    HighlightQueuedResponse,
    HighlightResolutionListResponse,
    PublicMyCreditResponse,
    PublicMyTransactionsResponse,
    StandardHighlightRequest,
)


class RankacyClient:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client = httpx.AsyncClient(timeout=settings.request_timeout_seconds)

    async def aclose(self) -> None:
        await self._client.aclose()

    def _ensure_ready(self) -> None:
        if not self._settings.token_configured:
            raise ConfigurationError(
                "RANKACY_TOKEN is not set. Add it to your environment or .env file before using the public API proxy routes."
            )

    def _build_url(self, path: str) -> str:
        return f"{self._settings.api_base}{path}"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._settings.token}",
            "Accept": "application/json",
        }

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        files: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> Any:
        self._ensure_ready()
        request_timeout = timeout if timeout is not None else self._settings.request_timeout_seconds

        try:
            response = await self._client.request(
                method,
                self._build_url(path),
                headers=self._headers(),
                params={key: value for key, value in (params or {}).items() if value is not None},
                json=json_body,
                data=data,
                files=files,
                timeout=request_timeout,
            )
        except httpx.TimeoutException as exc:
            detail = f"Request to Rankacy API timed out after {request_timeout:g} seconds."
            if path == "/demos/upload":
                detail += " The upload may still have been accepted upstream, so refresh the demos list before retrying."
            raise RankacyApiError(
                status_code=504,
                detail=detail,
                endpoint=path,
                payload={"error": str(exc)},
            ) from exc
        except httpx.RequestError as exc:
            raise RankacyApiError(
                status_code=502,
                detail=f"Unable to reach Rankacy API at {self._settings.base_url}.",
                endpoint=path,
                payload={"error": str(exc)},
            ) from exc

        if response.is_success:
            if response.headers.get("content-type", "").startswith("application/json"):
                return response.json()
            return response.text

        try:
            payload = response.json()
        except ValueError:
            payload = {"detail": response.text or response.reason_phrase}

        detail = payload.get("detail") if isinstance(payload, dict) else None
        if isinstance(detail, list):
            detail = "; ".join(item.get("msg", "validation error") for item in detail if isinstance(item, dict))

        raise RankacyApiError(
            status_code=response.status_code,
            detail=detail or response.reason_phrase or "Rankacy API request failed",
            endpoint=path,
            payload=payload,
        )

    async def upload_demo(
        self,
        *,
        filename: str,
        content: bytes,
        content_type: str | None,
        generate_auto_highlight: bool,
        resolution_id: int | None = None,
        fps_id: int | None = None,
    ) -> DemoUploadAcceptedResponse:
        data: dict[str, str] = {
            "generate_auto_highlight": str(generate_auto_highlight).lower(),
        }
        if resolution_id is not None:
            data["resolution_id"] = str(resolution_id)
        if fps_id is not None:
            data["fps_id"] = str(fps_id)

        payload = await self._request(
            "POST",
            "/demos/upload",
            data=data,
            files={
                "file": (
                    filename,
                    content,
                    content_type or "application/octet-stream",
                )
            },
            timeout=self._settings.upload_timeout_seconds,
        )
        return DemoUploadAcceptedResponse.model_validate(payload)

    async def list_demos(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        status: str | None = None,
        search: str | None = None,
        map_name: str | None = None,
    ) -> DemoListResponse:
        payload = await self._request(
            "GET",
            "/demos",
            params={
                "limit": limit,
                "offset": offset,
                "status": status,
                "search": search,
                "map": map_name,
            },
        )
        return DemoListResponse.model_validate(payload)

    async def get_demo(self, demo_id: int) -> DemoDetailResponse:
        payload = await self._request("GET", f"/demos/{demo_id}")
        return DemoDetailResponse.model_validate(payload)

    async def get_demo_kills(self, demo_id: int, *, limit: int = 50, offset: int = 0) -> DemoKillsResponse:
        payload = await self._request(
            "GET",
            f"/demos/{demo_id}/kills",
            params={"limit": limit, "offset": offset},
        )
        return DemoKillsResponse.model_validate(payload)

    async def get_demo_players(self, demo_id: int) -> DemoPlayersResponse:
        payload = await self._request("GET", f"/demos/{demo_id}/players")
        return DemoPlayersResponse.model_validate(payload)

    async def list_highlights(
        self,
        *,
        limit: int = 20,
        offset: int = 0,
        demo_id: int | None = None,
        status: str | None = None,
    ) -> HighlightListResponse:
        payload = await self._request(
            "GET",
            "/highlights",
            params={
                "limit": limit,
                "offset": offset,
                "demo_id": demo_id,
                "status": status,
            },
        )
        return HighlightListResponse.model_validate(payload)

    async def get_highlight(self, highlight_id: int) -> HighlightDetailResponse:
        payload = await self._request("GET", f"/highlights/{highlight_id}")
        return HighlightDetailResponse.model_validate(payload)

    async def delete_highlight(self, highlight_id: int) -> HighlightDeletedResponse:
        payload = await self._request("DELETE", f"/highlights/{highlight_id}")
        return HighlightDeletedResponse.model_validate(payload)

    async def list_resolutions(self) -> HighlightResolutionListResponse:
        payload = await self._request("GET", "/highlights/resolutions")
        return HighlightResolutionListResponse.model_validate(payload)

    async def list_fps_options(self) -> HighlightFpsListResponse:
        payload = await self._request("GET", "/highlights/fps")
        return HighlightFpsListResponse.model_validate(payload)

    async def estimate_cost(self, *, resolution_id: int, fps_id: int) -> HighlightCostResponse:
        payload = await self._request(
            "GET",
            "/highlights/cost",
            params={"resolution_id": resolution_id, "fps_id": fps_id},
        )
        return HighlightCostResponse.model_validate(payload)

    async def create_standard_highlight(self, request: StandardHighlightRequest) -> HighlightQueuedResponse:
        payload = await self._request("POST", "/highlights", json_body=request.model_dump(mode="json"))
        return HighlightQueuedResponse.model_validate(payload)

    async def create_highlight_by_ticks(self, request: HighlightByTicksRequest) -> HighlightQueuedResponse:
        payload = await self._request("POST", "/highlights/by-ticks", json_body=request.model_dump(mode="json"))
        return HighlightQueuedResponse.model_validate(payload)

    async def create_highlight_by_kill(self, request: HighlightByKillRequest) -> HighlightQueuedResponse:
        payload = await self._request("POST", "/highlights/by-kill", json_body=request.model_dump(mode="json"))
        return HighlightQueuedResponse.model_validate(payload)

    async def get_credit(self) -> PublicMyCreditResponse:
        payload = await self._request("GET", "/me/credit")
        return PublicMyCreditResponse.model_validate(payload)

    async def get_transactions(self, *, limit: int = 20, offset: int = 0) -> PublicMyTransactionsResponse:
        payload = await self._request(
            "GET",
            "/me/transactions",
            params={"limit": limit, "offset": offset},
        )
        return PublicMyTransactionsResponse.model_validate(payload)
