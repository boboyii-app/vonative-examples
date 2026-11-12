#!/usr/bin/env python3
"""
Production API Key Test Script -- api.volangai.com

Tests a production API key (key_...) against the live backend:

  1. Public endpoints are reachable (no auth)
  2. API key is accepted on ALLOWED_PREFIXES endpoints
  3. API key is rejected (403) on restricted endpoints
  4. Invalid key returns 401
  5. No auth header returns 401/403

Usage:
    python @developers/test_prod_api_key.py --api-key key_abc...
    API_KEY=key_abc... python @developers/test_prod_api_key.py
"""

import argparse
import os
import sys

import httpx

BASE_URL = "https://api.volangai.com"

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RESET = "\033[0m"

# Endpoints the auth code explicitly allows for API keys
# (mirrors ALLOWED_PREFIXES in auth/services.py)
ALLOWED_ENDPOINTS = [
    ("GET", "/v1/assistants/"),
    ("GET", "/v1/workflows"),
    ("GET", "/v1/calls"),
    ("GET", "/v1/phone-numbers"),
    ("GET", "/v1/files"),
    ("GET", "/v1/tools"),
    ("GET", "/v1/sessions"),
    ("GET", "/v1/webhooks"),
]

# Endpoints that should be blocked with 403 for API keys
RESTRICTED_ENDPOINTS = [
    ("GET", "/v1/auth/me"),
    ("GET", "/v1/admin/users"),
    ("GET", "/v1/billing/dashboard"),
    ("GET", "/v1/account/upgrade/status"),
    ("GET", "/v1/organizations"),
    ("GET", "/v1/payments/account"),
    ("GET", "/v1/analytics/organization"),
    ("GET", "/v1/integrations"),
    ("GET", "/v1/chats"),
    ("GET", "/v1/campaigns"),
    ("GET", "/v1/providers"),
    ("GET", "/v1/structured-outputs"),
    ("POST", "/v1/feedback"),
    ("GET", "/v1/call-tracking/events"),
    ("GET", "/v1/data-collections"),
    ("GET", "/v1/request-logs"),
]

# Public endpoints that require no auth
PUBLIC_ENDPOINTS = [
    ("GET", "/health"),
    ("GET", "/v1/plans"),
]


def log_pass(msg: str) -> None:
    print(f"  {GREEN}PASS{RESET}  {msg}")


def log_fail(msg: str) -> None:
    print(f"  {RED}FAIL{RESET}  {msg}")


def _run_test(
    client: httpx.Client,
    method: str,
    path: str,
    headers: dict | None,
    label: str,
    predicate,
) -> bool:
    url = f"{BASE_URL}{path}"
    try:
        resp = client.request(method, url, headers=headers)
        ok, detail = predicate(resp)
        if ok:
            log_pass(f"{label} -> {detail}")
        else:
            log_fail(f"{label} -> {detail}")
        return ok
    except httpx.RequestError as e:
        log_fail(f"{label} -> connection error: {e}")
        return False


def test_public(client: httpx.Client) -> list[bool]:
    print(f"\n{CYAN}[1] Public Endpoints (no auth required){RESET}")
    results = []

    def _public_ok(resp):
        if resp.status_code < 500:
            return True, f"{resp.status_code}"
        return False, f"{resp.status_code} (server error)"

    for method, path in PUBLIC_ENDPOINTS:
        results.append(
            _run_test(client, method, path, None, f"{method} {path}", _public_ok)
        )
    return results


def test_allowed_endpoints(client: httpx.Client, api_key: str) -> list[bool]:
    print(f"\n{CYAN}[2] API Key Allowed Endpoints (expect NOT 403){RESET}")
    results = []
    headers = {"Authorization": f"Bearer {api_key}"}

    def _allowed_ok(resp):
        if resp.status_code == 403:
            return False, f"{resp.status_code} (key was rejected!)"
        if resp.status_code == 401:
            return False, f"{resp.status_code} (key is invalid/expired)"
        return True, f"{resp.status_code} (key accepted)"

    for method, path in ALLOWED_ENDPOINTS:
        results.append(
            _run_test(client, method, path, headers, f"{method} {path}", _allowed_ok)
        )
    return results


def test_restricted_endpoints(client: httpx.Client, api_key: str) -> list[bool]:
    print(f"\n{CYAN}[3] API Key Restricted Endpoints (expect 403 -- key blocked){RESET}")
    results = []
    headers = {"Authorization": f"Bearer {api_key}"}

    def _restricted_ok(resp):
        if resp.status_code == 403:
            return True, f"{resp.status_code}"
        if resp.status_code == 401:
            return False, f"{resp.status_code} (key invalid, not just restricted)"
        return False, f"{resp.status_code} (expected 403)"

    for method, path in RESTRICTED_ENDPOINTS:
        results.append(
            _run_test(client, method, path, headers, f"{method} {path}", _restricted_ok)
        )
    return results


def test_invalid_key(client: httpx.Client) -> list[bool]:
    print(f"\n{CYAN}[4] Invalid API Key (expect 401){RESET}")
    headers = {"Authorization": "Bearer key_fake_invalid_abc123"}

    def _invalid_ok(resp):
        if resp.status_code == 401:
            return True, f"{resp.status_code}"
        return False, f"{resp.status_code} (expected 401)"

    return [
        _run_test(client, "GET", "/v1/assistants/", headers, "GET /v1/assistants/", _invalid_ok)
    ]


def test_no_auth(client: httpx.Client) -> list[bool]:
    print(f"\n{CYAN}[5] No Auth Header (expect 401 or 403){RESET}")

    def _noauth_ok(resp):
        if resp.status_code in (401, 403):
            return True, f"{resp.status_code}"
        return False, f"{resp.status_code} (expected 401/403)"

    return [
        _run_test(client, "GET", "/v1/assistants/", None, "GET /v1/assistants/", _noauth_ok)
    ]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Test a production API key against api.volangai.com"
    )
    parser.add_argument(
        "--api-key",
        help="API key to test (starts with key_ or sk_vlang_). Falls back to API_KEY env var.",
    )
    args = parser.parse_args()

    api_key = args.api_key or os.environ.get("API_KEY")
    if not api_key:
        print(f"{RED}Error: No API key provided.{RESET}")
        print("  Pass --api-key or set the API_KEY environment variable.")
        sys.exit(1)

    print(f"Target: {BASE_URL}")
    print(f"Key:    {api_key[:12]}... (prefix only)")

    client = httpx.Client(timeout=15.0, follow_redirects=False)

    results: list[bool] = []
    results.extend(test_public(client))
    results.extend(test_allowed_endpoints(client, api_key))
    results.extend(test_restricted_endpoints(client, api_key))
    results.extend(test_invalid_key(client))
    results.extend(test_no_auth(client))

    total = len(results)
    passed = sum(results)
    failed = total - passed

    print(f"\n{'=' * 50}")
    if failed == 0:
        print(f"{GREEN}All {total}/{total} tests passed.{RESET}")
        sys.exit(0)
    else:
        print(f"{RED}{passed}/{total} passed, {failed} failed.{RESET}")
        sys.exit(1)


if __name__ == "__main__":
    main()
