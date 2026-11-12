#!/usr/bin/env python3
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from crud_utils import BASE_URL, auth_headers, get_api_key, make_client


def main():
    api_key = get_api_key()
    client = make_client()
    headers = auth_headers(api_key)

    # ------------------------------------------------------------------
    # LIST phone numbers
    # ------------------------------------------------------------------
    print("=" * 70)
    print("LIST PHONE NUMBERS  GET /v1/phone-numbers?limit=5")
    print("=" * 70)
    print("Returns all phone numbers belonging to your organization.\n")

    resp = client.get(f"{BASE_URL}/v1/phone-numbers", params={"limit": 5}, headers=headers)
    print(f"Status: {resp.status_code}")
    data = resp.json()
    items = data.get("data", data.get("results", data.get("items", [])))
    print(f"Returned {len(items)} number(s)\n")
    for pn in items:
        inner = pn.get("data", pn)
        print(f"  Number:     {inner.get('phone_number', inner.get('number', '?'))}")
        print(f"  Provider:   {inner.get('provider', '?')}")
        print(f"  Type:       {inner.get('number_type', '?')}")
        print(f"  Status:     {inner.get('status', '?')}")
        print(f"  UUID:       {inner.get('uuid', inner.get('id', '?'))}")
        print(f"  Assigned:   {inner.get('assistant_id', inner.get('squad_id', 'unassigned'))}")
        print()

    # ------------------------------------------------------------------
    # SEARCH available numbers for purchase
    # ------------------------------------------------------------------
    print("=" * 70)
    print("SEARCH AVAILABLE NUMBERS  GET /v1/phone-numbers/available")
    print("=" * 70)
    print("Search the provider pool for numbers you can buy.")
    print("Query params: country (ISO Alpha-2), area_code, number_type, limit\n")

    resp = client.get(
        f"{BASE_URL}/v1/phone-numbers/available",
        params={"country": "US", "number_type": "local", "limit": 3},
        headers=headers,
    )
    print(f"Status: {resp.status_code}")
    avail = resp.json().get("data", resp.json())
    print(json.dumps(avail, indent=2))
    print()

    # ------------------------------------------------------------------
    # PLAN LIMITS
    # ------------------------------------------------------------------
    print("=" * 70)
    print("PLAN LIMITS  GET /v1/phone-numbers/plan-limits")
    print("=" * 70)
    print("Shows how many phone numbers your current plan allows.\n")

    resp = client.get(f"{BASE_URL}/v1/phone-numbers/plan-limits", headers=headers)
    print(f"Status: {resp.status_code}")
    print(json.dumps(resp.json().get("data", resp.json()), indent=2))
    print()

    # ------------------------------------------------------------------
    # REQUEST a new number  (POST /v1/phone-numbers/request)
    # ------------------------------------------------------------------
    print("=" * 70)
    print("REQUEST NEW NUMBER  POST /v1/phone-numbers/request")
    print("=" * 70)
    print("Request a specific number configuration from the provider.")
    print("  country_code ..... ISO Alpha-2 (e.g. US, GB, NG)")
    print("  area_code ........ Optional area code")
    print("  number_type ...... 'local' or 'toll-free'")
    print("  direction ........ 'inbound' or 'outbound'")
    print("  business_reason .. Description for provider compliance\n")

    request_payload = {
        "country_code": "US",
        "area_code": "415",
        "number_type": "local",
        "direction": "inbound",
        "business_reason": "Outbound sales calls for customer outreach",
    }
    resp = client.post(f"{BASE_URL}/v1/phone-numbers/request", json=request_payload, headers=headers)
    print(f"Status: {resp.status_code}")
    print(json.dumps(resp.json(), indent=2))


if __name__ == "__main__":
    main()
