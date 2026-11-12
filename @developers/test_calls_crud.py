#!/usr/bin/env python3
"""Read + update test for /v1/calls endpoints using a production API key."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from crud_utils import (
    BASE_URL, RESET, RED, GREEN, auth_headers, expect_not_rejected, extract_id,
    get_api_key, log_fail, log_pass, log_step, make_client,
    timestamp,
)


def main() -> None:
    api_key = get_api_key()
    client = make_client()
    headers = auth_headers(api_key)
    results: list[bool] = []

    # LIST
    log_step("[READ] GET /v1/calls")
    resp = client.get(f"{BASE_URL}/v1/calls", headers=headers)
    ok = expect_not_rejected(resp, "GET /v1/calls")
    results.append(ok)

    # STATS
    log_step("[READ] GET /v1/calls/stats/organization")
    resp = client.get(f"{BASE_URL}/v1/calls/stats/organization", headers=headers)
    ok = expect_not_rejected(resp, "GET /v1/calls/stats/organization")
    results.append(ok)

    # ACTIVE COUNT
    log_step("[READ] GET /v1/calls/active/count")
    resp = client.get(f"{BASE_URL}/v1/calls/active/count", headers=headers)
    ok = expect_not_rejected(resp, "GET /v1/calls/active/count")
    results.append(ok)

    # Try to update first call if any exist
    if ok and resp.status_code < 500:
        list_resp = client.get(f"{BASE_URL}/v1/calls", headers=headers)
        if list_resp.status_code < 500:
            data = list_resp.json()
            items = data.get("data", []) if isinstance(data, dict) else []
            if items and len(items) > 0:
                call_id = extract_id(items[0])
                if call_id:
                    log_step("[UPDATE] PUT /v1/calls/{uuid}")
                    ts = timestamp()
                    payload = {"summary": f"Updated via CRUD test at {ts}"}
                    resp2 = client.put(f"{BASE_URL}/v1/calls/{call_id}", json=payload, headers=headers)
                    ok2 = expect_not_rejected(resp2, f"PUT /v1/calls/{call_id}")
                    results.append(ok2)

    if len(results) == 3:
        log_pass("  No calls to update (skipping)")

    total = len(results)
    passed = sum(results)
    failed = total - passed
    print(f"\n{'=' * 50}")
    if failed == 0:
        print(f"{GREEN}All {total}/{total} call tests passed.{RESET}")
    else:
        print(f"{RED}{passed}/{total} passed, {failed} failed.{RESET}")
    exit(1 if failed else 0)


if __name__ == "__main__":
    main()
