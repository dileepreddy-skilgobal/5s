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

def test_standards(headers):
    log("Testing 5S Visual Standards API...", "PHASE 2")
    ts = int(time.time())
    code = f"STD-WELD-{ts}"
    
    # 1. Create a new 5S standard
    create_payload = {
        "code": code,
        "title": f"Robotic Welding Cell Standard {ts}",
        "category": "S1_SORT",
        "scopeType": "GLOBAL",
        "description": "Strict standard for welding torch cleanliness, cable suspension, and scrap hopper clearing.",
        "rules": [
            "Welding spatter screens must be clean and unpunctured.",
            "Scrap hopper emptied at end of each 8-hour shift.",
            "Torch tips inspected and dressed per SOP-WELD-04."
        ],
        "referencePhotos": [
            {
                "type": "STANDARD_CONDITION",
                "photoUrl": "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=600&q=80",
                "label": "Compliant Standard Condition",
                "description": "Spotless welding jig, cables neatly bundled."
            },
            {
                "type": "CURRENT_CONDITION",
                "photoUrl": "https://images.unsplash.com/photo-1581092335397-9583fe92d232?auto=format&fit=crop&w=600&q=80",
                "label": "Defect Non-Compliance Example",
                "description": "Loose cables dragging on floor, slag buildup."
            }
        ],
        "videoUrl": "https://youtube.com/watch?v=demo",
        "sopDocumentUrl": "https://docs.skilglobal.com/sop-weld-01.pdf"
    }
    
    r = requests.post(f"{BASE_URL}/standards", headers=headers, json=create_payload)
    assert r.status_code in [200, 201], f"Failed to create standard: {r.text}"
    std = r.json()["data"]
    std_id = std["id"]
    log(f"Standard created: {std['code']} (ID: {std_id})", "PASS")
    
    # 2. Get standard by ID
    r = requests.get(f"{BASE_URL}/standards/{std_id}", headers=headers)
    assert r.status_code == 200
    std_data = r.json()["data"]
    assert std_data["code"] == code
    assert len(std_data["revisions"]) >= 1
    assert std_data["currentRevision"] is not None
    log(f"Standard fetched successfully with active revision Rev {std_data['currentRevision']['revisionNumber']}", "PASS")
    
    # 3. Create Draft Revision 2.0
    rev_payload = {
        "revisionNumber": "2.0",
        "description": "Updated welding standard to include PPE ear protection and laser enclosure interlock.",
        "rules": [
            "Welding spatter screens clean and unpunctured.",
            "Laser safety enclosure interlocks verified prior to power-on.",
            "Scrap hopper emptied each shift."
        ],
        "revisionComments": "Added safety interlock requirements per OSHA audit.",
        "publishDirectly": False
    }
    r = requests.post(f"{BASE_URL}/standards/{std_id}/revisions", headers=headers, json=rev_payload)
    assert r.status_code in [200, 201], f"Failed to create revision: {r.text}"
    updated_std = r.json()["data"]
    draft_rev = [rev for rev in updated_std["revisions"] if rev["revisionNumber"] == "2.0"][0]
    draft_rev_id = draft_rev["id"]
    log(f"Draft Revision 2.0 created (Rev ID: {draft_rev_id})", "PASS")
    
    # 4. Approve Revision 2.0
    approve_payload = {"comments": "Approved by EHS Safety Manager."}
    r = requests.post(f"{BASE_URL}/standards/{std_id}/revisions/{draft_rev_id}/approve", headers=headers, json=approve_payload)
    assert r.status_code in [200, 201], f"Failed to approve revision: {r.text}"
    approved_std = r.json()["data"]
    assert approved_std["currentRevision"]["revisionNumber"] == "2.0"
    log("Revision 2.0 approved and set as Current Active revision", "PASS")
    
    return std_id

