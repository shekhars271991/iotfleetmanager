import os
import aerospike
from aerospike import exception as aerospike_ex

AEROSPIKE_HOST = os.getenv("AEROSPIKE_HOST", "localhost")
AEROSPIKE_PORT = int(os.getenv("AEROSPIKE_PORT", "3000"))
NAMESPACE = os.getenv("AEROSPIKE_NAMESPACE", "iotfleet")

_client = None


def get_client() -> aerospike.Client:
    global _client
    if _client is None:
        config = {"hosts": [(AEROSPIKE_HOST, AEROSPIKE_PORT)]}
        _client = aerospike.client(config).connect()
        _ensure_indexes()
    return _client


def _ensure_indexes():
    client = _client
    index_defs = [
        ("idx_device_status", "devices", "status", aerospike.INDEX_STRING),
        ("idx_device_type", "devices", "type", aerospike.INDEX_STRING),
        ("idx_device_group", "devices", "group_id", aerospike.INDEX_STRING),
        ("idx_alert_device", "alerts", "device_id", aerospike.INDEX_STRING),
        ("idx_alert_severity", "alerts", "severity", aerospike.INDEX_STRING),
        ("idx_alert_ack", "alerts", "acknowledged", aerospike.INDEX_NUMERIC),
        ("idx_telem_device", "telemetry", "device_id", aerospike.INDEX_STRING),
    ]
    for name, set_name, bin_name, idx_type in index_defs:
        try:
            client.index_string_create(NAMESPACE, set_name, bin_name, name) \
                if idx_type == aerospike.INDEX_STRING \
                else client.index_integer_create(NAMESPACE, set_name, bin_name, name)
        except aerospike_ex.IndexFoundError:
            pass
