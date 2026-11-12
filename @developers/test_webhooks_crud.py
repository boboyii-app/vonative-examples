#!/usr/bin/env python3
"""CRUD test for /v1/webhooks endpoints using a production API key."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from crud_utils import (
    BASE_URL, RESET, RED, GREEN, auth_headers, expect_not_rejected, extract_id,
    get_api_key, log_fail, log_pass, log_step, make_client,
    run_cleanup, timestamp, track_cleanup,
)


def main() -> None:
    api_key = get_api_key()
    client = make_client()
    headers = auth_headers(api_key)
    results: list[bool] = []
    resource_id = None
    ts = timestamp()

    # CREATE
    log_step("[CREATE] POST /v1/webhooks")
    payload = {
        "name": f"crud-test-webhook-{ts}",
        "url": "https://example.com/webhook-test",
        "event_types": ["call.ended"],
    }
    resp = client.post(f"{BASE_URL}/v1/webhooks", json=payload, headers=headers)
    ok = expect_not_rejected(resp, "POST /v1/webhooks")
    results.append(ok)
    if ok and resp.status_code < 500:
        rid = extract_id(resp.json())
        if rid:
            resource_id = rid
            track_cleanup(f"/v1/webhooks/{rid}")
            log_pass(f"  Created webhook ID: {rid}")

    # LIST
    log_step("[READ] GET /v1/webhooks")
    resp = client.get(f"{BASE_URL}/v1/webhooks", headers=headers)
    ok = expect_not_rejected(resp, "GET /v1/webhooks")
    results.append(ok)

    # GET BY ID
    if resource_id:
        log_step("[READ] GET /v1/webhooks/{uuid}")
        resp = client.get(f"{BASE_URL}/v1/webhooks/{resource_id}", headers=headers)
        ok = expect_not_rejected(resp, f"GET /v1/webhooks/{resource_id}")
        results.append(ok)

    # UPDATE
    if resource_id:
        log_step("[UPDATE] PUT /v1/webhooks/{uuid}")
        payload = {"name": f"crud-test-webhook-{ts}-updated"}
        resp = client.put(f"{BASE_URL}/v1/webhooks/{resource_id}", json=payload, headers=headers)
        ok = expect_not_rejected(resp, f"PUT /v1/webhooks/{resource_id}")
        results.append(ok)

    run_cleanup(client, api_key)

    total = len(results)
    passed = sum(results)
    failed = total - passed
    print(f"\n{'=' * 50}")
    if failed == 0:
        print(f"{GREEN}All {total}/{total} webhook CRUD tests passed.{RESET}")
    else:
        print(f"{RED}{passed}/{total} passed, {failed} failed.{RESET}")
    exit(1 if failed else 0)


if __name__ == "__main__":
    main()
