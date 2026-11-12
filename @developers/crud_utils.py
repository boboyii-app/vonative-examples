#!/usr/bin/env python3
"""Shared utilities for production CRUD test scripts."""

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Any, Optional

sys.path.insert(0, str(Path(__file__).parent))

import httpx

BASE_URL = "https://api.volangai.com"

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
RESET = "\033[0m"

_cleanup_paths: list[str] = []
_created_ids: list[str] = []


def log_step(msg: str) -> None:
    print(f"\n{CYAN}{msg}{RESET}")


def log_pass(msg: str) -> None:
    print(f"  {GREEN}PASS{RESET}  {msg}")


def log_fail(msg: str) -> None:
    print(f"  {RED}FAIL{RESET}  {msg}")


def get_api_key() -> str:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--api-key")
    args, _ = parser.parse_known_args()
    key = args.api_key or os.environ.get("API_KEY")
    if not key:
        print(f"{RED}Error: No API key provided.{RESET}")
        sys.exit(1)
    return key


def make_client() -> httpx.Client:
    return httpx.Client(timeout=60.0, follow_redirects=False)


def auth_headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}"}


def expect_not_rejected(resp: httpx.Response, label: str) -> bool:
    if resp.status_code == 403:
        log_fail(f"{label} -> 403 (key was rejected on allowed endpoint!)")
        return False
    if resp.status_code == 401:
        log_fail(f"{label} -> 401 (key is invalid/expired)")
        return False
    log_pass(f"{label} -> {resp.status_code}")
    return True


def track_cleanup(path: str) -> None:
    _cleanup_paths.append(path)


def run_cleanup(client: httpx.Client, api_key: str) -> None:
    if not _cleanup_paths:
        return
    headers = auth_headers(api_key)
    print(f"\n{YELLOW}Cleanup: removing {len(_cleanup_paths)} resource(s){RESET}")
    for path in reversed(_cleanup_paths):
        url = f"{BASE_URL}{path}"
        try:
            resp = client.delete(url, headers=headers)
            if resp.status_code < 500:
                log_pass(f"DELETE {path} -> {resp.status_code}")
            else:
                log_fail(f"DELETE {path} -> {resp.status_code}")
        except Exception as e:
            log_fail(f"DELETE {path} -> error: {e}")


def extract_id(data: dict, preferred: str = "uuid") -> Optional[str]:
    inner = data.get("data")
    if isinstance(inner, dict):
        for key in (preferred, "uuid", "id", "ref"):
            val = inner.get(key)
            if val is not None:
                return str(val)
    for key in ("uuid", "id", "ref"):
        val = data.get(key)
        if val is not None:
            return str(val)
    return None


def timestamp() -> str:
    return str(int(time.time()))
