import requests
import json
import sys

BASE_URL = "http://localhost:3001/api/v1"

def unwrap(res):
    d = res.json()
    if isinstance(d, dict) and "data" in d:
        return d["data"]
    return d

def run_tests():
    print("==================================================")
    print("  5S SAAS PLATFORM - E2E OPERATIONAL VERIFIER     ")
    print("==================================================")

    # Fetch tenants
    print("\n--- 0. Resolving Tenant Context ---")
    res_tenants = requests.get(f"{BASE_URL}/tenants")
    assert res_tenants.status_code == 200, f"Failed to get tenants: {res_tenants.text}"
    tenants = unwrap(res_tenants)
    assert len(tenants) > 0, "No tenants found"
    target_tenant = next((t for t in tenants if t.get("slug") == "skilglobal-mfg"), tenants[0])
    tenant_id = target_tenant["id"]
    print(f"[OK] Active Tenant: '{target_tenant.get('name')}' (ID: {tenant_id})")

    headers = {
        "Content-Type": "application/json",
        "x-tenant-id": tenant_id
    }

    # Fetch Locations
    res_locs = requests.get(f"{BASE_URL}/locations", headers=headers)
    assert res_locs.status_code == 200
    locs = unwrap(res_locs)
    assert len(locs) > 0, "No locations found in tenant"
    loc_id = locs[0]["id"]
    print(f"[OK] Target Workstation / Area: '{locs[0].get('name')}' (ID: {loc_id})")

    # 1. Audit Executions
    print("\n--- 1. Testing Audit Executions Module ---")
    res = requests.get(f"{BASE_URL}/audit-executions", headers=headers)
    assert res.status_code == 200, f"Failed to get audit executions: {res.status_code} {res.text}"
    executions = unwrap(res)
    print(f"[OK] Retrieved {len(executions)} audit executions.")
    
    if len(executions) > 0:
        exec_id = executions[0]["id"]
        res_single = requests.get(f"{BASE_URL}/audit-executions/{exec_id}", headers=headers)
        assert res_single.status_code == 200, f"Failed to get single execution: {res_single.status_code}"
        single_data = unwrap(res_single)
        print(f"[OK] Single execution detail loaded for ID: {exec_id} (Score: {single_data.get('overallScore')}%)")

    # 2. Observations Module
    print("\n--- 2. Testing Observations & Abnormality Module ---")
    res_obs = requests.get(f"{BASE_URL}/observations", headers=headers)
    assert res_obs.status_code == 200, f"Failed to get observations: {res_obs.status_code}"
    observations = unwrap(res_obs)
    print(f"[OK] Retrieved {len(observations)} shop-floor observations.")
    for obs in observations[:2]:
        print(f"  - [{obs.get('observationCode')}] Severity: {obs.get('severity')}, Category: {obs.get('category')}, Title: {obs.get('title')}")

    # Test creating new observation
    new_obs_payload = {
        "locationId": loc_id,
        "category": "S3_SHINE",
        "severity": "MODERATE",
        "title": "Coolant mist residue on optical inspection lens",
        "description": "Oil mist extractor filter saturated causing condensation on AOI lens.",
        "beforePhotoUrl": "https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800",
        "riskAssessment": "Risk of false optical inspection rejection on PCB assembly.",
        "tags": ["AOI", "Optics", "Shine"]
    }
    create_obs_res = requests.post(f"{BASE_URL}/observations", json=new_obs_payload, headers=headers)
    assert create_obs_res.status_code in (200, 201), f"Failed to create observation: {create_obs_res.text}"
    created_obs = unwrap(create_obs_res)
    print(f"[OK] Created observation: {created_obs.get('observationCode')} (Auto CAPA created: {created_obs.get('correctiveActionId') is not None})")

    # 3. Corrective Actions (CAPA) Module with 5-Why & Independent Verification
    print("\n--- 3. Testing CAPA & 5-Why Analysis Module ---")
    res_capa = requests.get(f"{BASE_URL}/corrective-actions", headers=headers)
    assert res_capa.status_code == 200, f"Failed to get CAPA actions: {res_capa.status_code}"
    capa_list = unwrap(res_capa)
    print(f"[OK] Retrieved {len(capa_list)} corrective actions.")

    if len(capa_list) > 0:
        target_action = capa_list[0]
        action_id = target_action["id"]
        print(f"  Target CAPA: {target_action.get('actionCode')} - Status: {target_action.get('status')}")

        # Test updating 5-Why Root Cause
        five_why_payload = {
            "why1": "Unsecured pneumatic hose tripped technician",
            "why2": "Hose was draped across primary transit aisle",
            "why3": "Quick-disconnect fitting reel spring was broken",
            "why4": "Preventive maintenance on air drop reels was overdue by 45 days",
            "why5": "Root Cause: Tooling maintenance schedule lacked automated Kanban triggers for pneumatic peripherals",
            "rootCauseCategory": "MACHINE"
        }
        res_5why = requests.patch(f"{BASE_URL}/corrective-actions/{action_id}/5-why", json=five_why_payload, headers=headers)
        assert res_5why.status_code == 200, f"Failed to save 5-Why: {res_5why.text}"
        print(f"[OK] Updated 5-Why Root Cause analysis on {target_action.get('actionCode')}")

        # Test Submitting Closure Proof
        closure_payload = {
            "closureNotes": "Installed heavy-duty ceiling-mounted retractable reel with weekly PM checklist tag.",
            "afterPhotoUrl": "https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800",
            "actorName": "James Wilson (Lead Line Tech)"
        }
        res_close = requests.post(f"{BASE_URL}/corrective-actions/{action_id}/submit-closure", json=closure_payload, headers=headers)
        assert res_close.status_code in (200, 201), f"Failed to submit closure: {res_close.text}"
        close_data = unwrap(res_close)
        print(f"[OK] Submitted closure proof with after-photo. Status is now: {close_data.get('status')}")

        # Test Independent Verification Sign-Off
        verify_payload = {
            "approved": True,
            "verificationNotes": "Physical inspection verified hose is fully elevated. No tripping hazards remain.",
            "verifierName": "Sarah Jenkins (EHS & 5S Auditor)"
        }
        res_verify = requests.post(f"{BASE_URL}/corrective-actions/{action_id}/verify", json=verify_payload, headers=headers)
        assert res_verify.status_code in (200, 201), f"Failed to verify action: {res_verify.text}"
        verify_data = unwrap(res_verify)
        print(f"[OK] Independent verification completed. Final status: {verify_data.get('status')}")

    # 4. Red Tag Management Hub
    print("\n--- 4. Testing Red Tag Management Hub ---")
    res_tags = requests.get(f"{BASE_URL}/red-tags", headers=headers)
    assert res_tags.status_code == 200, f"Failed to get red tags: {res_tags.status_code}"
    tags = unwrap(res_tags)
    print(f"[OK] Retrieved {len(tags)} Red Tags in register.")

    res_metrics = requests.get(f"{BASE_URL}/red-tags/metrics", headers=headers)
    assert res_metrics.status_code == 200, f"Failed to get red tag metrics: {res_metrics.status_code}"
    metrics = unwrap(res_metrics)
    print(f"[OK] Red Tag Metrics:")
    print(f"  - Total Active Tags: {metrics.get('totalTags')}")
    print(f"  - Total Estimated Value: ${metrics.get('totalValue', 0):,.2f}")
    print(f"  - Total Financial Recovered: ${metrics.get('recoveredValue', 0):,.2f}")
    print(f"  - Ageing breakdown: {json.dumps(metrics.get('ageingDistribution'))}")

    # Test registering new Red Tag
    new_rt_payload = {
        "locationId": loc_id,
        "targetHoldingAreaId": loc_id,
        "itemName": "Decommissioned Wave Solder Pre-Heater",
        "itemDescription": "Older model pre-heater replaced during line upgrade; occupies 1.5 sq meters on assembly floor.",
        "category": "OBSOLETE_EQUIPMENT",
        "quantity": 1,
        "unitOfMeasure": "SET",
        "estimatedValue": 3500.00,
        "reason": "Redundant asset since modern inline solder machine was commissioned.",
        "photoUrl": "https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=800"
    }
    res_create_rt = requests.post(f"{BASE_URL}/red-tags", json=new_rt_payload, headers=headers)
    assert res_create_rt.status_code in (200, 201), f"Failed to create Red Tag: {res_create_rt.text}"
    created_rt = unwrap(res_create_rt)
    print(f"[OK] Generated Red Tag: {created_rt.get('tagNumber')} (Ageing Tier: {created_rt.get('ageingTier')})")

    # Test disposition approval
    disp_payload = {
        "dispositionAction": "SCRAP_RECYCLE",
        "dispositionJustification": "Internal transfer rejected by Plant B; electronics scrap vendor quoted $450 salvage value.",
        "supervisorApproved": True,
        "supervisorName": "David Miller (Plant Operations Manager)"
    }
    res_disp = requests.post(f"{BASE_URL}/red-tags/{created_rt['id']}/disposition", json=disp_payload, headers=headers)
    assert res_disp.status_code in (200, 201), f"Failed to submit disposition: {res_disp.text}"
    disp_data = unwrap(res_disp)
    print(f"[OK] Disposition approved: {disp_data.get('dispositionAction')}")

    # Test final closure with financial salvage recovery
    close_rt_payload = {
        "financialRecovered": 450.00,
        "closurePhotoUrl": "https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800",
        "notes": "Scrap vendor collected asset. Certificate of destruction received and $450 check credited."
    }
    res_close_rt = requests.post(f"{BASE_URL}/red-tags/{created_rt['id']}/close", json=close_rt_payload, headers=headers)
    assert res_close_rt.status_code in (200, 201), f"Failed to close Red Tag: {res_close_rt.text}"
    close_rt_data = unwrap(res_close_rt)
    print(f"[OK] Red Tag closed & retired: {close_rt_data.get('status')} (Salvage Recovered: ${close_rt_data.get('financialRecovered')})")

    print("\n==================================================")
    print("  ALL TESTS PASSED WITH 100% SUCCESS RATE!        ")
    print("==================================================")

if __name__ == "__main__":
    try:
        run_tests()
    except Exception as e:
        print(f"[FAIL] Test Failure: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
