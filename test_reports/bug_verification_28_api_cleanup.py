import json
from pathlib import Path

import httpx


seed = json.loads(Path('/app/test_reports/bug_verification_28_seed.json').read_text())
API = seed['api_url']


def main():
    out = {}
    with httpx.Client(timeout=30.0) as client:
        admin_login = client.post(f"{API}/auth/login", json={"email": seed['admin_email'], "password": seed['admin_password']})
        admin_login.raise_for_status()
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        rec_login = client.post(f"{API}/auth/login", json={"email": seed['recipient_email'], "password": seed['recipient_password']})
        rec_login.raise_for_status()
        rec_headers = {"Authorization": f"Bearer {rec_login.json()['access_token']}"}

        rec_jobs = client.get(f"{API}/jobs", headers=rec_headers)
        rec_jobs.raise_for_status()
        target = next((j for j in rec_jobs.json() if j.get('id') == seed['job_id']), None)
        out['recipient_job_in_list'] = target
        out['recipient_job_has_transferred_from_in_list'] = bool(target and target.get('transferred_from'))

        detail = client.get(f"{API}/jobs/{seed['job_id']}", headers=rec_headers)
        out['recipient_detail_status'] = detail.status_code
        out['recipient_job_detail'] = detail.json() if detail.status_code == 200 else detail.text
        out['recipient_detail_has_transferred_from'] = bool(detail.status_code == 200 and detail.json().get('transferred_from'))

        delete_resp = client.delete(f"{API}/jobs/{seed['job_id']}", headers=admin_headers)
        out['cleanup_delete_job_status'] = delete_resp.status_code
        out['cleanup_delete_job_body'] = delete_resp.text

    Path('/app/test_reports/bug_verification_28_api_results.json').write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))


if __name__ == '__main__':
    main()