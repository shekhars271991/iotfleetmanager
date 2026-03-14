import os
import aerospike
from aerospike import exception as aerospike_ex

from app.domain_config import CONFIG_NAMESPACE, CONFIG_SET, MODE_KEY, NAMESPACES, DEFAULT_MODE

AEROSPIKE_HOST = os.getenv("AEROSPIKE_HOST", "localhost")
AEROSPIKE_PORT = int(os.getenv("AEROSPIKE_PORT", "3000"))

_client = None


def get_client() -> aerospike.Client:
    global _client
    if _client is None:
        config = {"hosts": [(AEROSPIKE_HOST, AEROSPIKE_PORT)]}
        _client = aerospike.client(config).connect()
        _ensure_indexes()
    return _client


def get_active_mode() -> str:
    """Read the showcase mode from the config namespace. Returns 'iot' or 'security'."""
    client = get_client()
    try:
        _, _, bins = client.get((CONFIG_NAMESPACE, CONFIG_SET, MODE_KEY))
        mode = bins.get("value", DEFAULT_MODE)
        if mode in NAMESPACES:
            return mode
    except Exception:
        pass
    return DEFAULT_MODE


def get_namespace() -> str:
    """Return the Aerospike namespace for the currently active showcase mode."""
    return NAMESPACES[get_active_mode()]


def _ensure_indexes():
    """Create secondary indexes on both namespaces."""
    client = _client
    index_defs = [
        ("idx_device_status", "devices", "status", aerospike.INDEX_STRING),
        ("idx_device_type", "devices", "type", aerospike.INDEX_STRING),
        ("idx_device_group", "devices", "group_id", aerospike.INDEX_STRING),
        ("idx_device_redun", "devices", "redun_group", aerospike.INDEX_STRING),
        ("idx_alert_device", "alerts", "device_id", aerospike.INDEX_STRING),
        ("idx_alert_severity", "alerts", "severity", aerospike.INDEX_STRING),
        ("idx_alert_ack", "alerts", "acknowledged", aerospike.INDEX_NUMERIC),
        ("idx_telem_device", "telemetry", "device_id", aerospike.INDEX_STRING),
        ("idx_rule_scope_id", "rules", "scope_id", aerospike.INDEX_STRING),
    ]
    for ns in NAMESPACES.values():
        for name, set_name, bin_name, idx_type in index_defs:
            idx_name = f"{name}_{ns}" if ns != "iotfleet" else name
            try:
                if idx_type == aerospike.INDEX_STRING:
                    client.index_string_create(ns, set_name, bin_name, idx_name)
                else:
                    client.index_integer_create(ns, set_name, bin_name, idx_name)
            except aerospike_ex.IndexFoundError:
                pass
            except aerospike_ex.InvalidRequest:
                # Namespace may not exist yet (container not restarted)
                break
