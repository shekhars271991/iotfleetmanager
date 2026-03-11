"""Investigation state definition for LangGraph workflow."""

from typing import TypedDict, Any
from typing_extensions import Required


class InvestigationState(TypedDict, total=False):
    investigation_id: Required[str]
    alert_id: Required[str]
    device_id: Required[str]

    # Context gathered by collect_context node
    device_info: dict
    alert_info: dict
    group_info: dict
    group_devices: list
    telemetry: list
    active_rules: list
    redundancy_peers: list
    nearby_devices: list

    # Agent node state
    agent_messages: list
    tool_calls: list
    iterations: int
    evidence: dict

    # Final output
    analysis: dict
    status: str
    error: str
