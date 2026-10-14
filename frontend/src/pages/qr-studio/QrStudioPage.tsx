import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import QRCode from 'qrcode';
import {
  QrCode,
  Printer,
  Download,
  CheckSquare,
  Square,
  Building,
  Layers,
  Search,
  Filter,
  MapPin,
  Tag,
  Smartphone,
  RefreshCw,
  Check,
  AlertTriangle,
} from 'lucide-react';

export interface UnifiedQrItem {
  id: string;
  category: 'LOCATION' | 'ORG_NODE' | 'RED_TAG' | 'PORTAL';
  badgeLabel: string;
  badgeVariant: 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'purple';
  code: string;
  title: string;
  subtitle: string;
  meta: string;
  ownerOrStatus?: string;
  qrPayload: string;
  qrDataUrl: string;
}

export const QrStudioPage: React.FC = () => {
  const { currentTenant, addToast } = useApp();

  const [allItems, setAllItems] = useState<UnifiedQrItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState<'ALL' | 'LOCATION' | 'ORG_NODE' | 'RED_TAG' | 'PORTAL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  // Load all QR items related to the active tenant across Locations, Org Nodes, Red Tags & Portals
  const loadAllTenantQrCodes = async () => {
    if (!currentTenant) return;
    setLoading(true);

    try {
      const tenantSlug = currentTenant.slug || 'skilglobal-mfg';
      const tenantName = currentTenant.name || 'SkilGlobal Precision Manufacturing';

      // Concurrently fetch Locations, Org Hierarchy Nodes, and Red Tags
      const [batchLocations, orgNodes, redTags] = await Promise.all([
        api.getBatchQrCodes().catch(() => []),
        api.getOrgNodes().catch(() => []),
        api.getRedTags().catch(() => []),
      ]);

      const unifiedList: UnifiedQrItem[] = [];

      // 1. Locations & Workstations (Audit Points)
      for (const loc of batchLocations) {
        const payload = loc.qrPayload || loc.qrCodeData || `5s://${tenantSlug}/locations/${loc.areaCode}`;
        let dataUrl = loc.qrDataUrl;
        if (!dataUrl) {
          try {
            dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1, color: { dark: '#0F172A', light: '#FFFFFF' } });
          } catch {
            dataUrl = '';
          }
        }

        unifiedList.push({
          id: `loc-${loc.id}`,
          category: 'LOCATION',
          badgeLabel: loc.locationType ? loc.locationType.replace('_', ' ') : 'Workstation Area',
          badgeVariant: 'info',
          code: loc.areaCode,
          title: loc.name,
          subtitle: `${loc.orgNodeName || 'Production Bay'} • ${loc.building || 'Main Plant'}`,
          meta: loc.floor || 'Ground Level',
          ownerOrStatus: loc.ownerName ? `Owner: ${loc.ownerName}` : 'Unassigned',
          qrPayload: payload,
          qrDataUrl: dataUrl,
        });
      }

      // 2. Organization Nodes (Plants, Departments, Production Lines)
      for (const node of orgNodes) {
        const payload = `5s://${tenantSlug}/nodes/${node.code}`;
        let dataUrl = node.qrCodeData;
        if (!dataUrl) {
          try {
            dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1, color: { dark: '#0F172A', light: '#FFFFFF' } });
          } catch {
            dataUrl = '';
          }
        }

        unifiedList.push({
          id: `node-${node.id}`,
          category: 'ORG_NODE',
          badgeLabel: node.nodeType ? node.nodeType.replace('_', ' ') : 'Hierarchy Node',
          badgeVariant: 'purple',
          code: node.code,
          title: node.name,
          subtitle: `Plant Hierarchy Node • Depth Level ${node.depth ?? 1}`,
          meta: `${node._count?.locations ?? node.locationCount ?? 0} Associated Workstations`,
          ownerOrStatus: `Status: ${node.status || 'ACTIVE'}`,
          qrPayload: payload,
          qrDataUrl: dataUrl,
        });
      }

      // 3. Red Tag Quarantine Assets
      for (const tag of redTags) {
        const payload = `5s://${tenantSlug}/red-tags/${tag.tagNumber}`;
        let dataUrl = tag.qrCodeUrl;
        if (!dataUrl) {
          try {
            dataUrl = await QRCode.toDataURL(payload, { width: 320, margin: 1, color: { dark: '#991B1B', light: '#FFFFFF' } });
          } catch {
            dataUrl = '';
          }
        }

        unifiedList.push({
          id: `tag-${tag.id}`,
          category: 'RED_TAG',
          badgeLabel: 'Red Tag Asset',
          badgeVariant: 'danger',
          code: tag.tagNumber,
          title: tag.itemName,
          subtitle: `Category: ${tag.category} • Qty: ${tag.quantity || 1}`,
          meta: `Location: ${tag.location?.name || 'Central Holding Area'}`,
          ownerOrStatus: tag.targetDispositionDate
            ? `Disposition Due: ${new Date(tag.targetDispositionDate).toLocaleDateString()}`
            : 'Quarantined',
          qrPayload: payload,
          qrDataUrl: dataUrl,
        });
      }

      // 4. Tenant Quick-Access Portals
      const portalAuditPayload = `${window.location.origin}/mobile-audit?tenant=${tenantSlug}`;
      const portalAuditQr = await QRCode.toDataURL(portalAuditPayload, { width: 320, margin: 1, color: { dark: '#1E3A8A', light: '#FFFFFF' } });

      unifiedList.push({
        id: 'portal-mobile-audit',
        category: 'PORTAL',
        badgeLabel: 'Mobile Access Point',
        badgeVariant: 'success',
        code: `${tenantSlug.toUpperCase()}-AUDIT-RUNNER`,
        title: 'Mobile 5S Audit Execution Portal',
        subtitle: `${tenantName} • Universal Shop-Floor Scanner`,
        meta: 'Instant Gemba Walk Initiation',
        ownerOrStatus: 'Auditors & Plant Teams',
        qrPayload: portalAuditPayload,
        qrDataUrl: portalAuditQr,
      });

      const portalObsPayload = `${window.location.origin}/observations?tenant=${tenantSlug}&action=new`;
      const portalObsQr = await QRCode.toDataURL(portalObsPayload, { width: 320, margin: 1, color: { dark: '#D97706', light: '#FFFFFF' } });

      unifiedList.push({
        id: 'portal-observation-log',
        category: 'PORTAL',
        badgeLabel: 'Mobile Access Point',
        badgeVariant: 'warning',
        code: `${tenantSlug.toUpperCase()}-ABNORMALITY-FASTLOG`,
        title: 'Shop-Floor Abnormality Fast Reporter',
        subtitle: `${tenantName} • Operator Hazard & Clutter Reporting`,
        meta: 'Direct Floor Observation Capture',
        ownerOrStatus: 'Open for All Factory Workers',
        qrPayload: portalObsPayload,
        qrDataUrl: portalObsQr,
      });

      setAllItems(unifiedList);
      setSelectedIds(unifiedList.map((item) => item.id));
    } catch (err) {
      console.error('Failed to load tenant QR codes', err);
      addToast({
        type: 'error',
        title: 'QR Load Failed',
        message: 'Could not fetch all tenant QR codes and tag registries.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllTenantQrCodes();
  }, [currentTenant]);

  // Filter items by active category tab and search input
  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const matchesCategory = activeCategory === 'ALL' || item.category === activeCategory;
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.code.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.meta.toLowerCase().includes(q) ||
        (item.ownerOrStatus && item.ownerOrStatus.toLowerCase().includes(q));

      return matchesCategory && matchesSearch;
    });
  }, [allItems, activeCategory, searchTerm]);

  // Category counts
  const counts = useMemo(() => {
    return {
      ALL: allItems.length,
      LOCATION: allItems.filter((i) => i.category === 'LOCATION').length,
      ORG_NODE: allItems.filter((i) => i.category === 'ORG_NODE').length,
      RED_TAG: allItems.filter((i) => i.category === 'RED_TAG').length,
      PORTAL: allItems.filter((i) => i.category === 'PORTAL').length,
    };
  }, [allItems]);

  // Selection handlers
  const toggleSelectAllVisible = () => {
    const visibleIds = filteredItems.map((item) => item.id);
    const allVisibleSelected = visibleIds.every((id) => selectedIds.includes(id));

    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const toggleSelectId = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    } else {
      setSelectedIds((prev) => [...prev, id]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadQr = (item: UnifiedQrItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = item.qrDataUrl;
    link.download = `QR_${item.code.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast({
      type: 'info',
      title: 'QR Code Downloaded',
      message: `Saved ${item.code}.png`,
    });
  };

  const selectedItems = allItems.filter((item) => selectedIds.includes(item.id));
  const visibleSelectedCount = filteredItems.filter((i) => selectedIds.includes(i.id)).length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* ========================================================================= */}
      {/* SCREEN HEADER (HIDDEN DURING PRINT) */}
      {/* ========================================================================= */}
      <div className="page-header no-print">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title">Physical QR Code Studio &amp; Tag Registry</h1>
            <Badge variant="purple" icon={<QrCode size={12} />}>Tenant Tag Master</Badge>
          </div>
          <p className="page-subtitle">
            Master repository of all scannable physical QR codes for <strong>{currentTenant?.name || 'Active Tenant'}</strong>, spanning workstation locations, department lines, red tag holding assets, and mobile execution portals.
          </p>
        </div>

        <div className="page-header-actions">
          <Button
            variant="secondary"
            icon={<RefreshCw size={14} />}
            loading={loading}
            onClick={loadAllTenantQrCodes}
          >
            Sync QR Codes
          </Button>

          <Button
            variant="primary"
            icon={<Printer size={16} />}
            onClick={handlePrint}
            disabled={selectedItems.length === 0}
          >
            Print {selectedItems.length} Selected Tags
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* FILTER CONTROLS & CATEGORY TABS (NO PRINT) */}
      {/* ========================================================================= */}
      <Card noPadding className="no-print">
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          
          {/* Top Row: Category Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setActiveCategory('ALL')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-full)',
                  border: activeCategory === 'ALL' ? '1px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                  background: activeCategory === 'ALL' ? 'var(--color-primary-light)' : 'var(--bg-surface-subtle)',
                  color: activeCategory === 'ALL' ? 'var(--color-primary)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>All Tenant QR Codes</span>
                <span className="code-tag" style={{ fontSize: '10.5px' }}>{counts.ALL}</span>
              </button>

              <button
                onClick={() => setActiveCategory('LOCATION')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-full)',
                  border: activeCategory === 'LOCATION' ? '1px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                  background: activeCategory === 'LOCATION' ? 'var(--color-primary-light)' : 'var(--bg-surface-subtle)',
                  color: activeCategory === 'LOCATION' ? 'var(--color-primary)' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <MapPin size={13} />
                <span>Workstation Locations</span>
                <span className="code-tag" style={{ fontSize: '10.5px' }}>{counts.LOCATION}</span>
              </button>

              <button
                onClick={() => setActiveCategory('ORG_NODE')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-full)',
                  border: activeCategory === 'ORG_NODE' ? '1px solid #8B5CF6' : '1px solid var(--border-subtle)',
                  background: activeCategory === 'ORG_NODE' ? 'rgba(139, 92, 246, 0.12)' : 'var(--bg-surface-subtle)',
                  color: activeCategory === 'ORG_NODE' ? '#7C3AED' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Building size={13} />
                <span>Plant &amp; Department Lines</span>
                <span className="code-tag" style={{ fontSize: '10.5px' }}>{counts.ORG_NODE}</span>
              </button>

              <button
                onClick={() => setActiveCategory('RED_TAG')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-full)',
                  border: activeCategory === 'RED_TAG' ? '1px solid #EF4444' : '1px solid var(--border-subtle)',
                  background: activeCategory === 'RED_TAG' ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-surface-subtle)',
                  color: activeCategory === 'RED_TAG' ? '#DC2626' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Tag size={13} />
                <span>Red Tag Quarantine</span>
                <span className="code-tag" style={{ fontSize: '10.5px' }}>{counts.RED_TAG}</span>
              </button>

              <button
                onClick={() => setActiveCategory('PORTAL')}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-full)',
                  border: activeCategory === 'PORTAL' ? '1px solid #10B981' : '1px solid var(--border-subtle)',
                  background: activeCategory === 'PORTAL' ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-surface-subtle)',
                  color: activeCategory === 'PORTAL' ? '#059669' : 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Smartphone size={13} />
                <span>Mobile Access Portals</span>
                <span className="code-tag" style={{ fontSize: '10.5px' }}>{counts.PORTAL}</span>
              </button>
            </div>

            {/* Quick Select All / Deselect All */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant="ghost"
                size="sm"
                icon={visibleSelectedCount === filteredItems.length && filteredItems.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
                onClick={toggleSelectAllVisible}
              >
                {visibleSelectedCount === filteredItems.length && filteredItems.length > 0
                  ? 'Deselect All Visible'
                  : `Select All Visible (${filteredItems.length})`}
              </Button>
            </div>
          </div>

          {/* Bottom Row: Search Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search by code (e.g. LOC-BLR, RT-SKIL, BLR-PLANT), workstation name, building, or owner..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ paddingLeft: '36px' }}
              />
            </div>
            {searchTerm && (
              <Button size="sm" variant="ghost" onClick={() => setSearchTerm('')}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* PRINT-ONLY PHYSICAL CUT SHEET HEADER */}
      {/* ========================================================================= */}
      <div className="print-only qr-print-sheet-header" style={{ marginBottom: '16px', borderBottom: '2px solid #000', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '18pt', fontWeight: 800, margin: 0, color: '#000000' }}>
              5S Physical Location Tags &amp; QR Placards
            </h2>
            <div style={{ fontSize: '10pt', color: '#333333' }}>
              {currentTenant?.name || 'SkilGlobal Precision Manufacturing'} • Facility Master Tag Registry
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: '9pt', color: '#555555' }}>
            <div>Batch: {selectedItems.length} Tag{selectedItems.length === 1 ? '' : 's'}</div>
            <div>Printed: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* QR CODE PLACARDS GRID */}
      {/* ========================================================================= */}
      {filteredItems.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-secondary)' }}>
            <QrCode size={40} style={{ opacity: 0.3, margin: '0 auto 12px auto' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              No QR Codes Found Matching Query
            </h3>
            <p style={{ fontSize: '13px', margin: '4px 0 16px 0' }}>
              {searchTerm ? 'Try adjusting your search criteria or switch category filter.' : 'No items registered under this category yet.'}
            </p>
            {searchTerm && (
              <Button size="sm" variant="secondary" onClick={() => setSearchTerm('')}>
                Clear Search Filter
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div
          className="qr-sheet-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: '18px',
          }}
        >
          {filteredItems.map((item) => {
            const isSelected = selectedIds.includes(item.id);

            return (
              <div
                key={item.id}
                onClick={() => toggleSelectId(item.id)}
                className={`qr-card-printable ${!isSelected ? 'qr-item-unselected' : ''}`}
                style={{
                  background: '#FFFFFF',
                  border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '18px 20px',
                  textAlign: 'center',
                  boxShadow: isSelected ? 'var(--shadow-md)' : 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all var(--transition-fast)',
                  pageBreakInside: 'avoid',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {/* Screen-Only Action Badges: Select Checkbox & Category Pill */}
                <div
                  className="no-print"
                  style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    right: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <Badge variant={item.badgeVariant}>{item.badgeLabel}</Badge>

                  <div style={{ color: isSelected ? 'var(--color-primary)' : 'var(--border-strong)' }}>
                    {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                  </div>
                </div>

                {/* Print-Only Category Heading */}
                <div
                  className="print-only"
                  style={{ fontSize: '9pt', fontWeight: 800, color: '#000000', textTransform: 'uppercase', marginBottom: '4px' }}
                >
                  [{item.badgeLabel}]
                </div>

                {/* Tenant Title & Area Code */}
                <div style={{ marginTop: '22px' }}>
                  <div
                    className="qr-tag-header"
                    style={{ fontSize: '10px', fontWeight: 800, color: '#1E3A8A', letterSpacing: '0.06em', textTransform: 'uppercase' }}
                  >
                    {currentTenant?.name || 'SkilGlobal 5S Enterprise'}
                  </div>

                  <div
                    className="qr-tag-code"
                    style={{
                      fontSize: '15px',
                      fontWeight: 800,
                      color: item.category === 'RED_TAG' ? '#DC2626' : '#0F172A',
                      marginTop: '2px',
                      marginBottom: '8px',
                      fontFamily: 'monospace',
                    }}
                  >
                    {item.code}
                  </div>
                </div>

                {/* High-Resolution Scannable QR Code */}
                {item.qrDataUrl ? (
                  <img
                    src={item.qrDataUrl}
                    alt={item.code}
                    className="qr-tag-image"
                    style={{
                      width: '175px',
                      height: '175px',
                      margin: '0 auto',
                      display: 'block',
                      border: '1px solid #CBD5E1',
                      padding: '6px',
                      borderRadius: '6px',
                      background: '#FFFFFF',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: '175px',
                      height: '175px',
                      margin: '0 auto',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#F8FAFC',
                      border: '1px dashed #CBD5E1',
                      borderRadius: '6px',
                      color: 'var(--text-tertiary)',
                      fontSize: '12px',
                    }}
                  >
                    Generating QR...
                  </div>
                )}

                {/* Placard Title & Details */}
                <div
                  className="qr-tag-name"
                  style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginTop: '10px', lineHeight: 1.3 }}
                >
                  {item.title}
                </div>

                <div
                  className="qr-tag-meta"
                  style={{ fontSize: '11px', color: '#475569', marginTop: '3px', lineHeight: 1.3 }}
                >
                  {item.subtitle}
                </div>

                <div
                  className="qr-tag-owner"
                  style={{ fontSize: '10.5px', color: '#64748B', marginTop: '3px' }}
                >
                  {item.ownerOrStatus}
                </div>

                {/* Screen-Only Download PNG Button */}
                <div
                  className="no-print"
                  style={{
                    marginTop: '12px',
                    paddingTop: '10px',
                    borderTop: '1px solid var(--border-subtle)',
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
                    {item.meta}
                  </span>

                  <button
                    onClick={(e) => handleDownloadQr(item, e)}
                    title="Download individual PNG QR tag"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary)',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-xs)',
                    }}
                  >
                    <Download size={12} /> Save PNG
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
