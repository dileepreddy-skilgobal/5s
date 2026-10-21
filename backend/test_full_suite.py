"""
5S SaaS platform - end-to-end operational smoke test.

Runs the main shop-floor workflows against a running backend using real, role-separated
sign-ins (the API enforces segregation of duties, e.g. a CAPA cannot be verified by its assignee).
Every record it creates is its own; existing records are never modified.

Usage:
    python test_full_suite.py
Environment overrides:
    FIVE_S_API_URL   (default http://localhost:3001/api/v1)
    FIVE_S_PASSWORD  (default: the seed password)
"""
import json
import os
import sys

import requests

BASE_URL = os.environ.get("FIVE_S_API_URL", "http://localhost:3001/api/v1")
PASSWORD = os.environ.get("FIVE_S_PASSWORD", "Admin@123456")

COORDINATOR = "coordinator.5s@skilglobal.com"
AREA_OWNER = "owner.cnc01@skilglobal.com"
AUDITOR = "auditor.lead@skilglobal.com"


def unwrap(res):
    d = res.json()
    if isinstance(d, dict) and "data" in d:
        return d["data"]
    return d


def sign_in(email):
    res = requests.post(f"{BASE_URL}/auth/login", json={"email": email, "password": PASSWORD})
    assert res.status_code == 200, f"Sign-in failed for {email}: {res.status_code} {res.text}"
    session = unwrap(res)
    return session, {"Content-Type": "application/json", "Authorization": f"Bearer {session['accessToken']}"}


