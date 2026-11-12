#!/usr/bin/env python3
"""Read + import test for /v1/sessions endpoints using a production API key."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from crud_utils import (
    BASE_URL, RESET, RED, GREEN, auth_headers, expect_not_rejected, extract_id,
    get_api_key, log_fail, log_pass, log_step, make_client,
)


def main() -> None:
    api_key = get_api_key()
    client = make_client()
    headers = auth_headers(api_key)
    results: list[bool] = []

    # LIST
    log_step("[READ] GET /v1/sessions")
    resp = client.get(f"{BASE_URL}/v1/sessions", headers=headers)
    ok = expect_not_rejected(resp, "GET /v1/sessions")
    results.append(ok)

    # Try to get by ID if any sessions exist
    if ok and resp.status_code < 500:
        data = resp.json()
        items = []
        if isinstance(data, dict):
            items = data.get("data", data.get("items", data.get("results", [])))
        if items and len(items) > 0:
            first_id = extract_id(items[0])
            if first_id:
                log_step("[READ] GET /v1/sessions/{uuid}")
                resp2 = client.get(f"{BASE_URL}/v1/sessions/{first_id}", headers=headers)
                ok2 = expect_not_rejected(resp2, f"GET /v1/sessions/{first_id}")
                results.append(ok2)
        else:
            log_pass("  No sessions to read by ID (skipping)")

    total = len(results)
    passed = sum(results)
    failed = total - passed
    print(f"\n{'=' * 50}")
    if failed == 0:
        print(f"{GREEN}All {total}/{total} session tests passed.{RESET}")
    else:
        print(f"{RED}{passed}/{total} passed, {failed} failed.{RESET}")
    exit(1 if failed else 0)


if __name__ == "__main__":
    main()
