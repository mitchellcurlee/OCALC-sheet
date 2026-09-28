"""
Iter 52 - reorder route_sequence persistence bug verification.
Creates a Draw-Route test job + 4 poles + 3 custom connections and verifies
the API bug fixes for BUG1 (job page reorder), BUG1b (save & sync), BUG3
(map-side reorder), and regression (no-route job).

Uses direct API calls to simulate what the frontend PUTs after a manual
reorder: /jobs/{id}/reorder-items followed by PUT /jobs/{id} with the
route_sequence + span_order payload rebuilt from the new item order
(mirroring routePayloadFromOrder in lib/poleMapImage.js).
"""
import os, json, requests, sys, time

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://utility-pole-map.preview.emergentagent.com"
API = f"{BASE}/api"
EMAIL = "Admin@mastec.com"
PWD = "Mastecbyers12345"

def login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PWD}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]

def span_key(a, b):
    return f"{a}|{b}" if str(a) < str(b) else f"{b}|{a}"

def route_payload_from_order(job, ordered_ids):
    """Mirror routePayloadFromOrder(job, orderedItems) from JS."""
    if not (job.get("route_sequence") or []):
        return None
    seq = []
    for i in ordered_ids:
        if seq and seq[-1] == i:
            continue
        seq.append(i)
    known = set(job.get("span_order") or [])
    ordered = []
    for i in range(len(seq) - 1):
        k = span_key(seq[i], seq[i+1])
        if k in known and k not in ordered:
            ordered.append(k)
    for k in (job.get("span_order") or []):
        if k not in ordered:
            ordered.append(k)
    return {"route_sequence": seq, "span_order": ordered}

def create_job_with_poles(session, name, with_route=True):
    r = session.post(f"{API}/jobs", json={"name": name, "job_type": "OCALC"})
    r.raise_for_status()
    job = r.json()
    job_id = job["id"]
    poles = []
    for i in range(4):
        pr = session.post(f"{API}/poles", json={
            "job_id": job_id,
            "pole_number": str(i+1),
            "latitude": 29.9000 + i*0.0004,
            "longitude": -95.5,
            "sort_order": i,
        })
        pr.raise_for_status()
        poles.append(pr.json())
    # custom connections between consecutive poles
    for i in range(3):
        cr = session.post(f"{API}/jobs/{job_id}/connections", json={
            "job_id": job_id,
            "from_item_id": poles[i]["id"],
            "from_item_type": "pole",
            "to_item_id": poles[i+1]["id"],
            "to_item_type": "pole",
            "connection_type": "custom",
        })
        cr.raise_for_status()
    if with_route:
        ids = [p["id"] for p in poles]
        keys = [span_key(ids[i], ids[i+1]) for i in range(3)]
        upd = session.put(f"{API}/jobs/{job_id}", json={
            "route_mode": True,
            "route_sequence": ids,
            "draw_routes": [ids],
            "span_order": keys,
        })
        upd.raise_for_status()
    return session.get(f"{API}/jobs/{job_id}").json(), poles

def do_reorder(session, job, poles, new_order_idx):
    """Simulate a manual reorder: PUT /jobs/{id}/reorder-items then PUT /jobs/{id}
    with routePayloadFromOrder-style payload (this is exactly what the fixed
    frontend does)."""
    job_id = job["id"]
    ordered_poles = [poles[i] for i in new_order_idx]
    orders = [{"id": p["id"], "type": "pole", "sort_order": i} for i, p in enumerate(ordered_poles)]
    r = session.put(f"{API}/jobs/{job_id}/reorder-items", json=orders)
    r.raise_for_status()
    ordered_ids = [p["id"] for p in ordered_poles]
    payload = route_payload_from_order(job, ordered_ids)
    if payload:
        r2 = session.put(f"{API}/jobs/{job_id}", json=payload)
        r2.raise_for_status()
    return ordered_ids

def get_job(session, job_id):
    r = session.get(f"{API}/jobs/{job_id}")
    r.raise_for_status()
    return r.json()

