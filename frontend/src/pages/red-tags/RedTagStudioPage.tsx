import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../services/api';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { FIVE_S_IMAGES } from '../../constants/images';
import { RedTag, RedTagMetrics, Location, ZoneRedTagMetrics } from '../../types';
import {
  Tag,
  AlertTriangle,
  Clock,
  IndianRupee,
  Plus,
  Printer,
  Search,
  Filter,
  RefreshCw,
  QrCode,
  MapPin,
  CheckCircle2,
  Trash2,
  Send,
  AlertOctagon,
  ArrowRight,
  ShieldAlert,
  Building2,
  Layers,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  Coins,
  PackageCheck,
  RotateCcw,
  Sparkles,
} from 'lucide-react';

interface ZoneGroupData {
  locationId: string;
  locationName: string;
  areaCode: string;
  building?: string | null;
  floor?: string | null;
  totalTags: number;
  activeTags: number;
  inHolding: number;
  pendingDisposition: number;
  disposed: number;
  overdueCount: number;
  totalEstimatedValue: number;
  totalRecoveredValue: number;
  items: RedTag[];
}

export const RedTagStudioPage: React.FC = () => {
  const { addToast } = useApp();

  const [loading, setLoading] = useState<boolean>(true);
  const [redTags, setRedTags] = useState<RedTag[]>([]);
  const [metrics, setMetrics] = useState<RedTagMetrics | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);

  // View & Filter states
  const [selectedZoneId, setSelectedZoneId] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'ZONE_GROUPED' | 'MASTER_TABLE'>('ZONE_GROUPED');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedAgeingTier, setSelectedAgeingTier] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [collapsedZones, setCollapsedZones] = useState<Record<string, boolean>>({});

  // Create Red Tag Drawer
  const [createDrawerOpen, setCreateDrawerOpen] = useState<boolean>(false);
  const [newTag, setNewTag] = useState({
    locationId: '',
    targetHoldingAreaId: '',
    itemName: '',
    itemDescription: '',
    category: 'UNNEEDED_TOOL',
    quantity: 1,
    unitOfMeasure: 'PCS',
    estimatedValue: 0,
    reason: '',
    photoUrl: FIVE_S_IMAGES.redTags.quarantineArea,
  });

  // Disposition Modal
  const [selectedTagForDisp, setSelectedTagForDisp] = useState<RedTag | null>(null);
  const [dispAction, setDispAction] = useState<string>('DISPOSE_SCRAP');
  const [dispJustification, setDispJustification] = useState<string>('');
  const [supervisorApproved, setSupervisorApproved] = useState<boolean>(true);

  // Close / Scrap Modal
  const [selectedTagForClose, setSelectedTagForClose] = useState<RedTag | null>(null);
  const [financialRecovered, setFinancialRecovered] = useState<number>(0);

  // Printable Tag Modal
  const [printTagModalItem, setPrintTagModalItem] = useState<RedTag | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tagsRes, metricsRes, locsRes] = await Promise.all([
        api.getRedTags(),
        api.getRedTagMetrics(),
        api.getLocations(),
      ]);

      setRedTags(tagsRes);
      setMetrics(metricsRes);
      setLocations(locsRes);

      if (locsRes.length > 0 && !newTag.locationId) {
        setNewTag((prev) => ({
          ...prev,
          locationId: locsRes[0].id,
          targetHoldingAreaId: locsRes[1]?.id || locsRes[0].id,
        }));
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Error Loading Red Tags',
        message: err.message || 'Could not fetch red tag register.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRedTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTag.itemName || !newTag.reason || !newTag.locationId) {
      addToast({
        type: 'warning',
        title: 'Missing Fields',
        message: 'Please provide item name, reason, and source location.',
      });
      return;
    }

    try {
      const created = await api.createRedTag(newTag);
      setRedTags((prev) => [created, ...prev]);
      setCreateDrawerOpen(false);
      setNewTag({
        locationId: locations[0]?.id || '',
        targetHoldingAreaId: locations[1]?.id || locations[0]?.id || '',
        itemName: '',
        itemDescription: '',
        category: 'UNNEEDED_TOOL',
        quantity: 1,
        unitOfMeasure: 'PCS',
        estimatedValue: 0,
        reason: '',
        photoUrl: FIVE_S_IMAGES.redTags.quarantineArea,
      });

      addToast({
        type: 'success',
        title: 'Red Tag Registered',
        message: `Generated physical tag ${created.tagNumber} with unique QR deep-link.`,
      });

      const m = await api.getRedTagMetrics();
      setMetrics(m);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Creation Failed',
        message: err.message || 'Could not create Red Tag.',
      });
    }
  };

  const handleSubmitDisposition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTagForDisp || !dispJustification) {
      addToast({
        type: 'warning',
        title: 'Missing Justification',
        message: 'Please specify the rationale for this disposition decision.',
      });
      return;
    }

    try {
      const updated = await api.submitRedTagDisposition(selectedTagForDisp.id, {
        dispositionAction: dispAction,
        dispositionJustification: dispJustification,
        supervisorApproved,
        supervisorName: 'Priya Sharma (5S Lead)',
      });

      setRedTags((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelectedTagForDisp(null);
      addToast({
        type: 'success',
        title: 'Disposition Action Approved',
        message: `${updated.tagNumber} marked for ${updated.dispositionAction}.`,
      });

      const m = await api.getRedTagMetrics();
      setMetrics(m);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Disposition Failed',
        message: err.message || 'Could not save disposition.',
      });
    }
  };

  const handleCloseRedTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTagForClose) return;

    try {
      const updated = await api.closeRedTag(selectedTagForClose.id, {
        financialRecovered: Number(financialRecovered),
        closurePhotoUrl: FIVE_S_IMAGES.redTags.disposedClean,
        notes: `Physical disposal finalized. Recovered ₹${financialRecovered}.`,
      });

      setRedTags((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setSelectedTagForClose(null);
      addToast({
        type: 'success',
        title: 'Red Tag Closed & Disposed',
        message: `${updated.tagNumber} permanently retired. Financial recovery of ₹${financialRecovered} recorded.`,
      });

      const m = await api.getRedTagMetrics();
      setMetrics(m);
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Closure Failed',
        message: err.message || 'Could not close Red Tag.',
      });
    }
  };

  const toggleZoneCollapse = (zoneId: string) => {
    setCollapsedZones((prev) => ({
      ...prev,
      [zoneId]: !prev[zoneId],
    }));
  };

  const openRegisterForZone = (locId: string) => {
    setNewTag((prev) => ({
      ...prev,
      locationId: locId,
      targetHoldingAreaId: locations.find((l) => l.locationType === 'RED_TAG_ZONE')?.id || locations[0]?.id || '',
    }));
    setCreateDrawerOpen(true);
  };

  // Filter individual tags
  const filteredTags = useMemo(() => {
    return redTags.filter((t) => {
      if (selectedZoneId !== 'ALL' && t.locationId !== selectedZoneId) return false;
      if (selectedCategory !== 'ALL' && t.category !== selectedCategory) return false;
      if (selectedStatus !== 'ALL' && t.status !== selectedStatus) return false;
      if (selectedAgeingTier !== 'ALL' && t.ageingTier !== selectedAgeingTier) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchNum = t.tagNumber.toLowerCase().includes(q);
        const matchItem = t.itemName.toLowerCase().includes(q);
        const matchReason = t.reason.toLowerCase().includes(q);
        const matchLoc = (t.location?.name || '').toLowerCase().includes(q) || (t.location?.areaCode || '').toLowerCase().includes(q);
        if (!matchNum && !matchItem && !matchReason && !matchLoc) return false;
      }
      return true;
    });
  }, [redTags, selectedZoneId, selectedCategory, selectedStatus, selectedAgeingTier, searchQuery]);

  // Group tags zone-wise
  const zoneGroups = useMemo<ZoneGroupData[]>(() => {
    const locMap = new Map<string, ZoneGroupData>();

    // Initialize all known locations
    locations.forEach((loc) => {
      locMap.set(loc.id, {
        locationId: loc.id,
        locationName: loc.name,
        areaCode: loc.areaCode,
        building: loc.building,
        floor: loc.floor,
        totalTags: 0,
        activeTags: 0,
        inHolding: 0,
        pendingDisposition: 0,
        disposed: 0,
        overdueCount: 0,
        totalEstimatedValue: 0,
        totalRecoveredValue: 0,
        items: [],
      });
    });

    // Populate tags
    redTags.forEach((t) => {
      const locId = t.locationId || 'unknown';
      if (!locMap.has(locId)) {
        locMap.set(locId, {
          locationId: locId,
          locationName: t.location?.name || 'Unassigned Zone',
          areaCode: t.location?.areaCode || 'ZONE-UNKN',
          building: t.location?.building || 'Plant Alpha',
          floor: '',
          totalTags: 0,
          activeTags: 0,
          inHolding: 0,
          pendingDisposition: 0,
          disposed: 0,
          overdueCount: 0,
          totalEstimatedValue: 0,
          totalRecoveredValue: 0,
          items: [],
        });
      }

      const group = locMap.get(locId)!;
      group.totalTags++;
      if (t.status !== 'DISPOSED') group.activeTags++;
      if (t.status === 'IN_HOLDING_AREA' || t.status === 'RED_TAGGED') group.inHolding++;
      if (t.status === 'PENDING_DISPOSITION' || t.status === 'DISPOSITION_APPROVED') group.pendingDisposition++;
      if (t.status === 'DISPOSED') group.disposed++;
      if (t.ageingDays > 30 && t.status !== 'DISPOSED') group.overdueCount++;
      group.totalEstimatedValue += t.estimatedValue || 0;
      group.totalRecoveredValue += t.financialRecovered || 0;
      group.items.push(t);
    });

    const list = Array.from(locMap.values());
    // Filter zones if a specific zone is selected
    if (selectedZoneId !== 'ALL') {
      return list.filter((z) => z.locationId === selectedZoneId);
    }
    // Filter to zones that have tags, or show all
    return list.filter((z) => z.totalTags > 0 || selectedZoneId === z.locationId);
  }, [redTags, locations, selectedZoneId]);

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'UNNEEDED_TOOL':
        return 'Unneeded Tool';
      case 'SURPLUS_INVENTORY':
        return 'Surplus Inventory';
      case 'BROKEN_EQUIPMENT':
        return 'Broken Equipment';
      case 'SCRAP_WASTE':
        return 'Scrap & Waste';
      case 'UNLABELLED_MATERIAL':
        return 'Unlabelled Material';
      case 'EXPIRED_ITEM':
        return 'Expired Material';
      default:
        return cat.replace('_', ' ');
    }
  };

  const getAgeingBadge = (days: number, status: string) => {
    if (status === 'DISPOSED') {
      return <Badge variant="neutral">Disposed ({days}d total)</Badge>;
    }
    if (days >= 31) {
      return (
        <Badge variant="danger" icon={<AlertOctagon size={11} />}>
          {days} Days (Critical Alert)
        </Badge>
      );
    }
    if (days >= 15) {
      return (
        <Badge variant="warning" icon={<Clock size={11} />}>
          {days} Days (Warning)
        </Badge>
      );
    }
    return (
      <Badge variant="info" icon={<Clock size={11} />}>
        {days} Days Old
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'RED_TAGGED':
        return <Badge variant="danger">1S Tagged</Badge>;
      case 'IN_HOLDING_AREA':
        return <Badge variant="warning">In Quarantine Bay</Badge>;
      case 'PENDING_DISPOSITION':
        return <Badge variant="purple">Pending Review</Badge>;
      case 'DISPOSITION_APPROVED':
        return <Badge variant="info">Action Approved</Badge>;
      case 'DISPOSED':
        return <Badge variant="success">Closed / Disposed</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Top Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Badge variant="danger" icon={<Tag size={12} />}>
              1S Sort Hub
            </Badge>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Zone-Wise Valuation & Physical Red Tag Management Studio
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            Red Tag Register & Zone Valuation
          </h1>
        </div>

        <div className="page-header-actions">
          {/* View Mode Toggle */}
          <div style={{ display: 'flex', background: 'var(--bg-surface-subtle)', padding: '3px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setViewMode('ZONE_GROUPED')}
              style={{
                border: 'none',
                background: viewMode === 'ZONE_GROUPED' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'ZONE_GROUPED' ? '#FFFFFF' : 'var(--text-secondary)',
                padding: '5px 12px',
                borderRadius: '4px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Layers size={14} /> Zone-Wise View
            </button>
            <button
              onClick={() => setViewMode('MASTER_TABLE')}
              style={{
                border: 'none',
                background: viewMode === 'MASTER_TABLE' ? 'var(--color-primary)' : 'transparent',
                color: viewMode === 'MASTER_TABLE' ? '#FFFFFF' : 'var(--text-secondary)',
                padding: '5px 12px',
                borderRadius: '4px',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <List size={14} /> Master Table
            </button>
          </div>

          <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => loadData()}>
            Refresh
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreateDrawerOpen(true)}>
            Register Red Tag
          </Button>
        </div>
      </div>

      {/* Plant-Wide Financial & Ageing KPI Summary Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
        {/* Card 1: Active Zones */}
        <Card noPadding>
          <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary-subtle)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building2 size={22} />
            </div>
            <div>
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>Active Zones with Tags</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {zoneGroups.filter((z) => z.totalTags > 0).length} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>/ {locations.length} Zones</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Card 2: Total Trapped Value */}
        <Card noPadding>
          <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <IndianRupee size={22} />
            </div>
            <div>
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Quarantined Value</div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#EF4444' }}>
                ₹{(metrics?.totalValue || 0).toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </Card>

        {/* Card 3: Recovered Scrap Value */}
        <Card noPadding>
          <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={22} />
            </div>
            <div>
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>Recovered Scrap Value</div>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#10B981' }}>
                ₹{(metrics?.recoveredValue || 0).toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </Card>

        {/* Card 4: Critical Overdue >30d */}
        <Card noPadding>
          <div style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: 'var(--radius-md)', background: 'rgba(245, 158, 11, 0.12)', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldAlert size={22} />
            </div>
            <div>
              <div style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>Ageing &gt; 30 Days</div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: (metrics?.overdueCount || 0) > 0 ? '#EF4444' : 'var(--text-primary)' }}>
                {metrics?.overdueCount || 0} <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)' }}>Items</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ZONE SELECTOR CAROUSEL / CARDS GRID */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            SELECT ZONE / WORKSTATION
          </span>
          {selectedZoneId !== 'ALL' && (
            <button
              onClick={() => setSelectedZoneId('ALL')}
              style={{ border: 'none', background: 'transparent', color: 'var(--color-primary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
            >
              Reset to All Zones
            </button>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '12px',
          }}
        >
          {/* "All Zones" Card */}
          <div
            onClick={() => setSelectedZoneId('ALL')}
            className="card"
            style={{
              padding: '14px 16px',
              cursor: 'pointer',
              border: selectedZoneId === 'ALL' ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
              background: selectedZoneId === 'ALL' ? 'var(--color-primary-subtle)' : 'var(--bg-surface)',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>All Plant Zones</span>
              <Badge variant="info">{redTags.length} Tags</Badge>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Combined Valuation</span>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#EF4444' }}>
                ₹{(metrics?.totalValue || 0).toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          {/* Individual Zone Cards */}
          {zoneGroups.map((zg) => {
            const isSelected = selectedZoneId === zg.locationId;
            return (
              <div
                key={zg.locationId}
                onClick={() => setSelectedZoneId(isSelected ? 'ALL' : zg.locationId)}
                className="card"
                style={{
                  padding: '14px 16px',
                  cursor: 'pointer',
                  border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                  background: isSelected ? 'var(--color-primary-subtle)' : 'var(--bg-surface)',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                    <span className="code-tag" style={{ fontSize: '10px' }}>{zg.areaCode}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {zg.overdueCount > 0 && (
                        <Badge variant="danger" icon={<AlertOctagon size={10} />}>{zg.overdueCount} Alert</Badge>
                      )}
                      <Badge variant={zg.totalTags > 0 ? 'info' : 'neutral'}>{zg.totalTags} Items</Badge>
                    </div>
                  </div>
                  <h4 style={{ fontSize: '13.5px', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {zg.locationName}
                  </h4>
                </div>

                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Zone Value:</span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: zg.totalEstimatedValue > 0 ? 'var(--color-primary)' : 'var(--text-tertiary)' }}>
                    ₹{zg.totalEstimatedValue.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <Card noPadding>
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Search by tag #, item name, zone or reason..."
              className="form-control"
              style={{ paddingLeft: '36px' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Category Filter */}
          <select
            className="form-control"
            style={{ width: '180px' }}
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="ALL">All Categories</option>
            <option value="UNNEEDED_TOOL">Unneeded Tools</option>
            <option value="SURPLUS_INVENTORY">Surplus Inventory</option>
            <option value="BROKEN_EQUIPMENT">Broken Equipment</option>
            <option value="SCRAP_WASTE">Scrap & Waste</option>
            <option value="UNLABELLED_MATERIAL">Unlabelled Material</option>
          </select>

          {/* Status Filter */}
          <select
            className="form-control"
            style={{ width: '170px' }}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="RED_TAGGED">1S Tagged</option>
            <option value="IN_HOLDING_AREA">In Quarantine Bay</option>
            <option value="PENDING_DISPOSITION">Pending Review</option>
            <option value="DISPOSITION_APPROVED">Action Approved</option>
            <option value="DISPOSED">Closed / Disposed</option>
          </select>

          {/* Ageing Tier */}
          <select
            className="form-control"
            style={{ width: '160px' }}
            value={selectedAgeingTier}
            onChange={(e) => setSelectedAgeingTier(e.target.value)}
          >
            <option value="ALL">All Ageing Tiers</option>
            <option value="0_7_DAYS">0–7 Days (New)</option>
            <option value="8_14_DAYS">8–14 Days (Review)</option>
            <option value="15_30_DAYS">15–30 Days (Warning)</option>
            <option value="OVER_30_DAYS">&gt; 30 Days (Critical)</option>
          </select>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* VIEW MODE 1: ZONE-WISE GROUPED VIEW */}
      {/* ========================================================================= */}
      {viewMode === 'ZONE_GROUPED' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {zoneGroups.length === 0 ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Tag size={36} color="var(--text-tertiary)" style={{ marginBottom: '12px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0' }}>No Zones Match Filter</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                  Try resetting the zone selection or search filters.
                </p>
              </div>
            </Card>
          ) : (
            zoneGroups.map((zone) => {
              const zoneFilteredItems = zone.items.filter((item) => {
                if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
                if (selectedStatus !== 'ALL' && item.status !== selectedStatus) return false;
                if (selectedAgeingTier !== 'ALL' && item.ageingTier !== selectedAgeingTier) return false;
                if (searchQuery) {
                  const q = searchQuery.toLowerCase();
                  const matchNum = item.tagNumber.toLowerCase().includes(q);
                  const matchItem = item.itemName.toLowerCase().includes(q);
                  const matchReason = item.reason.toLowerCase().includes(q);
                  if (!matchNum && !matchItem && !matchReason) return false;
                }
                return true;
              });

              const isCollapsed = collapsedZones[zone.locationId];

              return (
                <div key={zone.locationId} className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                  {/* ZONE HEADER BANNER */}
                  <div
                    style={{
                      padding: '16px 20px',
                      background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.04) 0%, rgba(15, 23, 42, 0.03) 100%)',
                      borderBottom: isCollapsed ? 'none' : '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '14px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button
                        onClick={() => toggleZoneCollapse(zone.locationId)}
                        style={{
                          border: 'none',
                          background: 'var(--bg-surface)',
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        }}
                      >
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                      </button>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="code-tag" style={{ fontWeight: 700 }}>{zone.areaCode}</span>
                          <span style={{ fontSize: '11.5px', color: 'var(--text-tertiary)' }}>
                            {zone.building || 'Plant Building A'} {zone.floor ? `• ${zone.floor}` : ''}
                          </span>
                        </div>
                        <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: '3px 0 0 0' }}>
                          {zone.locationName}
                        </h3>
                      </div>
                    </div>

                    {/* Zone Financial Metrics Pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                      <div
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Zone Value:</span>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#EF4444' }}>
                          ₹{zone.totalEstimatedValue.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {zone.totalRecoveredValue > 0 && (
                        <div
                          style={{
                            background: '#FFFFFF',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            padding: '6px 12px',
                            borderRadius: 'var(--radius-md)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Recovered:</span>
                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#10B981' }}>
                            ₹{zone.totalRecoveredValue.toLocaleString('en-IN')}
                          </span>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <Badge variant="info">{zone.items.length} Total Items</Badge>
                        {zone.overdueCount > 0 && (
                          <Badge variant="danger" icon={<AlertOctagon size={11} />}>
                            {zone.overdueCount} &gt;30d
                          </Badge>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus size={13} />}
                        onClick={() => openRegisterForZone(zone.locationId)}
                      >
                        Add Tag in Zone
                      </Button>
                    </div>
                  </div>

                  {/* ZONE ITEMS SECTION */}
                  {!isCollapsed && (
                    <div style={{ padding: '20px' }}>
                      {zoneFilteredItems.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                          No red tags matching current filters in {zone.locationName}.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
                          {zoneFilteredItems.map((tag) => (
                            <div
                              key={tag.id}
                              className="card"
                              style={{
                                padding: 0,
                                overflow: 'hidden',
                                border: '1px solid var(--border-subtle)',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                height: '100%',
                              }}
                            >
                              {/* Photo Header */}
                              <div style={{ position: 'relative' }}>
                                <ImageWithFallback
                                  src={tag.photoUrl || (tag.category === 'BROKEN_EQUIPMENT' || tag.category === 'SCRAP_WASTE' ? FIVE_S_IMAGES.redTags.obsoleteMotor : FIVE_S_IMAGES.redTags.quarantineArea)}
                                  category="S1_SORT"
                                  height="150px"
                                  allowZoom={true}
                                  alt={tag.itemName}
                                />
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: '10px',
                                    left: '10px',
                                    background: 'rgba(239, 68, 68, 0.9)',
                                    backdropFilter: 'blur(4px)',
                                    color: '#FFFFFF',
                                    padding: '3px 8px',
                                    borderRadius: 'var(--radius-xs)',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    letterSpacing: '0.04em',
                                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                                  }}
                                >
                                  {tag.tagNumber}
                                </div>
                                <div
                                  style={{
                                    position: 'absolute',
                                    top: '10px',
                                    right: '10px',
                                    zIndex: 2,
                                  }}
                                >
                                  {getAgeingBadge(tag.ageingDays, tag.status)}
                                </div>
                              </div>

                              {/* Card Body */}
                              <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                  <h4 style={{ fontSize: '14.5px', fontWeight: 700, margin: 0, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                                    {tag.itemName}
                                  </h4>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--color-primary)' }}>
                                      ₹{(tag.estimatedValue || 0).toLocaleString('en-IN')}
                                    </div>
                                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Item Value</div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                  <Badge variant="neutral">{getCategoryLabel(tag.category)}</Badge>
                                  <Badge variant="info">{tag.quantity} {tag.unitOfMeasure}</Badge>
                                  {getStatusBadge(tag.status)}
                                </div>

                                {tag.itemDescription && (
                                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                                    {tag.itemDescription}
                                  </p>
                                )}

                                <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                                  <strong>Tag Reason:</strong> {tag.reason}
                                </p>

                                {tag.dispositionAction && (
                                  <div style={{ padding: '8px 10px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', fontSize: '11.5px' }}>
                                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Action Plan: </span>
                                    <span style={{ color: 'var(--color-purple)' }}>{tag.dispositionAction.replace(/_/g, ' ')}</span>
                                    {tag.dispositionJustification && (
                                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        "{tag.dispositionJustification}"
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Holding Bay:</span>
                                    <strong>{tag.holdingArea?.name || 'Central Quarantine Bay'}</strong>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Tagged Date:</span>
                                    <strong>{new Date(tag.taggedDate).toLocaleDateString()}</strong>
                                  </div>
                                  {tag.financialRecovered ? (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10B981', fontWeight: 700 }}>
                                      <span>Recovered:</span>
                                      <span>₹{tag.financialRecovered.toLocaleString('en-IN')}</span>
                                    </div>
                                  ) : null}
                                </div>

                                {/* Actions */}
                                <div style={{ display: 'flex', gap: '8px', paddingTop: '8px', flexWrap: 'wrap' }}>
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    icon={<Printer size={13} />}
                                    onClick={() => setPrintTagModalItem(tag)}
                                  >
                                    Print Tag
                                  </Button>

                                  {tag.status !== 'DISPOSED' && (
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedTagForDisp(tag);
                                        setDispAction(tag.dispositionAction || 'DISPOSE_SCRAP');
                                        setDispJustification(tag.dispositionJustification || '');
                                      }}
                                    >
                                      Disposition
                                    </Button>
                                  )}

                                  {tag.status === 'DISPOSITION_APPROVED' && (
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      icon={<CheckCircle2 size={13} />}
                                      onClick={() => {
                                        setSelectedTagForClose(tag);
                                        setFinancialRecovered(tag.financialRecovered || 0);
                                      }}
                                    >
                                      Close & Recover
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW MODE 2: MASTER TABLE */}
      {/* ========================================================================= */}
      {viewMode === 'MASTER_TABLE' && (
        <Card noPadding>
          <div className="enterprise-table-container">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Tag #</th>
                  <th>Zone / Workstation</th>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Qty</th>
                  <th>Estimated Value</th>
                  <th>Ageing SLA</th>
                  <th>Status</th>
                  <th>Holding Area</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTags.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      No red tags found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredTags.map((tag) => (
                    <tr key={tag.id}>
                      <td>
                        <span style={{ fontWeight: 800, color: '#EF4444', fontSize: '12.5px' }}>
                          {tag.tagNumber}
                        </span>
                      </td>
                      <td>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>
                            {tag.location?.name || 'Unknown Zone'}
                          </div>
                          <span className="code-tag" style={{ fontSize: '10px' }}>{tag.location?.areaCode}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>
                          {tag.itemName}
                        </span>
                      </td>
                      <td>
                        <Badge variant="neutral">{getCategoryLabel(tag.category)}</Badge>
                      </td>
                      <td>
                        <span style={{ fontSize: '12px' }}>{tag.quantity} {tag.unitOfMeasure}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: '13px' }}>
                          ₹{(tag.estimatedValue || 0).toLocaleString('en-IN')}
                        </span>
                      </td>
                      <td>
                        {getAgeingBadge(tag.ageingDays, tag.status)}
                      </td>
                      <td>
                        {getStatusBadge(tag.status)}
                      </td>
                      <td>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {tag.holdingArea?.name || '—'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={<Printer size={12} />}
                            onClick={() => setPrintTagModalItem(tag)}
                          >
                            Print
                          </Button>
                          {tag.status !== 'DISPOSED' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setSelectedTagForDisp(tag);
                                setDispAction(tag.dispositionAction || 'DISPOSE_SCRAP');
                                setDispJustification(tag.dispositionJustification || '');
                              }}
                            >
                              Action
                            </Button>
                          )}
                          {tag.status === 'DISPOSITION_APPROVED' && (
                            <Button
                              variant="primary"
                              size="sm"
                              icon={<CheckCircle2 size={12} />}
                              onClick={() => {
                                setSelectedTagForClose(tag);
                                setFinancialRecovered(tag.financialRecovered || 0);
                              }}
                            >
                              Close
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CREATE NEW RED TAG (ZONE AWARE) */}
      {/* ========================================================================= */}
      <Modal
        isOpen={createDrawerOpen}
        onClose={() => setCreateDrawerOpen(false)}
        title="Register Physical 5S Red Tag"
        subtitle="Log unneeded, obsolete, or misplaced items with category and valuation"
        maxWidth="640px"
      >
        <form onSubmit={handleCreateRedTag} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>
              Zone / Workstation Where Item Was Found *
            </label>
            <select
              className="form-control"
              value={newTag.locationId}
              onChange={(e) => setNewTag({ ...newTag, locationId: e.target.value })}
              required
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.areaCode} — {l.name} ({l.building || 'Plant Alpha'})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>
              Designated Quarantine Holding Area *
            </label>
            <select
              className="form-control"
              value={newTag.targetHoldingAreaId}
              onChange={(e) => setNewTag({ ...newTag, targetHoldingAreaId: e.target.value })}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.areaCode} — {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>Item Name / Description *</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Broken Pneumatic Air Drill Motor (3000 RPM)"
              value={newTag.itemName}
              onChange={(e) => setNewTag({ ...newTag, itemName: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700 }}>Category *</label>
              <select
                className="form-control"
                value={newTag.category}
                onChange={(e) => setNewTag({ ...newTag, category: e.target.value })}
              >
                <option value="UNNEEDED_TOOL">Unneeded Tool</option>
                <option value="SURPLUS_INVENTORY">Surplus Inventory</option>
                <option value="BROKEN_EQUIPMENT">Broken Equipment</option>
                <option value="SCRAP_WASTE">Scrap & Waste</option>
                <option value="UNLABELLED_MATERIAL">Unlabelled Material</option>
                <option value="EXPIRED_ITEM">Expired Item</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700 }}>Quantity</label>
              <input
                type="number"
                className="form-control"
                value={newTag.quantity}
                onChange={(e) => setNewTag({ ...newTag, quantity: Number(e.target.value) })}
                min={1}
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700 }}>Item Value (₹)</label>
              <input
                type="number"
                className="form-control"
                placeholder="0.00"
                value={newTag.estimatedValue}
                onChange={(e) => setNewTag({ ...newTag, estimatedValue: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>Reason for Red Tagging *</label>
            <textarea
              rows={3}
              className="form-control"
              placeholder="Why is this item unneeded, broken, or surplus in this workstation?"
              value={newTag.reason}
              onChange={(e) => setNewTag({ ...newTag, reason: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <Button type="button" variant="secondary" onClick={() => setCreateDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" icon={<Plus size={16} />}>
              Create Tag & Generate QR
            </Button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL: DISPOSITION DECISION */}
      {/* ========================================================================= */}
      {selectedTagForDisp && (
        <Modal
          isOpen={Boolean(selectedTagForDisp)}
          onClose={() => setSelectedTagForDisp(null)}
          title={`Disposition Decision: ${selectedTagForDisp.tagNumber}`}
          maxWidth="600px"
        >
          <form onSubmit={handleSubmitDisposition} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '13px' }}>
              <div><strong>Zone:</strong> {selectedTagForDisp.location?.name} ({selectedTagForDisp.location?.areaCode})</div>
              <div style={{ marginTop: '2px' }}><strong>Item:</strong> {selectedTagForDisp.itemName} ({selectedTagForDisp.quantity} {selectedTagForDisp.unitOfMeasure}) — Value: <strong>₹{(selectedTagForDisp.estimatedValue || 0).toLocaleString('en-IN')}</strong></div>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700 }}>Disposition Action *</label>
              <select
                className="form-control"
                value={dispAction}
                onChange={(e) => setDispAction(e.target.value)}
              >
                <option value="DISPOSE_SCRAP">Dispose & Scrap Metal Recycler</option>
                <option value="RELOCATE">Relocate to Another Production Zone / Plant</option>
                <option value="RETURN_TO_VENDOR">Return to Vendor for Credit / Warranty</option>
                <option value="AUCTION_SELL">Auction / Liquidate on Surplus Portal</option>
                <option value="REPAIR_RESTORE">Send for Refurbishment & Repair</option>
                <option value="KEEP_JUSTIFIED">Retain with Management Justification</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700 }}>Disposition Justification *</label>
              <textarea
                rows={3}
                className="form-control"
                placeholder="Explain the operational rationale, vendor agreement, or scrap quote..."
                value={dispJustification}
                onChange={(e) => setDispJustification(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                id="supApproved"
                checked={supervisorApproved}
                onChange={(e) => setSupervisorApproved(e.target.checked)}
              />
              <label htmlFor="supApproved" style={{ fontSize: '13px', fontWeight: 600 }}>
                Supervisor Authorization Approved
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <Button type="button" variant="secondary" onClick={() => setSelectedTagForDisp(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Confirm Disposition
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: FINAL SCRAP & FINANCIAL RECOVERY */}
      {/* ========================================================================= */}
      {selectedTagForClose && (
        <Modal
          isOpen={Boolean(selectedTagForClose)}
          onClose={() => setSelectedTagForClose(null)}
          title={`Finalize Physical Disposal: ${selectedTagForClose.tagNumber}`}
          maxWidth="560px"
        >
          <form onSubmit={handleCloseRedTag} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '13px' }}>
              Confirming physical scrap or vendor pickup for <strong>{selectedTagForClose.itemName}</strong> ({selectedTagForClose.location?.name}).
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700 }}>Net Financial Recovered Amount (₹)</label>
              <input
                type="number"
                className="form-control"
                placeholder="0.00"
                value={financialRecovered}
                onChange={(e) => setFinancialRecovered(Number(e.target.value))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button type="button" variant="secondary" onClick={() => setSelectedTagForClose(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon={<CheckCircle2 size={16} />}>
                Permanently Close Tag & Record Recovery
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: PRINTABLE 5S RED TAG LABEL */}
      {/* ========================================================================= */}
      {printTagModalItem && (
        <Modal
          isOpen={Boolean(printTagModalItem)}
          onClose={() => setPrintTagModalItem(null)}
          title="Printable Physical 5S Red Tag"
          maxWidth="520px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            <div
              className="printable-red-tag"
              style={{
                width: '100%',
                border: '4px solid #EF4444',
                borderRadius: '8px',
                background: '#FFFFFF',
                color: '#000000',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #EF4444', paddingBottom: '8px' }}>
                <div style={{ background: '#EF4444', color: '#FFFFFF', padding: '4px 12px', fontWeight: 900, fontSize: '18px', letterSpacing: '0.05em' }}>
                  5S RED TAG
                </div>
                <div style={{ fontSize: '16px', fontWeight: 800 }}>
                  {printTagModalItem.tagNumber}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {printTagModalItem.qrCodeUrl && (
                  <img src={printTagModalItem.qrCodeUrl} alt="Tag QR" style={{ width: '110px', height: '110px', border: '1px solid #000' }} />
                )}
                <div style={{ flex: 1, fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><strong>Zone:</strong> {printTagModalItem.location?.name} ({printTagModalItem.location?.areaCode})</div>
                  <div><strong>Item:</strong> {printTagModalItem.itemName}</div>
                  <div><strong>Category:</strong> {getCategoryLabel(printTagModalItem.category)}</div>
                  <div><strong>Quantity:</strong> {printTagModalItem.quantity} {printTagModalItem.unitOfMeasure}</div>
                  <div><strong>Estimated Value:</strong> ₹{(printTagModalItem.estimatedValue || 0).toLocaleString('en-IN')}</div>
                  <div><strong>Tag Date:</strong> {new Date(printTagModalItem.taggedDate).toLocaleDateString()}</div>
                </div>
              </div>

              <div style={{ borderTop: '1px dashed #EF4444', paddingTop: '8px', fontSize: '11px' }}>
                <strong>Reason:</strong> {printTagModalItem.reason}
              </div>

              <div style={{ borderTop: '1px solid #000000', paddingTop: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '10px' }}>
                <div>Tagged By: __________________</div>
                <div>Supervisor: __________________</div>
              </div>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: '10px', width: '100%', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setPrintTagModalItem(null)}>
                Close
              </Button>
              <Button variant="primary" icon={<Printer size={16} />} onClick={() => window.print()}>
                Print Tag Label
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