def test_audit_templates(headers, standard_id):
    log("Testing 5S Audit Templates & Question Engine...", "PHASE 2")
    ts = int(time.time())
    code = f"TPL-ADV-{ts}"
    
    # 1. Create Audit Template
    tpl_payload = {
        "code": code,
        "name": f"Advanced Automated Cell Inspection {ts}",
        "description": "Comprehensive template covering 1S-6S with critical safety ceilings.",
        "auditType": "ROUTINE",
        "initialVersionNumber": "1.0",
        "categoryScoringModel": {
            "S1_SORT": 20,
            "S2_SET_IN_ORDER": 20,
            "S3_SHINE": 20,
            "S4_STANDARDIZE": 15,
            "S5_SUSTAIN": 15,
            "S6_SAFETY": 10
        }
    }
    r = requests.post(f"{BASE_URL}/audit-templates", headers=headers, json=tpl_payload)
    assert r.status_code in [200, 201], f"Failed to create template: {r.text}"
    tpl = r.json()["data"]
    tpl_id = tpl["id"]
    active_ver_id = tpl["currentVersion"]["id"]
    log(f"Template created: {tpl['code']} (ID: {tpl_id}, Version: {tpl['currentVersion']['versionNumber']})", "PASS")
    
    # 2. Add Section
    sec_payload = {
        "title": "1S - Sort & Red Tag Zone",
        "description": "Evaluating obsolete items and floor clearance.",
        "category": "S1_SORT",
        "sortOrder": 1
    }
    r = requests.post(f"{BASE_URL}/audit-templates/{tpl_id}/versions/{active_ver_id}/sections", headers=headers, json=sec_payload)
    assert r.status_code in [200, 201], f"Failed to add section: {r.text}"
    section = r.json()["data"]
    sec_id = section["id"]
    log(f"Section added: {section['title']} (ID: {sec_id})", "PASS")
    
    # 3. Add Questions (including Critical Safety Question with scoreCapOnFail=70)
    q1_payload = {
        "questionCode": "Q-1S-01",
        "questionText": "Are obsolete tools and unneeded materials removed from the cell?",
        "questionType": "YES_NO",
        "weightage": 5,
        "severity": "MODERATE",
        "isCritical": False,
        "standardId": standard_id,
        "sortOrder": 1
    }
    r = requests.post(f"{BASE_URL}/audit-templates/sections/{sec_id}/questions", headers=headers, json=q1_payload)
    assert r.status_code in [200, 201], f"Failed to add Q1: {r.text}"
    q1 = r.json()["data"]
    log(f"Question 1 (YES_NO) added: {q1['questionCode']}", "PASS")
    
    q2_payload = {
        "questionCode": "Q-1S-CRIT-02",
        "questionText": "Is the emergency exit route completely unblocked by red-tagged inventory?",
        "questionType": "PASS_FAIL",
        "weightage": 10,
        "severity": "CRITICAL",
        "isCritical": True,
        "scoreCapOnFail": 70,
        "mandatoryEvidence": True,
        "requireEvidenceOnScoreBelow": 100,
        "standardId": standard_id,
        "sortOrder": 2
    }
    r = requests.post(f"{BASE_URL}/audit-templates/sections/{sec_id}/questions", headers=headers, json=q2_payload)
    assert r.status_code in [200, 201], f"Failed to add Critical Q2: {r.text}"
    q2 = r.json()["data"]
    log(f"Critical Safety Question (scoreCapOnFail: {q2['scoreCapOnFail']}%) added: {q2['questionCode']}", "PASS")
    
    # 4. Add Section 2 with Numeric 0-5
    sec2_payload = {
        "title": "3S - Shine & Equipment Cleanliness",
        "category": "S3_SHINE",
        "sortOrder": 2
    }
    r = requests.post(f"{BASE_URL}/audit-templates/{tpl_id}/versions/{active_ver_id}/sections", headers=headers, json=sec2_payload)
    assert r.status_code in [200, 201]
    sec2_id = r.json()["data"]["id"]
    
    q3_payload = {
        "questionCode": "Q-3S-01",
        "questionText": "Rate the optical cleanliness of safety interlock sensors (0=filthy, 5=spotless)",
        "questionType": "NUMERIC_0_5",
        "weightage": 5,
        "severity": "MINOR",
        "sortOrder": 1
    }
    r = requests.post(f"{BASE_URL}/audit-templates/sections/{sec2_id}/questions", headers=headers, json=q3_payload)
    assert r.status_code in [200, 201]
    log("Numeric 0-5 Question added to Section 2", "PASS")
    
    # 5. Publish Template Version
    r = requests.post(f"{BASE_URL}/audit-templates/{tpl_id}/versions/{active_ver_id}/publish", headers=headers, json={"changeSummary": "Production Baseline Release"})
    assert r.status_code in [200, 201], f"Failed to publish version: {r.text}"
    published_ver = r.json()["data"]
    assert published_ver["isPublished"] == True
    log(f"Template Version v{published_ver['versionNumber']} published as immutable snapshot", "PASS")
    
    return tpl_id, active_ver_id

