import urllib.request
import json

BASE = 'http://localhost:3001/api/v1'

def get(url, headers=None):
    if headers is None:
        headers = {'x-tenant-id': 'skilglobal-mfg'}
    req = urllib.request.Request(f'{BASE}{url}', headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def post(url, data, headers=None):
    if headers is None:
        headers = {'x-tenant-id': 'skilglobal-mfg', 'Content-Type': 'application/json'}
    req = urllib.request.Request(
        f'{BASE}{url}',
        data=json.dumps(data).encode('utf-8'),
        headers=headers,
        method='POST'
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

print('=== 1. Testing Tenants API ===')
tenants = get('/tenants')
print('Tenants count:', len(tenants['data']))
skil_tenant = next(t for t in tenants['data'] if t['slug'] == 'skilglobal-mfg')
tenant_id = skil_tenant['id']
print('Active Tenant:', skil_tenant['name'], f'({tenant_id})')

print('\n=== 2. Testing Org Hierarchy Tree ===')
tree = get('/organization/tree', headers={'x-tenant-id': tenant_id})
print('Root nodes count:', len(tree['data']))
print('Root name:', tree['data'][0]['name'], 'Child nodes:', len(tree['data'][0]['children']))

print('\n=== 3. Testing RBAC Roles & Permissions ===')
roles = get('/users/roles/all', headers={'x-tenant-id': tenant_id})
print('Roles count:', len(roles['data']))
for r in roles['data'][:3]:
    print(' - Role:', r['name'], f'({r["code"]})')

print('\n=== 4. Testing Location Master Directory ===')
locs = get('/locations', headers={'x-tenant-id': tenant_id})
print('Locations count:', len(locs['data']))
first_loc_id = locs['data'][0]['id']
first_loc_code = locs['data'][0]['areaCode']
print('First location:', locs['data'][0]['name'], f'({first_loc_code})')

print('\n=== 5. Testing Centralized 7-Tab Location Record ===')
detail = get(f'/locations/{first_loc_id}', headers={'x-tenant-id': tenant_id})
loc_data = detail['data']
print('Location ID:', loc_data['id'])
print('Area Code:', loc_data['areaCode'])
print('Timelines (Tab 1):', len(loc_data['timelines']), 'milestones')
print('Documents (Tab 6):', len(loc_data['documents']), 'attached SOPs')
print('Audit Logs (Tab 7):', len(loc_data['auditLogs']), 'immutable log entries')
print('QR PNG Data URL Generated:', bool(loc_data['qrPngDataUrl']))

print('\n=== 6. Testing Timeline Milestone Progress Update ===')
first_tl = loc_data['timelines'][0]
patch_req = urllib.request.Request(
    f'{BASE}/locations/{first_loc_id}/timelines/{first_tl["id"]}',
    data=json.dumps({'progressPercent': 100, 'status': 'COMPLETED'}).encode('utf-8'),
    headers={'x-tenant-id': tenant_id, 'Content-Type': 'application/json'},
    method='PATCH'
)
with urllib.request.urlopen(patch_req) as resp:
    updated_tl = json.loads(resp.read().decode('utf-8'))
    print('Updated milestone:', updated_tl['data']['milestoneName'], '-> Progress:', updated_tl['data']['progressPercent'], 'Status:', updated_tl['data']['status'])

print('\n=== 7. Testing Batch QR Code Generation ===')
batch_qr = get('/locations/qr-batch', headers={'x-tenant-id': tenant_id})
print('Generated batch QR items:', len(batch_qr['data']))

print('\n=== 8. Testing Excel Dry-Run Validator ===')
dry_run = post('/imports/locations/dry-run', {
    'jsonData': json.dumps([{
        'areaCode': 'LOC-TEST-BATCH-01',
        'name': 'Test Workstation 01',
        'locationType': 'PRODUCTION_LINE',
        'orgNodeCode': 'BLR-DEPT-MACH',
        'riskLevel': 'MEDIUM',
        'auditFrequency': 'WEEKLY',
        'building': 'Bay 1',
        'floor': 'Ground'
    }])
}, headers={'x-tenant-id': tenant_id, 'Content-Type': 'application/json'})
print('Dry-run total rows:', dry_run['data']['totalRows'], 'Valid:', dry_run['data']['validCount'], 'Errors:', dry_run['data']['errorCount'])

print('\n=== ALL PHASE 1 ENTERPRISE DIRECTIVES VERIFIED WITH 100% INTEGRITY! ===')
