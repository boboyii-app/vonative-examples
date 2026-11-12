#!/usr/bin/env python3
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from crud_utils import BASE_URL, auth_headers, get_api_key, make_client, extract_id, timestamp


def _get_first_assistant_uuid(client, headers):
    resp = client.get(f"{BASE_URL}/v1/assistants/", params={"limit": 1}, headers=headers)
    if resp.status_code >= 400:
        return None
    items = resp.json().get("data", resp.json().get("results", []))
    if not items:
        return None
    inner = items[0].get("data", items[0])
    return inner.get("uuid") or inner.get("id")


def _get_first_phone_uuid(client, headers):
    resp = client.get(f"{BASE_URL}/v1/phone-numbers", params={"limit": 1}, headers=headers)
    if resp.status_code >= 400:
        return None
    items = resp.json().get("data", resp.json().get("results", []))
    if not items:
        return None
    inner = items[0].get("data", items[0])
    return inner.get("uuid") or inner.get("id")


def main():
    api_key = get_api_key()
    client = make_client()
    headers = auth_headers(api_key)
    ts = timestamp()

    # ------------------------------------------------------------------
    # LIST calls (read-only — calls are created by the system)
    # ------------------------------------------------------------------
    print("=" * 70)
    print("LIST CALLS  GET /v1/calls?limit=5&offset=0")
    print("=" * 70)
    print("Calls are created by the platform when a call is placed or received.")
    print("You can filter by status, assistant, date range, etc.\n")

    resp = client.get(f"{BASE_URL}/v1/calls", params={"limit": 5}, headers=headers)
    print(f"Status: {resp.status_code}")
    data = resp.json()
    items = data.get("data", data.get("results", data.get("items", [])))
    print(f"Returned {len(items)} call(s)")
    for c in items:
        inner = c.get("data", c)
        from_n = inner.get("caller_number", inner.get("from_number", "?"))
        to_n = inner.get("called_number", inner.get("to_number", "?"))
        print(f"  - {from_n} -> {to_n}  [{inner.get('status', '?')}]  cost={inner.get('cost', '?')}")

    if not items:
        print("No calls yet. Initiate one via POST /v1/calls/initiate")
        print()

        # ------------------------------------------------------------------
        # INITIATE a call (requires assistant + phone)
        # ------------------------------------------------------------------
        print("=" * 70)
        print("INITIATE CALL  POST /v1/calls/initiate")
        print("=" * 70)
        print()
        print("phone_number_id ... Your org's phone number UUID")
        print("customer_phone .... Destination number in E.164 format (required)")
        print("assistant_id ...... Assistant UUID (required)")
        print("metadata .......... Optional key-value pairs for tracking")
        print("scheduled_at ...... ISO datetime for future scheduling")
        print()

        asst_id = _get_first_assistant_uuid(client, headers)
        phone_id = _get_first_phone_uuid(client, headers)

        if asst_id and phone_id:
            call_payload = {
                "phone_number_id": phone_id,
                "customer_phone": "+14155551234",
                "assistant_id": asst_id,
                "metadata": {"source": "api-key-example", "campaign": "test"},
            }
            resp = client.post(f"{BASE_URL}/v1/calls/initiate", json=call_payload, headers=headers)
            print(f"Status: {resp.status_code}")
            print(json.dumps(resp.json(), indent=2))
        else:
            print("Cannot initiate call: need at least one assistant and one phone number.")
            print(f"  assistant found: {bool(asst_id)}")
            print(f"  phone found:     {bool(phone_id)}")
        return

    # ------------------------------------------------------------------
    # GET call by ID
    # ------------------------------------------------------------------
    call_id = extract_id(items[0])
    if not call_id:
        print("Could not extract call ID")
        return

    print()
    print("=" * 70)
    print(f"GET CALL  GET /v1/calls/{call_id}")
    print("=" * 70)
    resp = client.get(f"{BASE_URL}/v1/calls/{call_id}", headers=headers)
    print(f"Status: {resp.status_code}")
    detail = resp.json().get("data", resp.json())
    print(f"Status .............. {detail.get('status')}")
    print(f"Direction .......... {detail.get('call_direction', detail.get('direction'))}")
    print(f"Duration ........... {detail.get('duration_seconds', '?')}s")
    print(f"Cost ............... {detail.get('cost', detail.get('total_cost', '?'))}")
    print(f"Assistant .......... {detail.get('assistant_id', detail.get('assistant_uuid', '?'))}")
    print(f"Summary ............ {str(detail.get('summary', 'N/A'))[:200]}")

    # ------------------------------------------------------------------
    # UPDATE call (add/update summary)
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print(f"UPDATE CALL  PUT /v1/calls/{call_id}")
    print("=" * 70)
    print("You can update the summary, notes, or metadata on an existing call.\n")

    resp = client.put(
        f"{BASE_URL}/v1/calls/{call_id}",
        json={"summary": f"Reviewed on {ts}. Customer expressed interest in enterprise plan."},
        headers=headers,
    )
    print(f"Status: {resp.status_code}")
    print(f"Message: {resp.json().get('message', resp.json())}")

    # ------------------------------------------------------------------
    # STATS + ACTIVE COUNT
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print("CALL STATS")
    print("=" * 70)

    resp = client.get(f"{BASE_URL}/v1/calls/stats/organization", headers=headers)
    print(f"GET /v1/calls/stats/organization -> {resp.status_code}")
    print(json.dumps(resp.json().get("data", resp.json()), indent=2))

    resp = client.get(f"{BASE_URL}/v1/calls/active/count", headers=headers)
    print(f"\nGET /v1/calls/active/count -> {resp.status_code}")
    print(f"Active calls: {resp.json().get('data', resp.json())}")

    # ------------------------------------------------------------------
    # CALL LOGS
    # ------------------------------------------------------------------
    print()
    print("=" * 70)
    print("CALL LOGS  GET /v1/call-logs?limit=3")
    print("=" * 70)
    print("Detailed per-event logs for each call leg.\n")

    resp = client.get(f"{BASE_URL}/v1/call-logs", params={"limit": 3}, headers=headers)
    print(f"Status: {resp.status_code}")
    logs = resp.json().get("data", resp.json().get("results", resp.json().get("items", [])))
    print(f"Returned {len(logs)} log(s)")
    for log in logs[:3]:
        inner = log.get("data", log)
        print(f"  - {inner.get('event_type', '?')}  {inner.get('created_at', '')[:19]}")


if __name__ == "__main__":
    main()
