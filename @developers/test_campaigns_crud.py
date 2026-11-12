#!/usr/bin/env python3
"""CRUD + lifecycle + CSV test for /v1/campaigns endpoints using a production API key."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from crud_utils import (
    BASE_URL, RESET, GREEN, YELLOW, auth_headers, expect_not_rejected, extract_id,
    get_api_key, log_fail, log_pass, log_step, make_client,
    run_cleanup, timestamp, track_cleanup,
)


def _pick_phone_number_id(client, headers) -> str | None:
    log_step("[PREP] GET /v1/phone-numbers (to find a number for campaign creation)")
    resp = client.get(f"{BASE_URL}/v1/phone-numbers", headers=headers)
    expect_not_rejected(resp, "GET /v1/phone-numbers")
    if resp.status_code >= 500:
        log_fail("  Could not list phone numbers (server error)")
        return None
    data = resp.json()
    items = data.get("data", data.get("items", data.get("results", []))) if isinstance(data, dict) else []
    if not items:
        log_fail("  No phone numbers available — campaign creation will be skipped")
        return None
    pid = extract_id(items[0])
    if pid:
        log_pass(f"  Using phone_number_id={pid}")
    return pid


def main() -> None:
    api_key = get_api_key()
    client = make_client()
    headers = auth_headers(api_key)
    results: list[bool] = []
    resource_id = None
    phone_id = _pick_phone_number_id(client, headers)
    ts = timestamp()

    if phone_id:
        # CREATE
        log_step("[CREATE] POST /v1/campaigns/")
        payload = {
            "name": f"crud-test-campaign-{ts}",
            "phone_number_id": phone_id,
            "customers": [{"name": "Test Contact", "phone": "+15551234567"}],
        }
        resp = client.post(f"{BASE_URL}/v1/campaigns/", json=payload, headers=headers)
        ok = expect_not_rejected(resp, "POST /v1/campaigns/")
        results.append(ok)
        if ok and resp.status_code < 500:
            rid = extract_id(resp.json())
            if rid:
                resource_id = rid
                track_cleanup(f"/v1/campaigns/{rid}")
                log_pass(f"  Created campaign UUID: {rid}")

        # LIST
        log_step("[READ] GET /v1/campaigns/")
        resp = client.get(f"{BASE_URL}/v1/campaigns/", headers=headers)
        ok = expect_not_rejected(resp, "GET /v1/campaigns/")
        results.append(ok)

        if resource_id:
            # GET BY ID
            log_step("[READ] GET /v1/campaigns/{uuid}")
            resp = client.get(f"{BASE_URL}/v1/campaigns/{resource_id}", headers=headers)
            ok = expect_not_rejected(resp, f"GET /v1/campaigns/{resource_id}")
            results.append(ok)

            # UPDATE
            log_step("[UPDATE] PATCH /v1/campaigns/{uuid}")
            payload = {"name": f"crud-test-campaign-{ts}-updated"}
            resp = client.patch(f"{BASE_URL}/v1/campaigns/{resource_id}", json=payload, headers=headers)
            ok = expect_not_rejected(resp, f"PATCH /v1/campaigns/{resource_id}")
            results.append(ok)

            # START
            log_step("[LIFECYCLE] POST /v1/campaigns/{uuid}/start")
            resp = client.post(f"{BASE_URL}/v1/campaigns/{resource_id}/start", headers=headers)
            ok = expect_not_rejected(resp, f"POST /v1/campaigns/{resource_id}/start")
            results.append(ok)

            # PAUSE
            log_step("[LIFECYCLE] POST /v1/campaigns/{uuid}/pause")
            resp = client.post(f"{BASE_URL}/v1/campaigns/{resource_id}/pause", headers=headers)
            ok = expect_not_rejected(resp, f"POST /v1/campaigns/{resource_id}/pause")
            results.append(ok)

            # RESUME
            log_step("[LIFECYCLE] POST /v1/campaigns/{uuid}/resume")
            resp = client.post(f"{BASE_URL}/v1/campaigns/{resource_id}/resume", headers=headers)
            ok = expect_not_rejected(resp, f"POST /v1/campaigns/{resource_id}/resume")
            results.append(ok)

            # CANCEL
            log_step("[LIFECYCLE] POST /v1/campaigns/{uuid}/cancel")
            resp = client.post(f"{BASE_URL}/v1/campaigns/{resource_id}/cancel", headers=headers)
            ok = expect_not_rejected(resp, f"POST /v1/campaigns/{resource_id}/cancel")
            results.append(ok)

        # CSV TEMPLATE
        log_step("[CSV] GET /v1/campaigns/contacts/template")
        resp = client.get(f"{BASE_URL}/v1/campaigns/contacts/template", headers=headers)
        ok = expect_not_rejected(resp, "GET /v1/campaigns/contacts/template")
        results.append(ok)
        if ok and resp.status_code < 500:
            log_pass(f"  Template CSV received ({len(resp.text)} chars)")

    else:
        log_step("[SKIP] No phone number available — testing read-only endpoints")
        resp = client.get(f"{BASE_URL}/v1/campaigns/", headers=headers)
        ok = expect_not_rejected(resp, "GET /v1/campaigns/")
        results.append(ok)
        resp = client.get(f"{BASE_URL}/v1/campaigns/contacts/template", headers=headers)
        ok = expect_not_rejected(resp, "GET /v1/campaigns/contacts/template")
        results.append(ok)

    run_cleanup(client, api_key)

    total = len(results)
    passed = sum(results)
    failed = total - passed
    print(f"\n{'=' * 50}")
    if failed == 0:
        print(f"{GREEN}All {total}/{total} campaign CRUD tests passed.{RESET}")
    else:
        print(f"{YELLOW}{passed}/{total} passed, {failed} failed.{RESET}")
    exit(1 if failed else 0)


if __name__ == "__main__":
    main()
