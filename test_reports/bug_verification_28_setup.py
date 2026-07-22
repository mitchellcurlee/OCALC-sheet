import json
import os
import time
from pathlib import Path

import httpx


BASE_URL = os.environ.get("TEST_BASE_URL", "https://utility-pole-map.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
OUT = Path("/app/test_reports/bug_verification_28_seed.json")


def main():
    stamp = int(time.time())
    recipient_email = f"qa-transfer-{stamp}@byers.com"
    password = "QaTransfer123!"
    job_name = f"QA ZIndex Transfer {stamp}"

    with httpx.Client(timeout=30.0) as client:
        login = client.post(
            f"{API}/auth/login",
            json={"email": "Admin@mastec.com", "password": "Mastecbyers12345"},
        )
        login.raise_for_status()
        admin_token = login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        reg = client.post(
            f"{API}/auth/register",
            json={"email": recipient_email, "password": password, "name": "QA Transfer Recipient"},
        )
        reg.raise_for_status()
        recipient = reg.json()["user"]

        create_job = client.post(
            f"{API}/jobs",
            headers=admin_headers,
            json={
                "name": job_name,
                "description": "Temporary QA job for Leaflet dialog z-index verification",
                "location": "Dallas, TX",
                "job_type": "OCALC",
            },
        )
        create_job.raise_for_status()
        job = create_job.json()
        job_id = job["id"]

        create_pole = client.post(
            f"{API}/poles",
            json={
                "job_id": job_id,
                "pole_number": "QA-1",
                "pole_size": "40",
                "pole_class": "4",
                "condition": "Good",
                "latitude": 32.7767,
                "longitude": -96.7970,
                "sort_order": 0,
            },
        )
        create_pole.raise_for_status()
        pole = create_pole.json()

    seed = {
        "base_url": BASE_URL,
        "api_url": API,
        "admin_email": "Admin@mastec.com",
        "admin_password": "Mastecbyers12345",
        "recipient_email": recipient_email,
        "recipient_password": password,
        "recipient_id": recipient["id"],
        "job_id": job_id,
        "job_name": job_name,
        "job_created_at": job["created_at"],
        "month_key": job["created_at"][:7],
        "pole_id": pole["id"],
    }
    OUT.write_text(json.dumps(seed, indent=2))
    print(json.dumps(seed, indent=2))


if __name__ == "__main__":
    main()