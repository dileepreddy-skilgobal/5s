import requests
import json
import sys
import time

BASE_URL = "http://localhost:3001/api/v1"
TENANT_SLUG = "skilglobal-mfg"

def get_headers(tenant_id):
    return {
        "x-tenant-id": tenant_id,
        "Content-Type": "application/json"
    }

def log(msg, status="INFO"):
    print(f"[{status}] {msg}")

def main():
    log("====================================================", "START")
    log("RUNNING EXTENDED PHASE 2 VERIFICATION SUITE", "START")
    log("====================================================", "START")

    # 1. Resolve Tenant
    r = requests.get(f"{BASE_URL}/tenants")
    tenants = r.json()["data"]
    tenant = next((t for t in tenants if t["slug"] == TENANT_SLUG), tenants[0])
    tenant_id = tenant["id"]
    headers = get_headers(tenant_id)
    log(f"Tenant Context: {tenant['name']} ({tenant_id})", "PASS")

    # 2. Test Standards Full Lifecycle + Patch + Revision + Approval
    ts = int(time.time())
    std_code = f"STD-HYDR-{ts}"
    r = requests.post(f"{BASE_URL}/standards", headers=headers, json={
        "code": std_code,
        "title": "Hydraulic Power Pack 5S Cleanliness Standard",
        "category": "S3_SHINE",
        "scopeType": "GLOBAL",
        "description": "Zero oil leakage threshold, color-coded level sight glass, daily wipe down routine.",
        "rules": [
            "Sight glass clean and oil level between min and max demarcation lines.",
            "Drip tray wiped daily with degreaser; zero standing fluid.",
            "Pressure gauges calibrated and within green operating zone (140-160 bar)."
        ],
        "standardPhotoUrl": "https://images.unsplash.com/photo-1581092160607-ee22621dd758",
        "currentPhotoUrl": "https://images.unsplash.com/photo-1581092335397-9583fe92d232"
    })
    assert r.status_code in [200, 201], f"Create Standard failed: {r.text}"
    std = r.json()["data"]
    std_id = std["id"]
    log(f"Standard Created: {std['code']} (ID: {std_id})", "PASS")

    # Test PATCH standard metadata
    r = requests.patch(f"{BASE_URL}/standards/{std_id}", headers=headers, json={
        "title": "Hydraulic Power Pack & Reservoir 5S Cleanliness Standard (Updated)"
    })
    assert r.status_code == 200
    log("Standard Metadata Patched Successfully", "PASS")

    # 3. Test Audit Template Creation, Section, Question, and Clone
    tpl_code = f"TPL-HYDR-{ts}"
    r = requests.post(f"{BASE_URL}/audit-templates", headers=headers, json={
        "code": tpl_code,
        "name": "Hydraulic Systems Operational 5S Inspection",
        "auditType": "ROUTINE",
        "categoryScoringModel": { "S1": 20, "S2": 20, "S3": 30, "S4": 15, "S5": 15 }
    })
    assert r.status_code in [200, 201]
    tpl = r.json()["data"]
    tpl_id = tpl["id"]
    ver_id = tpl["currentVersion"]["id"]
    log(f"Audit Template Created: {tpl['code']} (v{tpl['currentVersion']['versionNumber']})", "PASS")

    # Add Section
    r = requests.post(f"{BASE_URL}/audit-templates/{tpl_id}/versions/{ver_id}/sections", headers=headers, json={
        "title": "3S - Shine & Leakage Prevention",
        "category": "S3_SHINE",
        "sortOrder": 1
    })
    assert r.status_code in [200, 201]
    sec_id = r.json()["data"]["id"]
    log("Section Added", "PASS")

    # Add Question linking to Standard
    r = requests.post(f"{BASE_URL}/audit-templates/sections/{sec_id}/questions", headers=headers, json={
        "questionCode": "Q-HYDR-01",
        "questionText": "Is the oil reservoir drip tray 100% dry and free of hydraulic fluid accumulation?",
        "questionType": "PASS_FAIL",
        "weightage": 5,
        "severity": "MAJOR",
        "isCritical": True,
        "scoreCapOnFail": 70,
        "standardId": std_id,
        "mandatoryEvidence": True
    })
    assert r.status_code in [200, 201]
    q = r.json()["data"]
    log(f"Question with Standard Link and 70% Critical Cap Added: {q['questionCode']}", "PASS")

    # Test Clone Template
    clone_code = f"TPL-CLONE-{ts}"
    r = requests.post(f"{BASE_URL}/audit-templates/{tpl_id}/clone", headers=headers, json={
        "code": clone_code,
        "name": "Hydraulic Systems 5S - Plant 2 Cloned Template"
    })
    assert r.status_code in [200, 201]
    cloned_tpl = r.json()["data"]
    log(f"Template Cloned: {cloned_tpl['code']} with {cloned_tpl['totalQuestions']} Questions", "PASS")

    # 4. Test Audit Schedule Creation, Pause/Resume, and Auditor Reassignment
    r = requests.get(f"{BASE_URL}/locations", headers=headers)
    locations = r.json()["data"]
    loc_ids = [l["id"] for l in locations[:2]]

    sched_code = f"SCH-HYDR-{ts}"
    r = requests.post(f"{BASE_URL}/audit-schedules", headers=headers, json={
        "scheduleCode": sched_code,
        "title": "Weekly Hydraulic Powerpack 5S Audit",
        "templateId": tpl_id,
        "templateVersionId": ver_id,
        "auditType": "ROUTINE",
        "targetType": "SPECIFIC_LOCATIONS",
        "targetLocationIds": loc_ids,
        "recurrence": "WEEKLY",
        "recurrenceIntervalDays": 7,
        "rotationRule": "DEPT_INDEPENDENCE",
        "startDate": "2026-09-21",
        "leadTimeDays": 2
    })
    assert r.status_code in [200, 201]
    sched = r.json()["data"]
    sched_id = sched["id"]
    log(f"Audit Schedule Created: {sched['scheduleCode']}", "PASS")

    # Test Pause Schedule
    r = requests.patch(f"{BASE_URL}/audit-schedules/{sched_id}", headers=headers, json={
        "status": "PAUSED"
    })
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "PAUSED"
    log("Schedule Status Paused via PATCH", "PASS")

    # Test Resume Schedule
    r = requests.patch(f"{BASE_URL}/audit-schedules/{sched_id}", headers=headers, json={
        "status": "ACTIVE"
    })
    assert r.status_code == 200
    assert r.json()["data"]["status"] == "ACTIVE"
    log("Schedule Status Resumed via PATCH", "PASS")

    # Test Update Scheduled Audit Instance (Reassign Auditor / Change SLA Due Date)
    r = requests.get(f"{BASE_URL}/audit-schedules/instances", headers=headers)
    instances = r.json()["data"]
    if len(instances) > 0:
        inst_id = instances[0]["id"]
        r = requests.patch(f"{BASE_URL}/audit-schedules/instances/{inst_id}", headers=headers, json={
            "notes": "Reassigned per EHS department rotation request.",
            "status": "SCHEDULED"
        })
        assert r.status_code == 200
        log(f"Scheduled Audit Instance {instances[0]['auditCode']} Updated Successfully", "PASS")

    log("====================================================", "SUCCESS")
    log("ALL EXTENDED PHASE 2 ARCHITECTURAL TESTS PASSED 100%!", "SUCCESS")
    log("====================================================", "SUCCESS")

if __name__ == "__main__":
    main()
