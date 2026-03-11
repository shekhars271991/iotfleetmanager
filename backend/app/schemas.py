from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class DeviceCreate(BaseModel):
    name: str
    type: str  # sensor, gateway, actuator, camera
    status: str = "online"  # online, offline, warning
    ip_address: Optional[str] = None
    firmware_ver: Optional[str] = None
    location: Optional[str] = None
    group_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    redundancy_group: Optional[str] = None
    metric_type: Optional[str] = None
    tags: Optional[dict[str, str]] = None


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    ip_address: Optional[str] = None
    firmware_ver: Optional[str] = None
    location: Optional[str] = None
    group_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    redundancy_group: Optional[str] = None
    metric_type: Optional[str] = None
    tags: Optional[dict[str, str]] = None


class DeviceOut(BaseModel):
    id: str
    name: str
    type: str
    status: str
    ip_address: Optional[str] = None
    firmware_ver: Optional[str] = None
    location: Optional[str] = None
    group_id: Optional[str] = None
    last_seen: Optional[str] = None
    created_at: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    redundancy_group: Optional[str] = None
    metric_type: Optional[str] = None
    tags: Optional[dict[str, str]] = None


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class GroupOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = ""


class AlertOut(BaseModel):
    id: str
    device_id: str
    message: str
    severity: str  # info, warning, critical
    created_at: Optional[str] = None
    acknowledged: bool = False
    rule_scope: str = ""  # "group" or "device"
    rule_id: str = ""


class DashboardStats(BaseModel):
    total: int
    online: int
    offline: int
    warning: int
    decommissioned: int = 0
    issues_count: int
    by_type: dict[str, int] = {}
    by_metric_type: dict[str, int] = {}
    groups: list[dict] = []
    alerts_summary: dict = {}
    investigations_summary: dict = {}
    active_rules: int = 0
    active_simulations: int = 0


class TelemetryOut(BaseModel):
    device_id: str
    timestamp: str
    metric: str = ""
    value: Optional[float] = None


class IssueDevice(BaseModel):
    device: DeviceOut
    alerts: list[AlertOut] = []


class SimulationOut(BaseModel):
    id: str
    name: str
    template: str
    device_ids: list[str] = []
    group_ids: list[str] = []
    status: str = "stopped"
    interval: int = 5
    config: dict = {}
    created_at: str = ""
    msgs_sent: int = 0
    cycle_count: int = 0


class AggJobOut(BaseModel):
    id: str
    group_id: str
    name: str
    metric: str
    function: str  # avg, min, max, count, p95
    level: str  # group or device
    window_secs: int = 3600
    enabled: bool = True
    created_at: str = ""


class RuleOut(BaseModel):
    id: str
    name: str
    scope: str  # group or device
    scope_id: str
    metric: str
    operator: str  # gt, lt, gte, lte
    threshold: float
    severity: str  # warning, critical
    enabled: bool = True
    created_at: str = ""


class AggResultOut(BaseModel):
    job_id: str
    job_name: str = ""
    group_id: str = ""
    device_id: str = ""
    metric: str = ""
    function: str = ""
    level: str = ""
    value: Optional[float] = None
    sample_count: int = 0
    window_secs: int = 3600
    computed_at: str = ""
