import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Location, OrgNode, User } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import {
  MapPin,
  Plus,
  Search,
  Filter,
  QrCode,
  ExternalLink,
  ShieldAlert,
  Calendar,
  Layers,
  Download,
  Printer,
  ChevronRight,
} from 'lucide-react';

export const LocationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTenant, addToast } = useApp();
  const [locations, setLocations] = useState<Location[]>([]);
  const [orgNodes, setOrgNodes] = useState<OrgNode[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedRisk, setSelectedRisk] = useState('');
  const [selectedFreq, setSelectedFreq] = useState('');

  // Drawers & Modals
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [qrModalLocation, setQrModalLocation] = useState<Location | null>(null);

  // Form State for new location
  const [areaCode, setAreaCode] = useState('');
  const [name, setName] = useState('');
  const [orgNodeId, setOrgNodeId] = useState('');
  const [locationType, setLocationType] = useState('PRODUCTION_LINE');
  const [riskLevel, setRiskLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [auditFrequency, setAuditFrequency] = useState<'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY'>('WEEKLY');
  const [building, setBuilding] = useState('Building A');
  const [floor, setFloor] = useState('Ground Floor');
  const [description, setDescription] = useState('');
  const [ownerId, setOwnerId] = useState('');

  const loadData = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [locsData, nodesData, usersData] = await Promise.all([
        api.getLocations({
          search: search || undefined,
          orgNodeId: selectedNodeId || undefined,
          locationType: selectedType || undefined,
          riskLevel: selectedRisk || undefined,
          auditFrequency: selectedFreq || undefined,
        }),
        api.getOrgNodes(),
        api.getUsers(),
      ]);
      setLocations(locsData);
      setOrgNodes(nodesData);
      setUsers(usersData);
      if (nodesData.length > 0 && !orgNodeId) {
        setOrgNodeId(nodesData[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentTenant, search, selectedNodeId, selectedType, selectedRisk, selectedFreq]);

  const fetchNextAreaCode = async (nodeId?: string) => {
    try {
      const code = await api.getNextLocationCode(nodeId || orgNodeId || undefined);
      if (code) {
        setAreaCode(code);
      }
    } catch (e) {
      // Fallback
    }
  };

  const handleOpenCreateDrawer = async () => {
    setCreateDrawerOpen(true);
    setName('');
    setDescription('');
    const targetNodeId = orgNodeId || (orgNodes.length > 0 ? orgNodes[0].id : '');
    if (targetNodeId) {
      setOrgNodeId(targetNodeId);
      await fetchNextAreaCode(targetNodeId);
    } else {
      await fetchNextAreaCode();
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !orgNodeId) return;
    try {
      const formattedAreaCode = areaCode ? areaCode.toUpperCase().trim() : undefined;
      const newLoc = await api.createLocation({
        areaCode: formattedAreaCode,
        name,
        orgNodeId,
        locationType,
        riskLevel,
        auditFrequency,
        building,
        floor,
        description,
        ownerId: ownerId || undefined,
      });

      addToast({
        type: 'success',
        title: 'Area Master Created',
        message: `Area '${newLoc.name}' (${newLoc.areaCode}) created with auto QR code and default 5S timeline.`,
      });

      setCreateDrawerOpen(false);
      setAreaCode('');
      setName('');
      setDescription('');
      await loadData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Creation Failed',
        message: err?.response?.data?.message || 'Could not create location.',
      });
    }
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'CRITICAL':
        return <Badge variant="danger">Critical Risk</Badge>;
      case 'HIGH':
        return <Badge variant="warning">High Risk</Badge>;
      case 'MEDIUM':
        return <Badge variant="info">Medium Risk</Badge>;
      default:
        return <Badge variant="success">Low Risk</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'RED_TAG_ZONE':
        return <Badge variant="danger">Red Tag Zone</Badge>;
      case 'LABORATORY':
        return <Badge variant="purple">Cleanroom / Lab</Badge>;
      case 'WAREHOUSE_BAY':
        return <Badge variant="info">Warehouse Bay</Badge>;
      default:
        return <Badge variant="neutral">Production Cell</Badge>;
    }
  };

  const highRiskCount = locations.filter((l) => l.riskLevel === 'HIGH' || l.riskLevel === 'CRITICAL').length;
  const weeklyCount = locations.filter((l) => l.auditFrequency === 'WEEKLY').length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title">Location & Area Master Directory</h1>
            <Badge variant="info" icon={<MapPin size={12} />}>Master Records</Badge>
          </div>
          <p className="page-subtitle">
            Centralized master record of all 5S auditable workstations, zones, automated QR codes, and 5S rollout timelines.
          </p>
        </div>
        <div className="page-header-actions">
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={handleOpenCreateDrawer}
          >
            Create New Area Master
          </Button>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-4 gap-4">
        <Card noPadding>
          <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>
              <MapPin size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Active Locations</div>
              <div className="metric-value" style={{ fontSize: '20px', fontWeight: 700 }}>{locations.length}</div>
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
              <ShieldAlert size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>High / Critical Risk</div>
              <div className="metric-value" style={{ fontSize: '20px', fontWeight: 700 }}>{highRiskCount}</div>
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
              <Calendar size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>Weekly Cadence</div>
              <div className="metric-value" style={{ fontSize: '20px', fontWeight: 700 }}>{weeklyCount}</div>
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', borderRadius: 'var(--radius-md)', background: 'var(--color-purple-bg)', color: 'var(--color-purple)' }}>
              <QrCode size={20} />
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase' }}>QR Ready</div>
              <div className="metric-value" style={{ fontSize: '20px', fontWeight: 700 }}>100%</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card noPadding>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
            <Search size={16} color="var(--text-tertiary)" />
            <input
              type="text"
              placeholder="Search by area code, name, building..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ padding: '6px 12px', fontSize: '13px' }}
            />
          </div>

          <select
            className="form-select"
            style={{ width: '220px', padding: '6px 10px', fontSize: '13px' }}
            value={selectedNodeId}
            onChange={(e) => setSelectedNodeId(e.target.value)}
          >
            <option value="">All Org Nodes / Tiers</option>
            {orgNodes.map((n) => {
              const prefix = n.nodeType ? `[${n.nodeType.replace(/_/g, ' ')}] ` : '';
              return (
                <option key={n.id} value={n.id}>
                  {prefix}{n.name} ({n.code})
                </option>
              );
            })}
          </select>

          <select
            className="form-select"
            style={{ width: '160px', padding: '6px 10px', fontSize: '13px' }}
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="PRODUCTION_LINE">Production Line</option>
            <option value="WAREHOUSE_BAY">Warehouse Bay</option>
            <option value="OFFICE_FLOOR">Office Floor</option>
            <option value="LABORATORY">Cleanroom / Lab</option>
            <option value="RED_TAG_ZONE">Red Tag Zone</option>
            <option value="WORKSHOP">Workshop</option>
          </select>

          <select
            className="form-select"
            style={{ width: '150px', padding: '6px 10px', fontSize: '13px' }}
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
          >
            <option value="">All Risk Levels</option>
            <option value="LOW">Low Risk</option>
            <option value="MEDIUM">Medium Risk</option>
            <option value="HIGH">High Risk</option>
            <option value="CRITICAL">Critical Risk</option>
          </select>

          <select
            className="form-select"
            style={{ width: '150px', padding: '6px 10px', fontSize: '13px' }}
            value={selectedFreq}
            onChange={(e) => setSelectedFreq(e.target.value)}
          >
            <option value="">All Frequencies</option>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="FORTNIGHTLY">Fortnightly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>
      </Card>

      {/* Locations Table */}
      <Card noPadding>
        <div className="enterprise-table-container">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Area Identifier</th>
                <th>Workstation Name & Facility</th>
                <th>Hierarchy Location</th>
                <th>Type</th>
                <th>Risk Rating</th>
                <th>Audit Cadence</th>
                <th>Assigned Owner</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {locations.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                    No locations match the active filter criteria.
                  </td>
                </tr>
              ) : (
                locations.map((loc) => (
                  <tr
                    key={loc.id}
                    onClick={() => navigate(`/locations/${loc.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <span className="code-tag" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', padding: '3px 8px', borderRadius: 'var(--radius-xs)', fontWeight: 700, fontSize: '12px' }}>
                        {loc.areaCode}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{loc.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {loc.building || 'Main Plant'} • {loc.floor || 'Ground'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          <Layers size={13} color="var(--color-primary)" />
                          <span>{loc.orgNode?.name || 'Root Hierarchy'}</span>
                        </div>
                        {loc.orgNode?.nodeType && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '10px', background: 'var(--bg-surface-subtle)', color: 'var(--text-secondary)', padding: '1px 6px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)', fontWeight: 600 }}>
                              {loc.orgNode.nodeType.replace(/_/g, ' ')}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                              #{loc.orgNode.code}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>{getTypeBadge(loc.locationType)}</td>
                    <td>{getRiskBadge(loc.riskLevel)}</td>
                    <td>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {loc.auditFrequency}
                      </span>
                    </td>
                    <td>
                      {loc.owner ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <div style={{ width: '22px', height: '22px', borderRadius: 'var(--radius-full)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-strong)', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                            {loc.owner.firstName[0]}
                          </div>
                          <span style={{ fontSize: '12px' }}>{loc.owner.firstName} {loc.owner.lastName}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>Unassigned</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'inline-flex', gap: '4px' }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="View QR Code"
                          onClick={() => setQrModalLocation(loc)}
                        >
                          <QrCode size={15} />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => navigate(`/locations/${loc.id}`)}
                        >
                          <ExternalLink size={13} /> Open Hub
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* New Location Modal */}
      <Modal
        isOpen={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        title="Create New 5S Area Master"
        subtitle="Registers an auditable physical workstation with auto QR generation"
        maxWidth="640px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateDrawerOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreateLocation}>Create Area Master</Button>
          </>
        }
      >
        <form onSubmit={handleCreateLocation} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">
              Area Identifier Code <span className="required">*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. LOC-BLR-ASM-02"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => fetchNextAreaCode(orgNodeId)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-xs)',
                  padding: '2px 8px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                }}
                title="Refresh auto-generated sequential area code"
              >
                Auto
              </button>
            </div>
            <span className="form-hint">Unique alphanumeric code printed on physical 5S QR tags.</span>
          </div>

          <div className="form-group">
            <label className="form-label">Workstation / Location Name <span className="required">*</span></label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Chassis Powertrain Cell 02"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Parent Department / Work Cell / Storage Rack <span className="required">*</span></label>
            <select
              className="form-select"
              value={orgNodeId}
              onChange={(e) => {
                const newOrgId = e.target.value;
                setOrgNodeId(newOrgId);
                fetchNextAreaCode(newOrgId);
              }}
              required
            >
              {orgNodes.map((n) => {
                const tier = n.nodeType ? `[${n.nodeType.replace(/_/g, ' ')}] ` : '';
                return (
                  <option key={n.id} value={n.id}>
                    {tier}{n.name} ({n.code})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">Area Classification</label>
              <select className="form-select" value={locationType} onChange={(e) => setLocationType(e.target.value)}>
                <option value="PRODUCTION_LINE">Production Line / Cell</option>
                <option value="WAREHOUSE_BAY">Warehouse Bay / Rack</option>
                <option value="OFFICE_FLOOR">Office / Admin Floor</option>
                <option value="LABORATORY">Cleanroom / Metrology</option>
                <option value="RED_TAG_ZONE">Red Tag Quarantine Zone</option>
                <option value="WORKSHOP">Maintenance Workshop</option>
                <option value="UTILITY">Utility / Power Station</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Risk Rating</label>
              <select className="form-select" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as any)}>
                <option value="LOW">Low Risk</option>
                <option value="MEDIUM">Medium Risk</option>
                <option value="HIGH">High Risk</option>
                <option value="CRITICAL">Critical Risk</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">Audit Frequency</label>
              <select className="form-select" value={auditFrequency} onChange={(e) => setAuditFrequency(e.target.value as any)}>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="FORTNIGHTLY">Fortnightly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Area Owner</label>
              <select className="form-select" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">-- Assign Owner --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.jobTitle || 'Lead'})</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label">Building / Bay</label>
              <input type="text" className="form-input" value={building} onChange={(e) => setBuilding(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Floor Level</label>
              <input type="text" className="form-input" value={floor} onChange={(e) => setFloor(e.target.value)} />
            </div>
          </div>



          <div className="form-group">
            <label className="form-label">Workstation Description & 5S Scope</label>
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Describe tool storage, shadow boards, floor markings, and safety boundaries..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </form>
      </Modal>

      {/* Quick QR Preview Modal */}
      {qrModalLocation && (
        <Modal
          isOpen={!!qrModalLocation}
          onClose={() => setQrModalLocation(null)}
          title={`5S Quick QR Tag: ${qrModalLocation.areaCode}`}
          subtitle={qrModalLocation.name}
          maxWidth="440px"
          footer={
            <>
              <Button variant="secondary" onClick={() => setQrModalLocation(null)}>Close</Button>
              <Button
                variant="primary"
                icon={<Printer size={16} />}
                onClick={() => window.print()}
              >
                Print Label
              </Button>
            </>
          }
        >
          <div style={{ textAlign: 'center', padding: '16px' }}>
            <div
              className="printable-station-tag"
              style={{
                border: '2px dashed var(--border-strong)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px',
                display: 'inline-block',
                background: '#FFFFFF',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#1E3A8A', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '4px' }}>
                {currentTenant?.name}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A', marginBottom: '12px' }}>
                {qrModalLocation.areaCode}
              </div>

              {/* QR Image */}
              <img
                src={qrModalLocation.qrPngDataUrl || `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=5s://${currentTenant?.slug}/locations/${qrModalLocation.areaCode}`}
                alt="5S Area QR"
                style={{ width: '200px', height: '200px', margin: '0 auto', display: 'block' }}
              />

              <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A', marginTop: '12px' }}>
                {qrModalLocation.name}
              </div>
              <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                {qrModalLocation.building} • {qrModalLocation.floor}
              </div>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '16px' }}>
              Deep Link Payload: <code>5s://{currentTenant?.slug}/locations/{qrModalLocation.areaCode}</code>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