def test_audit_schedules(headers, tpl_id, version_id):
    log("Testing Audit Schedules & Recurrence Engine...", "PHASE 2")
    
    # Fetch locations
    r = requests.get(f"{BASE_URL}/locations", headers=headers)
    assert r.status_code == 200
    locations = r.json()["data"]
    loc_ids = [l["id"] for l in locations[:3]]
    
    # 1. Create Schedule with Department Independence Rotation Rule
    ts = int(time.time())
    sched_payload = {
        "scheduleCode": f"SCH-PRECISION-{ts}",
        "title": "Bi-Weekly High-Precision Machining 5S Audit",
        "templateId": tpl_id,
        "templateVersionId": version_id,
        "auditType": "ROUTINE",
        "targetType": "SPECIFIC_LOCATIONS",
        "targetLocationIds": loc_ids,
        "recurrence": "FORTNIGHTLY",
        "recurrenceIntervalDays": 14,
        "rotationRule": "DEPT_INDEPENDENCE",
        "startDate": "2026-09-20",
        "leadTimeDays": 3
    }
    r = requests.post(f"{BASE_URL}/audit-schedules", headers=headers, json=sched_payload)
    assert r.status_code in [200, 201], f"Failed to create schedule: {r.text}"
    sched = r.json()["data"]
    sched_id = sched["id"]
    log(f"Schedule created: {sched['scheduleCode']} (Rule: {sched['rotationRule']}, Recurrence: {sched['recurrence']})", "PASS")
    
    # 2. Trigger Instant Generation
    r = requests.post(f"{BASE_URL}/audit-schedules/{sched_id}/generate", headers=headers)
    assert r.status_code in [200, 201], f"Failed to generate audits: {r.text}"
    gen_result = r.json()["data"]
    log(f"Schedule engine executed: Generated {gen_result.get('createdCount', 0)} audits", "PASS")
    
    # 3. Verify Scheduled Instances
    r = requests.get(f"{BASE_URL}/audit-schedules/instances", headers=headers)
    assert r.status_code == 200
    instances = r.json()["data"]
    assert len(instances) >= 1
    sample_inst = instances[0]
    log(f"Verified generated audit instance: {sample_inst['auditCode']} (Status: {sample_inst['status']}, Planned: {sample_inst['plannedDate']})", "PASS")

def main():
    log("====================================================", "START")
    log("STARTING PHASE 2 AUTOMATED INTEGRATION SUITE", "START")
    log("====================================================", "START")
    
    try:
        # Resolve Tenant ID
        r = requests.get(f"{BASE_URL}/tenants")
        tenants = r.json()["data"]
        tenant = next((t for t in tenants if t["slug"] == TENANT_SLUG), tenants[0])
        tenant_id = tenant["id"]
        headers = get_headers(tenant_id)
        log(f"Tenant resolved: {tenant['name']} (ID: {tenant_id})", "INFO")
        
        std_id = test_standards(headers)
        tpl_id, ver_id = test_audit_templates(headers, std_id)
        test_audit_schedules(headers, tpl_id, ver_id)
        
        log("====================================================", "SUCCESS")
        log("ALL PHASE 2 BACKEND & ARCHITECTURE TESTS PASSED 100%!", "SUCCESS")
        log("====================================================", "SUCCESS")
    except Exception as e:
        log(f"TEST FAILED WITH ERROR: {e}", "ERROR")
        sys.exit(1)

if __name__ == "__main__":
    main()
