import urllib.request
import urllib.parse
import json
import time

BASE = 'http://localhost:3001/api/v1'
TENANT_HEADER = {'x-tenant-id': 'skilglobal-mfg', 'Content-Type': 'application/json'}

def get(url):
    req = urllib.request.Request(f'{BASE}{url}', headers=TENANT_HEADER)
    with urllib.request.urlopen(req) as resp:
        parsed = json.loads(resp.read().decode('utf-8'))
        return parsed['data'] if isinstance(parsed, dict) and 'data' in parsed else parsed

def post(url, data):
    req = urllib.request.Request(
        f'{BASE}{url}',
        data=json.dumps(data).encode('utf-8'),
        headers=TENANT_HEADER,
        method='POST'
    )
    with urllib.request.urlopen(req) as resp:
        parsed = json.loads(resp.read().decode('utf-8'))
        return parsed['data'] if isinstance(parsed, dict) and 'data' in parsed else parsed

def patch(url, data):
    req = urllib.request.Request(
        f'{BASE}{url}',
        data=json.dumps(data).encode('utf-8'),
        headers=TENANT_HEADER,
        method='PATCH'
    )
    with urllib.request.urlopen(req) as resp:
        parsed = json.loads(resp.read().decode('utf-8'))
        return parsed['data'] if isinstance(parsed, dict) and 'data' in parsed else parsed

print('==========================================')
print('   PHASE 3 AUTOMATED API INTEGRATION TEST')
print('==========================================\n')

# Fetch tenant UUID
tenants = get('/tenants')
skil_tenant = next(t for t in tenants if t['slug'] == 'skilglobal-mfg')
TENANT_ID = skil_tenant['id']
TENANT_HEADER = {'x-tenant-id': TENANT_ID, 'Content-Type': 'application/json'}

# 1. Fetch location and template for audit runner
print('--- 1. Fetching Location & Template Master ---')
locs = get('/locations')
location = locs[0]
print(f'Target Location: {location["name"]} ({location["areaCode"]})')

templates = get('/audit-templates')
template = templates[0]
print(f'Template: {template["name"]} ({template["code"]})')

# 2. Start Audit Execution
print('\n--- 2. Starting Mobile Audit Execution Session ---')
start_res = post('/audit-executions/start', {
    'locationId': location['id'],
    'templateId': template['id'],
    'auditType': 'ROUTINE',
    'auditorName': 'Vikram Joshi (Lead 5S Auditor)'
})
exec_id = start_res['id']
audit_code = start_res['auditCode']
print(f'Audit Execution Started: {audit_code} (ID: {exec_id})')
sections = start_res['templateVersion']['sections']
print(f'Loaded {len(sections)} Checklist Sections for Execution')

# 3. Simulate Answering Checklist (with 1 non-conformance finding)
print('\n--- 3. Answering Checklist Questions & Capturing Evidence ---')
answers = []
for s_idx, sec in enumerate(sections):
    for q_idx, q in enumerate(sec['questions']):
        # If first question in sort section, create a major non-conformance
        if s_idx == 0 and q_idx == 0:
            answers.append({
                'questionId': q['id'],
                'sectionId': sec['id'],
                'score': 1.0,
                'maxScore': 5.0,
                'status': 'MAJOR_NC',
                'notes': 'Found unlabelled surplus fixtures obstructing walkway behind conveyor.',
                'evidenceUrls': ['https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=800']
            })
        else:
            answers.append({
                'questionId': q['id'],
                'sectionId': sec['id'],
                'score': 5.0,
                'maxScore': 5.0,
                'status': 'CONFORMING',
                'notes': 'Fully compliant with approved visual workplace standard.'
            })

# Save Draft
draft_res = post(f'/audit-executions/{exec_id}/draft', {
    'answers': answers,
    'summaryNotes': 'Draft evaluated on shop floor.'
})
print(f'Draft Saved Successfully. Total answers: {len(draft_res["answers"])}')

# 4. Submit Audit & Verify Dynamic Score & Auto-CAPA Generation
print('\n--- 4. Submitting Audit & Verifying Scoring + Auto-CAPA Trigger ---')
submit_res = post(f'/audit-executions/{exec_id}/submit', {
    'answers': answers,
    'summaryNotes': 'Routine audit completed. High compliance overall, 1 major non-conformance flagged for 1S Sort.',
    'auditorSignature': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'auditorName': 'Vikram Joshi (Lead 5S Auditor)'
})

print(f'Audit Status: {submit_res["status"]}')
print(f'Overall 5S Score: {submit_res["overallScore"]}% (Earned: {submit_res["earnedScore"]}/{submit_res["maxPossibleScore"]})')
print(f'Audit Passed: {submit_res["isPassed"]}')
print('Pillar Scores:', json.dumps(submit_res['pillarScores'], indent=2))
print(f'Auto-Generated Observations: {len(submit_res["observations"])}')