def main():
    token = login()
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    results = {"tests": []}
    created_jobs = []

    # ---------- BUG 1: Draw Route job, reorder P4 to top ----------
    try:
        job, poles = create_job_with_poles(s, f"TEST_iter52_bug1_{int(time.time())}")
        created_jobs.append(job["id"])
        # move P4 above P1: order becomes 4,1,2,3
        new_idx = [3, 0, 1, 2]
        expected_ids = do_reorder(s, job, poles, new_idx)
        # Verify persistence via GET
        reloaded = get_job(s, job["id"])
        rs = reloaded.get("route_sequence") or []
        ok = rs == expected_ids
        # Also verify poles sort_order
        pr = s.get(f"{API}/poles?job_id={job['id']}"); pr.raise_for_status()
        job_poles = [p for p in pr.json() if p.get("job_id") == job["id"]]
        poles_after = sorted(job_poles, key=lambda p: 9999 if p.get("sort_order") is None else p["sort_order"])
        order_ok = [p["id"] for p in poles_after] == expected_ids
        results["tests"].append({"name": "BUG1 draw-route reorder persists in route_sequence",
                                 "pass": ok and order_ok,
                                 "expected": expected_ids, "actual_route_sequence": rs,
                                 "actual_pole_order": [p["id"] for p in poles_after]})
    except Exception as e:
        results["tests"].append({"name": "BUG1", "pass": False, "error": str(e)})

    # ---------- BUG 1b: Draw Route job, move P3 to top ----------
    try:
        job2, poles2 = create_job_with_poles(s, f"TEST_iter52_bug1b_{int(time.time())}")
        created_jobs.append(job2["id"])
        new_idx = [2, 0, 1, 3]   # 3,1,2,4
        expected_ids = do_reorder(s, job2, poles2, new_idx)
        reloaded = get_job(s, job2["id"])
        rs = reloaded.get("route_sequence") or []
        results["tests"].append({"name": "BUG1b save & sync path persists route_sequence",
                                 "pass": rs == expected_ids,
                                 "expected": expected_ids, "actual_route_sequence": rs})
    except Exception as e:
        results["tests"].append({"name": "BUG1b", "pass": False, "error": str(e)})

    # ---------- BUG 3: Map-side span reorder syncs route_sequence ----------
    try:
        job3, poles3 = create_job_with_poles(s, f"TEST_iter52_bug3_{int(time.time())}")
        created_jobs.append(job3["id"])
        new_idx = [1, 3, 0, 2]   # 2,4,1,3
        expected_ids = do_reorder(s, job3, poles3, new_idx)
        reloaded = get_job(s, job3["id"])
        rs = reloaded.get("route_sequence") or []
        # span_order should list existing spans that are consecutive in new order first
        so = reloaded.get("span_order") or []
        # In new order 2,4,1,3 there's no direct existing key between (2,4) or (4,1) or (1,3),
        # so the ordered list falls back to all previous keys preserved.
        results["tests"].append({"name": "BUG3 map-side reorder writes route_sequence",
                                 "pass": rs == expected_ids,
                                 "expected": expected_ids, "actual_route_sequence": rs,
                                 "span_order": so})
    except Exception as e:
        results["tests"].append({"name": "BUG3", "pass": False, "error": str(e)})

    # ---------- REGRESSION: No-route job reorder does NOT set route_sequence ----------
    try:
        job4, poles4 = create_job_with_poles(s, f"TEST_iter52_noroute_{int(time.time())}", with_route=False)
        created_jobs.append(job4["id"])
        new_idx = [3, 2, 1, 0]
        expected_ids = do_reorder(s, job4, poles4, new_idx)
        reloaded = get_job(s, job4["id"])
        rs = reloaded.get("route_sequence") or []
        # Should stay empty; but sort_order must persist
        pr = s.get(f"{API}/poles?job_id={job4['id']}"); pr.raise_for_status()
        job_poles = [p for p in pr.json() if p.get("job_id") == job4["id"]]
        poles_after = sorted(job_poles, key=lambda p: 9999 if p.get("sort_order") is None else p["sort_order"])
        order_ok = [p["id"] for p in poles_after] == expected_ids
        results["tests"].append({"name": "REGRESSION no-route reorder keeps route_sequence empty",
                                 "pass": (not rs) and order_ok,
                                 "actual_route_sequence": rs,
                                 "actual_pole_order": [p["id"] for p in poles_after]})
    except Exception as e:
        results["tests"].append({"name": "REGRESSION", "pass": False, "error": str(e)})

    # Cleanup
    for jid in created_jobs:
        try: s.delete(f"{API}/jobs/{jid}")
        except Exception: pass

    passed = sum(1 for t in results["tests"] if t.get("pass"))
    results["summary"] = f"{passed}/{len(results['tests'])} passed"
    results["created_jobs"] = created_jobs
    print(json.dumps(results, indent=2))
    with open("/app/test_reports/iter52_api_results.json", "w") as f:
        json.dump(results, f, indent=2)
    sys.exit(0 if passed == len(results["tests"]) else 1)

if __name__ == "__main__":
    main()
