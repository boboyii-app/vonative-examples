#!/usr/bin/env python3
"""Read + request test for /v1/phone-numbers endpoints using a production API key."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from crud_utils import (
    BASE_URL, RESET, RED, GREEN, auth_headers, expect_not_rejected,
    get_api_key, log_fail, log_pass, log_step, make_client,
)


def main() -> None:
    api_key = get_api_key()
    client = make_client()
    headers = auth_headers(api_key)
    results: list[bool] = []

    # LIST
    log_step("[READ] GET /v1/phone-numbers")
    resp = client.get(f"{BASE_URL}/v1/phone-numbers", headers=headers)
    ok = expect_not_rejected(resp, "GET /v1/phone-numbers")
    results.append(ok)

    # AVAILABLE
    log_step("[READ] GET /v1/phone-numbers/available")
    resp = client.get(f"{BASE_URL}/v1/phone-numbers/available", headers=headers)
    ok = expect_not_rejected(resp, "GET /v1/phone-numbers/available")
    results.append(ok)

    # PLAN LIMITS
    log_step("[READ] GET /v1/phone-numbers/plan-limits")
    resp = client.get(f"{BASE_URL}/v1/phone-numbers/plan-limits", headers=headers)
    ok = expect_not_rejected(resp, "GET /v1/phone-numbers/plan-limits")
    results.append(ok)

    total = len(results)
    passed = sum(results)
    failed = total - passed
    print(f"\n{'=' * 50}")
    if failed == 0:
        print(f"{GREEN}All {total}/{total} phone number tests passed.{RESET}")
    else:
        print(f"{RED}{passed}/{total} passed, {failed} failed.{RESET}")
    exit(1 if failed else 0)


if __name__ == "__main__":
    main()
