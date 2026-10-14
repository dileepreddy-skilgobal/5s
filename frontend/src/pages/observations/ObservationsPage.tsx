import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { PhotoAnnotationModal } from '../../components/common/PhotoAnnotationModal';
import { Observation, Location, PhotoAnnotation } from '../../types';
import { FIVE_S_IMAGES } from '../../constants/images';
import {
  AlertTriangle,
  Sparkles,
  Plus,
  Filter,
  Search,
  Camera,
  MapPin,
  Calendar,
  User,
  ShieldAlert,
  Layers,
  ArrowUpRight,
  Eye,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

export const ObservationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { addToast } = useApp();

  const [loading, setLoading] = useState<boolean>(true);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);

  // Filters
  const [selectedPillar, setSelectedPillar] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Drawer: Create New Abnormality
  const [createDrawerOpen, setCreateDrawerOpen] = useState<boolean>(false);
  const [newObs, setNewObs] = useState({
    locationId: '',
    category: 'S1_SORT',
    severity: 'MODERATE',
    title: '',
    description: '',
    beforePhotoUrl: '',
    riskAssessment: '',
    tags: '',
  });

  // Photo Annotation Modal for new observation
  const [annotationModalOpen, setAnnotationModalOpen] = useState<boolean>(false);

  // Photo Zoom Modal
  const [zoomedPhotoUrl, setZoomedPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [obsRes, locRes] = await Promise.all([
        api.getObservations(),
        api.getLocations(),
      ]);
      setObservations(obsRes);
      setLocations(locRes);
      if (locRes.length > 0 && !newObs.locationId) {
        setNewObs((prev) => ({ ...prev, locationId: locRes[0].id }));
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error Loading Observations',
        message: err.message || 'Could not fetch observations.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateObservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newObs.title || !newObs.description || !newObs.locationId) {
      addToast({
        type: 'warning',
        title: 'Missing Required Fields',
        message: 'Please provide workstation, title, and description.',
      });
      return;
    }

    try {
      const tagsArray = newObs.tags
        ? newObs.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : [newObs.category, newObs.severity];

      const created = await api.createObservation({
        locationId: newObs.locationId,
        category: newObs.category,
        severity: newObs.severity,
        title: newObs.title,
        description: newObs.description,
        beforePhotoUrl: newObs.beforePhotoUrl || FIVE_S_IMAGES.defects.clutteredUnderBench,
        annotatedPhotoUrl: newObs.beforePhotoUrl || FIVE_S_IMAGES.defects.clutteredUnderBench,
        riskAssessment: newObs.riskAssessment,
        tags: tagsArray,
      });

      setObservations((prev) => [created, ...prev]);
      setCreateDrawerOpen(false);
      setNewObs({
        locationId: locations[0]?.id || '',
        category: 'S1_SORT',
        severity: 'MODERATE',
        title: '',
        description: '',
        beforePhotoUrl: '',
        riskAssessment: '',
        tags: '',
      });

      addToast({
        type: 'success',
        title: 'Observation Logged',
        message: `Registered ${created.observationCode}. Automatically queued for CAPA assignment.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error Logging Observation',
        message: err.message || 'Failed to save observation.',
      });
    }
  };

  // Filter logic
  const filteredObservations = observations.filter((obs) => {
    if (selectedPillar !== 'ALL' && obs.category !== selectedPillar) return false;
    if (selectedSeverity !== 'ALL' && obs.severity !== selectedSeverity) return false;
    if (selectedStatus !== 'ALL' && obs.status !== selectedStatus) return false;
    if (selectedLocationId !== 'ALL' && obs.locationId !== selectedLocationId) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchTitle = obs.title.toLowerCase().includes(q);
      const matchDesc = obs.description.toLowerCase().includes(q);
      const matchCode = obs.observationCode.toLowerCase().includes(q);
      const matchLoc = obs.location?.name.toLowerCase().includes(q) || false;
      if (!matchTitle && !matchDesc && !matchCode && !matchLoc) return false;
    }
    return true;
  });

  // KPI Calculations
  const totalObs = observations.length;
  const criticalCount = observations.filter((o) => o.severity === 'CRITICAL').length;
  const kaizenCount = observations.filter((o) => o.severity === 'KAIZEN_OPPORTUNITY').length;
  const openCount = observations.filter((o) => o.status !== 'CLOSED' && o.status !== 'RESOLVED').length;

  const pillarTabs = [
    { key: 'ALL', label: 'All 5S Pillars' },
    { key: 'S1_SORT', label: '1S - Sort' },
    { key: 'S2_SET_IN_ORDER', label: '2S - Set in Order' },
    { key: 'S3_SHINE', label: '3S - Shine' },
    { key: 'S4_STANDARDIZE', label: '4S - Standardize' },
    { key: 'S5_SUSTAIN', label: '5S - Sustain' },
    { key: 'S6_SAFETY', label: '6S - Safety' },
  ];

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case 'CRITICAL':
        return <Badge variant="danger">Critical (24h SLA)</Badge>;
      case 'MAJOR':
        return <Badge variant="warning">Major (3d SLA)</Badge>;
      case 'MODERATE':
        return <Badge variant="info">Moderate (7d SLA)</Badge>;
      case 'MINOR':
        return <Badge variant="neutral">Minor (15d SLA)</Badge>;
      case 'KAIZEN_OPPORTUNITY':
        return <Badge variant="purple" icon={<Sparkles size={11} />}>Kaizen Best Practice</Badge>;
      default:
        return <Badge variant="neutral">{sev}</Badge>;
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case 'OPEN':
        return <Badge variant="neutral">Open</Badge>;
      case 'ACTION_ASSIGNED':
        return <Badge variant="info">Action Assigned</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="warning">In Remediation</Badge>;
      case 'PENDING_VERIFICATION':
        return <Badge variant="purple">Pending Verification</Badge>;
      case 'CLOSED':
      case 'RESOLVED':
        return <Badge variant="success">Resolved & Verified</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Badge variant="info" icon={<AlertTriangle size={12} />}>
              Observation Register
            </Badge>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Non-Conformance & Abnormality Management
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            5S Observations & Shop-Floor Abnormalities
          </h1>
        </div>

        <div className="page-header-actions">
          <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => loadData()}>
            Refresh
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateDrawerOpen(true)}>
            Log Shop-Floor Abnormality
          </Button>
        </div>
      </div>

      {/* KPI Metric Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <Card noPadding>
          <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-primary-subtle)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AlertTriangle size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Observations</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)' }}>{totalObs}</div>
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldAlert size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Critical Severity</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#EF4444' }}>{criticalCount}</div>
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(245, 158, 11, 0.12)',
                color: '#F59E0B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Layers size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Pending Remediation</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#F59E0B' }}>{openCount}</div>
            </div>
          </div>
        </Card>

        <Card noPadding>
          <div style={{ padding: '18px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(168, 85, 247, 0.12)',
                color: '#A855F7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Sparkles size={22} />
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Kaizen Innovations</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: '#A855F7' }}>{kaizenCount}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* 5S Pillar Tabs */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {pillarTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setSelectedPillar(tab.key)}
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid',
              borderColor: selectedPillar === tab.key ? 'var(--color-primary)' : 'var(--border-subtle)',
              background: selectedPillar === tab.key ? 'var(--color-primary)' : 'var(--bg-surface)',
              color: selectedPillar === tab.key ? '#FFFFFF' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all var(--transition-fast)',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Controls Bar */}
      <Card noPadding>
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }}
            />
            <input
              type="text"
              placeholder="Search by code, title, description, or workstation..."
              className="form-control"
              style={{ paddingLeft: '36px' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Severity Filter */}
          <select
            className="form-control"
            style={{ width: '180px' }}
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical (24h SLA)</option>
            <option value="MAJOR">Major (3d SLA)</option>
            <option value="MODERATE">Moderate (7d SLA)</option>
            <option value="MINOR">Minor (15d SLA)</option>
            <option value="KAIZEN_OPPORTUNITY">Kaizen Practice</option>
          </select>

          {/* Status Filter */}
          <select
            className="form-control"
            style={{ width: '180px' }}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="ACTION_ASSIGNED">Action Assigned</option>
            <option value="IN_PROGRESS">In Remediation</option>
            <option value="PENDING_VERIFICATION">Pending Verification</option>
            <option value="CLOSED">Resolved & Verified</option>
          </select>

          {/* Location Filter */}
          <select
            className="form-control"
            style={{ width: '220px' }}
            value={selectedLocationId}
            onChange={(e) => setSelectedLocationId(e.target.value)}
          >
            <option value="ALL">All Workstations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.areaCode} — {l.name}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {/* Observations Grid */}
      {filteredObservations.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <AlertTriangle size={36} color="var(--text-tertiary)" style={{ marginBottom: '12px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0' }}>No Observations Found</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              No non-conformance records match your active search filters.
            </p>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '18px' }}>
          {filteredObservations.map((obs) => (
            <Card key={obs.id} noPadding>
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Photo Header */}
                <div style={{ position: 'relative' }}>
                  <ImageWithFallback
                    src={
                      obs.annotatedPhotoUrl ||
                      obs.beforePhotoUrl ||
                      (obs.category === 'S6_SAFETY'
                        ? FIVE_S_IMAGES.standards.fireSafetyBlocked
                        : obs.category === 'S3_SHINE'
                        ? FIVE_S_IMAGES.standards.oilLeakDefect
                        : obs.category === 'S2_SET_IN_ORDER'
                        ? FIVE_S_IMAGES.standards.shadowBoardClutter
                        : FIVE_S_IMAGES.defects.clutteredUnderBench)
                    }
                    category={obs.category}
                    height="185px"
                    allowZoom={true}
                    alt={obs.title}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      left: '10px',
                      display: 'flex',
                      gap: '6px',
                      zIndex: 2,
                      pointerEvents: 'none',
                    }}
                  >
                    {getSeverityBadge(obs.severity)}
                  </div>
                </div>

                {/* Body Content */}
                <div style={{ padding: '18px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-primary)' }}>
                      {obs.observationCode}
                    </span>
                    {getStatusBadge(obs.status)}
                  </div>

                  <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--text-primary)', lineHeight: '1.3' }}>
                    {obs.title}
                  </h3>

                  <p
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-secondary)',
                      margin: 0,
                      lineHeight: '1.4',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {obs.description}
                  </p>

                  <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                      <MapPin size={13} style={{ color: 'var(--color-primary)' }} />
                      <span>{obs.location?.name || 'Shop Floor Area'}</span>
                    </div>

                    {obs.correctiveAction && (
                      <div
                        onClick={() => navigate('/capa')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'var(--color-primary-subtle)',
                          color: 'var(--color-primary)',
                          cursor: 'pointer',
                          fontWeight: 600,
                          fontSize: '11px',
                          marginTop: '4px',
                        }}
                      >
                        <span>Linked CAPA: {obs.correctiveAction.actionCode}</span>
                        <ArrowUpRight size={14} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal: Create New Abnormality */}
      <Modal
        isOpen={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        title="Log Shop-Floor Abnormality / Observation"
        subtitle="Capture workstation defects, safety hazards, and kaizen opportunities"
        maxWidth="640px"
      >
        <form onSubmit={handleCreateObservation} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Target Workstation / Area *</label>
            <select
              className="form-control"
              value={newObs.locationId}
              onChange={(e) => setNewObs({ ...newObs, locationId: e.target.value })}
              required
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.areaCode} — {l.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">5S Pillar Category *</label>
              <select
                className="form-control"
                value={newObs.category}
                onChange={(e) => setNewObs({ ...newObs, category: e.target.value })}
              >
                <option value="S1_SORT">1S - Sort</option>
                <option value="S2_SET_IN_ORDER">2S - Set in Order</option>
                <option value="S3_SHINE">3S - Shine</option>
                <option value="S4_STANDARDIZE">4S - Standardize</option>
                <option value="S5_SUSTAIN">5S - Sustain</option>
                <option value="S6_SAFETY">6S - Safety</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Severity & SLA *</label>
              <select
                className="form-control"
                value={newObs.severity}
                onChange={(e) => setNewObs({ ...newObs, severity: e.target.value })}
              >
                <option value="CRITICAL">Critical (24 Hours SLA)</option>
                <option value="MAJOR">Major (3 Days SLA)</option>
                <option value="MODERATE">Moderate (7 Days SLA)</option>
                <option value="MINOR">Minor (15 Days SLA)</option>
                <option value="KAIZEN_OPPORTUNITY">Kaizen Innovation</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Observation Title *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Broken Tool Fixture Left Near Assembly Conveyor"
              value={newObs.title}
              onChange={(e) => setNewObs({ ...newObs, title: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Detailed Description *</label>
            <textarea
              rows={3}
              className="form-control"
              placeholder="Describe what was observed, condition of equipment, exact location coordinates..."
              value={newObs.description}
              onChange={(e) => setNewObs({ ...newObs, description: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Risk & Safety Assessment</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. High slip and tripping hazard for shift operators"
              value={newObs.riskAssessment}
              onChange={(e) => setNewObs({ ...newObs, riskAssessment: e.target.value })}
            />
          </div>

          {/* Photo Evidence Section */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <label className="form-label" style={{ margin: 0 }}>
                Photo Evidence & Callouts
              </label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Camera size={14} />}
                onClick={() => setAnnotationModalOpen(true)}
              >
                Open Annotation Canvas
              </Button>
            </div>

            {newObs.beforePhotoUrl ? (
              <div style={{ position: 'relative', width: '100%', height: '160px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                <ImageWithFallback src={newObs.beforePhotoUrl} category={newObs.category} height="160px" alt="Preview" />
              </div>
            ) : (
              <div
                onClick={() => setAnnotationModalOpen(true)}
                style={{
                  padding: '24px',
                  borderRadius: 'var(--radius-md)',
                  border: '2px dashed var(--border-subtle)',
                  background: 'var(--bg-surface-subtle)',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                <Camera size={24} color="var(--text-tertiary)" style={{ marginBottom: '6px' }} />
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  Click to capture photo & annotate defect markers
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <Button type="button" variant="secondary" onClick={() => setCreateDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={<Plus size={16} />}>
              Save & Queue CAPA
            </Button>
          </div>
        </form>
      </Modal>

      {/* Photo Annotation Modal */}
      <PhotoAnnotationModal
        isOpen={annotationModalOpen}
        onClose={() => setAnnotationModalOpen(false)}
        initialPhotoUrl={FIVE_S_IMAGES.defects.clutteredUnderBench}
        onSave={(dataUrl) => {
          setNewObs((prev) => ({ ...prev, beforePhotoUrl: dataUrl }));
        }}
      />

      {/* Zoom Photo Modal */}
      {zoomedPhotoUrl && (
        <Modal isOpen={Boolean(zoomedPhotoUrl)} onClose={() => setZoomedPhotoUrl(null)} title="Photo Evidence Details" maxWidth="800px">
          <div style={{ width: '100%', maxHeight: '550px', overflow: 'hidden', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'center' }}>
            <img src={zoomedPhotoUrl} alt="Zoomed" style={{ maxWidth: '100%', maxHeight: '550px', objectFit: 'contain' }} />
          </div>
        </Modal>
      )}
    </div>
  );
};
