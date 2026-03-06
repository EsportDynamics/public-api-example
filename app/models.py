from __future__ import annotations

from enum import Enum, StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RankacyModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DemoStatus(StrEnum):
    NEW = "NEW"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class HighlightStatus(StrEnum):
    NEW = "NEW"
    PROCESSING = "PROCESSING"
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"


class IntroMode(StrEnum):
    NONE = "NONE"
    GENERIC = "GENERIC"
    SCENIC = "SCENIC"


class ClipSpeed(float, Enum):
    QUARTER = 0.25
    HALF = 0.5
    NORMAL = 1.0
    DOUBLE = 2.0


class PaginationMeta(RankacyModel):
    total: int
    limit: int
    offset: int


class ApiErrorResponse(RankacyModel):
    detail: str


class ValidationErrorItem(RankacyModel):
    loc: list[str | int]
    msg: str
    type: str


class ValidationErrorResponse(RankacyModel):
    detail: str | list[ValidationErrorItem]


class DemoUploadAcceptedResponse(RankacyModel):
    demo_id: int
    status: str
    auto_highlight_requested: bool
    was_already_processed_successfully: bool
    user_demo_assignment: str
    auto_highlight_skip_reason: str | None = None
    auto_highlight_skip_message: str | None = None
    auto_highlight_estimated_credit: float | None = None
    auto_highlight_current_credit: float | None = None


class DemoListItem(RankacyModel):
    id: int
    hash: str
    map: str | None = None
    status: str
    upload_type: str
    size: int
    created_at: str | None = None


class DemoListResponse(RankacyModel):
    items: list[DemoListItem]
    pagination: PaginationMeta


class DemoDetailResponse(RankacyModel):
    id: int
    hash: str
    status: str
    upload_type: str
    size: int
    map: str | None = None
    team_1_score: int | None = None
    team_2_score: int | None = None
    created_at: str | None = None


class DemoKillItem(RankacyModel):
    demo_kill_id: int
    demo_id: int
    tick: int
    round: int
    attacker_steam_id: str | None = None
    victim_steam_id: str | None = None
    weapon: str | None = None
    item_id: int | None = None
    is_headshot: bool
    score: float


class DemoKillsResponse(RankacyModel):
    items: list[DemoKillItem]
    pagination: PaginationMeta


class DemoPlayerItem(RankacyModel):
    id: int
    player_name: str
    steam_id: str


class DemoPlayersResponse(RankacyModel):
    items: list[DemoPlayerItem]


class HighlightResolutionItem(RankacyModel):
    id: int
    name: str
    width: int
    height: int


class HighlightResolutionListResponse(RankacyModel):
    items: list[HighlightResolutionItem]


class HighlightFpsItem(RankacyModel):
    id: int
    name: str
    fps: int


class HighlightFpsListResponse(RankacyModel):
    items: list[HighlightFpsItem]


class HighlightCostResponse(RankacyModel):
    resolution_id: int
    fps_id: int
    resolution_credit: float
    fps_multiplier: float
    cost: float


class HighlightQueuedResponse(RankacyModel):
    highlight_id: int
    status: str


class HighlightDeletedResponse(RankacyModel):
    highlight_id: int
    status: str


class HighlightListItem(RankacyModel):
    id: int
    demo_id: int
    status: str
    title: str
    type: str
    resolution_id: int
    fps_id: int
    created_at: str | None = None


class HighlightListResponse(RankacyModel):
    items: list[HighlightListItem]
    pagination: PaginationMeta


class HighlightDetailKillItem(RankacyModel):
    demo_kill_id: int
    tick: int
    round: int
    attacker_steam_id: str | None = None
    attacker_name: str | None = None
    victim_steam_id: str | None = None
    victim_name: str | None = None
    weapon: str | None = None
    item_id: int | None = None
    is_headshot: bool
    score: float


class HighlightContainerDetailItem(RankacyModel):
    id: int
    start_tick: int
    end_tick: int
    speed: float
    steam_id: str
    player_name: str | None = None
    kills: list[HighlightDetailKillItem]


class HighlightDetailResponse(RankacyModel):
    id: int
    demo_id: int
    status: str
    title: str
    type: str
    resolution_id: int
    fps_id: int
    cost: float
    score: float
    length: float | None = None
    size: int | None = None
    use_transition: bool
    show_tick: bool
    intro: str
    created_at: str | None = None
    image_url: str | None = None
    video_url: str | None = None
    containers: list[HighlightContainerDetailItem]


class PublicMyCreditResponse(RankacyModel):
    user_id: int
    email: str
    is_staff: bool
    credit: float
    credit_bought: float
    credit_given: float
    created_at: str | None = None


class PublicMyTransactionItem(RankacyModel):
    id: int
    highlight_id: int
    demo_id: int
    resolution_id: int
    fps_id: int
    highlight_status: str
    credit: float
    created_at: str | None = None


class PublicMyTransactionsResponse(RankacyModel):
    items: list[PublicMyTransactionItem]
    pagination: PaginationMeta


class TickRange(StrictModel):
    start_tick: int = Field(ge=0)
    end_tick: int = Field(ge=0)
    steam_id: str = Field(min_length=1)
    speed: ClipSpeed = ClipSpeed.NORMAL


class StandardHighlightRequest(StrictModel):
    demo_id: int
    resolution_id: int = Field(ge=1)
    fps_id: int = Field(ge=1)
    title: str | None = Field(default=None, max_length=255)
    mode: str | None = Field(default=None, max_length=50)
    use_transition: bool = False
    show_tick: bool = False
    intro: IntroMode = IntroMode.NONE


class HighlightByTicksRequest(StrictModel):
    demo_id: int
    ticks: list[TickRange] = Field(min_length=1)
    resolution_id: int = Field(ge=1)
    fps_id: int = Field(ge=1)
    title: str | None = Field(default=None, max_length=255)
    show_tick: bool = False


class HighlightByKillRequest(StrictModel):
    demo_id: int | None = None
    demo_kill_ids: list[int] = Field(min_length=1)
    pre_ticks: int = Field(default=192, ge=0)
    post_ticks: int = Field(default=192, ge=0)
    speed: ClipSpeed = ClipSpeed.NORMAL
    resolution_id: int = Field(ge=1)
    fps_id: int = Field(ge=1)
    title: str | None = Field(default=None, max_length=255)
    show_tick: bool = False


class HealthResponse(StrictModel):
    status: str
    base_url: str
    api_base: str
    token_configured: bool
    token_preview: str
    webhook_store_path: str
    docs: dict[str, str]


class WebhookEventRecord(StrictModel):
    event_id: str
    event_type: str
    request_id: str | None = None
    received_at: str
    headers: dict[str, str]
    payload: dict[str, Any]


class WebhookEventListResponse(StrictModel):
    items: list[WebhookEventRecord]
    total: int


class DemoWorkspaceResponse(StrictModel):
    demo: DemoDetailResponse
    kills: DemoKillsResponse
    players: DemoPlayersResponse


class DashboardResponse(StrictModel):
    demos: DemoListResponse
    highlights: HighlightListResponse
    resolutions: HighlightResolutionListResponse
    fps_options: HighlightFpsListResponse
    credit: PublicMyCreditResponse
    transactions: PublicMyTransactionsResponse
    webhook_events: WebhookEventListResponse
