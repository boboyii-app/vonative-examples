#!/usr/bin/env python3
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from crud_utils import BASE_URL, auth_headers, get_api_key, make_client, extract_id


def main():
    api_key = get_api_key()
    client = make_client()
    headers = auth_headers(api_key)

    # ------------------------------------------------------------------
    # LIST sessions with filters
    # ------------------------------------------------------------------
    print("=" * 70)
    print("LIST SESSIONS  GET /v1/sessions?limit=5&offset=0")
    print("=" * 70)
    print("Sessions represent individual call conversations. Each session")
    print("tracks one caller interaction from start to end.\n")
    print("Query params: limit, offset, status, assistant_id, campaign_id,")
    print("  start_date, end_date, min_cost, max_cost, call_direction")
    print()

    resp = client.get(
        f"{BASE_URL}/v1/sessions",
        params={"limit": 5, "offset": 0},
        headers=headers,
    )
    print(f"Status: {resp.status_code}")
    data = resp.json()
    items = data.get("data", data.get("items", data.get("results", [])))
    print(f"Returned {len(items)} session(s)\n")

    for s in items:
        inner = s.get("data", s)
        print(f"  Status:      {inner.get('status', '?')}")
        print(f"  Duration:    {inner.get('duration_seconds', '?')}s")
        print(f"  Direction:   {inner.get('call_direction', '?')}")
        print(f"  From:        {inner.get('caller_number', inner.get('from_number', '?'))}")
        print(f"  To:          {inner.get('called_number', inner.get('to_number', '?'))}")
        print(f"  Assistant:   {inner.get('assistant_id', inner.get('assistant_uuid', '?'))}")
        print(f"  Cost:        {inner.get('cost', inner.get('total_cost', '?'))}")
        print(f"  UUID:        {inner.get('uuid', inner.get('id', '?'))}")
        print()

    if not items:
        print("No sessions found. Sessions are created automatically when calls happen.\n")
        return

    # ------------------------------------------------------------------
    # GET session by ID
    # ------------------------------------------------------------------
    session_id = extract_id(items[0])
    if not session_id:
        print("Could not extract session ID")
        return

    print("=" * 70)
    print(f"GET SESSION  GET /v1/sessions/{session_id}")
    print("=" * 70)

    resp = client.get(f"{BASE_URL}/v1/sessions/{session_id}", headers=headers)
    print(f"Status: {resp.status_code}")
    detail = resp.json().get("data", resp.json())
    print(json.dumps(detail, indent=2)[:800])
    print()

    # ------------------------------------------------------------------
    # LIST sessions filtered by assistant
    # ------------------------------------------------------------------
    assistant_id = detail.get("assistant_id") or detail.get("assistant_uuid")
    if assistant_id:
        print("=" * 70)
        print(f"LIST SESSIONS BY ASSISTANT  GET /v1/sessions?assistant_id={assistant_id}&limit=3")
        print("=" * 70)

        resp = client.get(
            f"{BASE_URL}/v1/sessions",
            params={"assistant_id": assistant_id, "limit": 3},
            headers=headers,
        )
        print(f"Status: {resp.status_code}")
        filtered = resp.json().get("data", resp.json().get("items", resp.json().get("results", [])))
        print(f"Returned {len(filtered)} session(s) for assistant {assistant_id}")
        print()

    # ------------------------------------------------------------------
    # ANALYTICS
    # ------------------------------------------------------------------
    print("=" * 70)
    print("SESSION ANALYTICS  POST /v1/sessions/analytics")
    print("=" * 70)
    print("Get aggregate metrics: call count, avg duration, total cost, etc.\n")

    resp = client.post(
        f"{BASE_URL}/v1/sessions/analytics",
        json={"period_days": 30, "include_costs": True, "include_quality": True},
        headers=headers,
    )
    print(f"Status: {resp.status_code}")
    print(json.dumps(resp.json().get("data", resp.json()), indent=2)[:500])


if __name__ == "__main__":
    main()
