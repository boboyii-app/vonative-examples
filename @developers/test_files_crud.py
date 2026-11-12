#!/usr/bin/env python3
"""CRUD test for /v1/files endpoints using a production API key."""

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

    # CREATE (multipart upload)
    log_step("[CREATE] POST /v1/files/upload")
    file_content = f"crud test file created at {ts}".encode()
    files = {"file": (f"crud-test-{ts}.txt", file_content, "text/plain")}
    resp = client.post(
        f"{BASE_URL}/v1/files/upload",
        files=files,
        headers={k: v for k, v in headers.items()},  # auth, no content-type
    )
    ok = expect_not_rejected(resp, "POST /v1/files/upload")
    results.append(ok)
    if ok and resp.status_code < 500:
        rid = extract_id(resp.json())
        if rid:
            resource_id = rid
            track_cleanup(f"/v1/files/{rid}")
            log_pass(f"  Created file UUID: {rid}")

    # LIST
    log_step("[READ] GET /v1/files")
    resp = client.get(f"{BASE_URL}/v1/files", headers=headers)
    ok = expect_not_rejected(resp, "GET /v1/files")
    results.append(ok)

    # GET BY ID
    if resource_id:
        log_step("[READ] GET /v1/files/{uuid}")
        resp = client.get(f"{BASE_URL}/v1/files/{resource_id}", headers=headers)
        ok = expect_not_rejected(resp, f"GET /v1/files/{resource_id}")
        results.append(ok)

    run_cleanup(client, api_key)

    total = len(results)
    passed = sum(results)
    failed = total - passed
    print(f"\n{'=' * 50}")
    if failed == 0:
        print(f"{GREEN}All {total}/{total} file CRUD tests passed.{RESET}")
    else:
        print(f"{RED}{passed}/{total} passed, {failed} failed.{RESET}")
    exit(1 if failed else 0)


if __name__ == "__main__":
    main()