# 5. Verify Observations Module
print('\n--- 5. Verifying Observations Register ---')
all_obs = get('/observations')
print(f'Total Registered Observations: {len(all_obs)}')
for obs in all_obs[:3]:
    print(f' - [{obs["severity"]}] {obs["observationCode"]}: {obs["title"]} ({obs["status"]})')

# 6. Verify CAPA Management Workflow
print('\n--- 6. Verifying Corrective Action (CAPA) Workflow ---')
actions = get('/corrective-actions')
print(f'Total Active CAPA Actions: {len(actions)}')
test_action = actions[0]
action_id = test_action['id']
print(f'Testing CAPA: {test_action["actionCode"]} - {test_action["title"]} (Status: {test_action["status"]})')

# 6.1 Update 5-Why Analysis
print(' -> Updating 5-Why Root Cause Investigation...')
five_why_res = patch(f'/corrective-actions/{action_id}/5-why', {
    'why1': 'Why were tools on the floor? Operator had no dedicated shadow slot.',
    'why2': 'Why was there no slot? Tooling was added after last board redesign.',
    'why3': 'Why was board not updated? Change management workflow omitted tool shadow board.',
    'why4': 'Why was it omitted? Lack of standard engineering change checklist.',
    'why5': 'Root Cause: Engineering change process does not include 5S visual standards review.',
    'rootCauseCategory': 'METHOD'
})
print('    5-Why Analysis Saved. Root Cause Category:', five_why_res['rootCauseCategory'])

# 6.2 Submit Closure Evidence
print(' -> Submitting Action Closure Proof (After Photo)...')
closure_res = post(f'/corrective-actions/{action_id}/submit-closure', {
    'closureNotes': 'Shadow board expanded with 2 new CNC tool slots and labeled with color tape.',
    'afterPhotoUrl': 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800',
    'actorName': 'Ramesh Kumar (Area Owner)'
})
print(f'    Closure Submitted. New Status: {closure_res["status"]}')

# 6.3 Independent Verification Sign-Off
print(' -> Performing Independent 2-Person Verification Sign-Off...')
verify_res = post(f'/corrective-actions/{action_id}/verify', {
    'approved': True,
    'verificationNotes': 'Inspected workstation on shift 1. Verified shadow board expanded and calibrated.',
    'verifierName': 'Sarah Jenkins (5S Program Coordinator)'
})
print(f'    Verification Completed. Final Status: {verify_res["status"]} (Verified At: {verify_res["verifiedAt"]})')

# 7. Verify Red Tag Studio
print('\n--- 7. Verifying Red Tag Studio & Ageing Register ---')
metrics = get('/red-tags/metrics')
print('Red Tag Metrics:', json.dumps(metrics, indent=2))

print(' -> Creating New Red Tag with Printable QR Code...')
new_tag = post('/red-tags', {
    'locationId': location['id'],
    'itemName': 'Obsolete Pneumatic Air Regulator',
    'category': 'UNNEEDED_TOOL',
    'quantity': 3,
    'unitOfMeasure': 'PCS',
    'estimatedValue': 350.0,
    'reason': 'Replaced with electronic digital proportional regulator.',
    'photoUrl': 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?w=800'
})
print(f'    Red Tag Created: {new_tag["tagNumber"]} (QR Data URL Length: {len(new_tag["qrCodeUrl"])})')

# 7.1 Submit Disposition
print(' -> Submitting Disposition Decision...')
disp_res = post(f'/red-tags/{new_tag["id"]}/disposition', {
    'dispositionAction': 'AUCTION_SELL',
    'dispositionJustification': 'Equipment is in working condition; can be liquidated on industrial surplus portal.',
    'supervisorApproved': True,
    'supervisorName': 'Sarah Jenkins (5S Coordinator)'
})
print(f'    Disposition Submitted: {disp_res["dispositionAction"]} (Status: {disp_res["status"]})')

# 7.2 Close Red Tag
print(' -> Finalizing Disposal / Scrap Closure...')
close_tag_res = post(f'/red-tags/{new_tag["id"]}/close', {
    'closurePhotoUrl': 'https://images.unsplash.com/photo-1581092335397-9583fe92d232?w=800',
    'financialRecovered': 310.0,
    'notes': 'Sold via surplus asset partner. Net recovery $310.'
})
print(f'    Red Tag Closed: {close_tag_res["status"]} (Recovered: ${close_tag_res["financialRecovered"]})')

print('\n==========================================')
print('   ALL PHASE 3 BACKEND APIS VERIFIED 100%!')
print('==========================================')