def run_tests():
    print("==================================================")
    print("  5S SAAS PLATFORM - E2E OPERATIONAL VERIFIER     ")
    print("==================================================")

    # 0. Authenticate as separate roles
    print("\n--- 0. Authenticating Role-Separated Sessions ---")
    coord_session, coord = sign_in(COORDINATOR)
    owner_session, owner = sign_in(AREA_OWNER)
    _, auditor = sign_in(AUDITOR)
    print(f"[OK] Tenant: '{coord_session['tenant']['name']}' — signed in as coordinator, area owner and auditor")

    res_unauth = requests.get(f"{BASE_URL}/locations")
    assert res_unauth.status_code == 401, "Unauthenticated request was not rejected"
    print("[OK] Unauthenticated requests are rejected (401)")

    res_locs = requests.get(f"{BASE_URL}/locations", headers=coord)
    assert res_locs.status_code == 200
    locs = unwrap(res_locs)
    assert len(locs) > 0, "No locations found in tenant"
    owned = [l for l in locs if l.get("ownerId") == owner_session["user"]["id"]]
    loc = owned[0] if owned else locs[0]
    loc_id = loc["id"]
    print(f"[OK] Target Workstation / Area: '{loc.get('name')}' (ID: {loc_id})")

    # 1. Audit Executions (read)
    print("\n--- 1. Testing Audit Executions Module ---")
    res = requests.get(f"{BASE_URL}/audit-executions", headers=coord)
    assert res.status_code == 200, f"Failed to get audit executions: {res.status_code} {res.text}"
    executions = unwrap(res)
    print(f"[OK] Retrieved {len(executions)} audit executions.")
    if executions:
        exec_id = executions[0]["id"]
        res_single = requests.get(f"{BASE_URL}/audit-executions/{exec_id}", headers=coord)
        assert res_single.status_code == 200, f"Failed to get single execution: {res_single.status_code}"
        print(f"[OK] Single execution detail loaded for ID: {exec_id} (Score: {unwrap(res_single).get('overallScore')}%)")

    # 2. Observations
    print("\n--- 2. Testing Observations & Abnormality Module ---")
    res_obs = requests.get(f"{BASE_URL}/observations", headers=coord)
    assert res_obs.status_code == 200, f"Failed to get observations: {res_obs.status_code}"
    print(f"[OK] Retrieved {len(unwrap(res_obs))} shop-floor observations.")

    new_obs_payload = {
        "locationId": loc_id,
        "category": "S3_SHINE",
        "severity": "MODERATE",
        "title": "Coolant mist residue on optical inspection lens",
        "description": "Oil mist extractor filter saturated causing condensation on AOI lens.",
        "riskAssessment": "Risk of false optical inspection rejection on PCB assembly.",
        "tags": ["AOI", "Optics", "Shine"],
    }
    create_obs_res = requests.post(f"{BASE_URL}/observations", json=new_obs_payload, headers=owner)
    assert create_obs_res.status_code in (200, 201), f"Failed to create observation: {create_obs_res.text}"
    created_obs = unwrap(create_obs_res)
    print(f"[OK] Area owner logged observation: {created_obs.get('observationCode')}")

    # 3. CAPA lifecycle on the observation created above
    print("\n--- 3. Testing CAPA, 5-Why & Independent Verification ---")
    capa_payload = {
        "observationId": created_obs["id"],
        "locationId": loc_id,
        "title": "Replace oil mist extractor filter",
        "description": "Restore extraction capacity and add filter change to PM schedule.",
        "assigneeId": owner_session["user"]["id"],
        "rootCauseCategory": "MACHINE",
    }
    res_capa = requests.post(f"{BASE_URL}/corrective-actions", json=capa_payload, headers=coord)
    assert res_capa.status_code in (200, 201), f"Failed to create CAPA: {res_capa.text}"
    action = unwrap(res_capa)
    action_id = action["id"]
    print(f"[OK] Coordinator raised CAPA {action.get('actionCode')} assigned to the area owner")

    res_early_verify = requests.post(f"{BASE_URL}/corrective-actions/{action_id}/verify", json={"approved": True}, headers=auditor)
    assert res_early_verify.status_code == 409, f"Verification before closure should be rejected: {res_early_verify.status_code}"
    print("[OK] Verification before closure evidence is rejected (409)")

    five_why_payload = {
        "why1": "Lens fogging on AOI camera",
        "why2": "Oil mist reaches the inspection cell",
        "why3": "Extractor flow below specification",
        "why4": "Filter saturated",
        "why5": "Root Cause: filter change not on the preventive maintenance schedule",
        "rootCauseCategory": "MACHINE",
    }
    res_5why = requests.patch(f"{BASE_URL}/corrective-actions/{action_id}/5-why", json=five_why_payload, headers=owner)
    assert res_5why.status_code == 200, f"Failed to save 5-Why: {res_5why.text}"
    print("[OK] Area owner recorded 5-Why root cause analysis")

    closure_payload = {
        "closureNotes": "Filter replaced; monthly filter change added to PM checklist.",
        "afterPhotoUrl": "https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800",
    }
    res_close = requests.post(f"{BASE_URL}/corrective-actions/{action_id}/submit-closure", json=closure_payload, headers=owner)
    assert res_close.status_code in (200, 201), f"Failed to submit closure: {res_close.text}"
    print(f"[OK] Closure evidence submitted. Status: {unwrap(res_close).get('status')}")

    res_self_verify = requests.post(f"{BASE_URL}/corrective-actions/{action_id}/verify", json={"approved": True}, headers=owner)
    assert res_self_verify.status_code == 403, f"Assignee self-verification should be rejected: {res_self_verify.status_code}"
    print("[OK] Assignee cannot verify their own closure (403)")

    res_verify = requests.post(
        f"{BASE_URL}/corrective-actions/{action_id}/verify",
        json={"approved": True, "verificationNotes": "Physically verified: lens clear, extractor within spec."},
        headers=auditor,
    )
    assert res_verify.status_code in (200, 201), f"Failed to verify action: {res_verify.text}"
    print(f"[OK] Independent verification by auditor. Final status: {unwrap(res_verify).get('status')}")

    # 4. Red Tag lifecycle
    print("\n--- 4. Testing Red Tag Management Hub ---")
    res_metrics = requests.get(f"{BASE_URL}/red-tags/metrics", headers=coord)
    assert res_metrics.status_code == 200, f"Failed to get red tag metrics: {res_metrics.status_code}"
    metrics = unwrap(res_metrics)
    print(f"[OK] Red Tag Metrics: total={metrics.get('totalTags')}, ageing={json.dumps(metrics.get('ageingDistribution'))}")

    new_rt_payload = {
        "locationId": loc_id,
        "itemName": "Decommissioned Wave Solder Pre-Heater",
        "itemDescription": "Older model pre-heater replaced during line upgrade.",
        "category": "BROKEN_EQUIPMENT",
        "quantity": 1,
        "unitOfMeasure": "SETS",
        "estimatedValue": 3500.00,
        "reason": "Redundant asset since the inline solder machine was commissioned.",
    }
    res_create_rt = requests.post(f"{BASE_URL}/red-tags", json=new_rt_payload, headers=owner)
    assert res_create_rt.status_code in (200, 201), f"Failed to create Red Tag: {res_create_rt.text}"
    created_rt = unwrap(res_create_rt)
    print(f"[OK] Area owner registered Red Tag: {created_rt.get('tagNumber')}")

    proposal = {
        "dispositionAction": "DISPOSE_SCRAP",
        "dispositionJustification": "Scrap vendor quoted salvage value.",
        "supervisorApproved": False,
    }
    res_prop = requests.post(f"{BASE_URL}/red-tags/{created_rt['id']}/disposition", json=proposal, headers=owner)
    assert res_prop.status_code in (200, 201), f"Failed to propose disposition: {res_prop.text}"
    print(f"[OK] Disposition proposed. Status: {unwrap(res_prop).get('status')}")

    approval = dict(proposal, supervisorApproved=True)
    res_disp = requests.post(f"{BASE_URL}/red-tags/{created_rt['id']}/disposition", json=approval, headers=coord)
    assert res_disp.status_code in (200, 201), f"Failed to approve disposition: {res_disp.text}"
    print(f"[OK] Supervisor approved disposition. Status: {unwrap(res_disp).get('status')}")

    res_close_rt = requests.post(
        f"{BASE_URL}/red-tags/{created_rt['id']}/close",
        json={"financialRecovered": 450.00, "notes": "Certificate of destruction received."},
        headers=coord,
    )
    assert res_close_rt.status_code in (200, 201), f"Failed to close Red Tag: {res_close_rt.text}"
    close_rt_data = unwrap(res_close_rt)
    print(f"[OK] Red Tag closed: {close_rt_data.get('status')} (Recovered: ${close_rt_data.get('financialRecovered')})")

    print("\n==================================================")
    print("  ALL TESTS PASSED                                 ")
    print("==================================================")


if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        print(f"[FAIL] Test Failure: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
