import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getApiErrorMessage } from '../../services/api';
import { QrBatchItem } from '../../services/masterDataApi';
import { areasApi } from '../../services/api-areas';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { FilterBar, SearchInput } from '../../components/ui/FormField';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { LOCATION_TYPE_LABELS, locationStatusLabel, locationTypeLabel } from '../../constants/labels';
import { useI18n } from '../../i18n';
import { QrCode, Printer, Download, CheckSquare, Square, RefreshCw, AlertTriangle } from 'lucide-react';

/** Roles that look after a slice of the site and may print just their own areas' tags. */
const SCOPED_ROLES = ['PLANT_HEAD', 'DEPT_HEAD', 'AREA_OWNER'];

const fileNameFor = (code: string) => `QR_${code.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;

/** Where the location is, from the parts that are filled in ("Assembly • Building 2 • Floor 1"). */
const placeOf = (item: QrBatchItem) => [item.orgNodeName, item.building, item.floor].filter(Boolean).join(' • ');

/** One printable tag. White with dark text on purpose: it is printed and stuck on the shop floor. */
const QrTag: React.FC<{ item: QrBatchItem; tenantName?: string }> = ({ item, tenantName }) => (
  <>
    {tenantName && <div className="qr-tag-header" style={{ fontSize: '11px', fontWeight: 700, color: '#003B70' }}>{tenantName}</div>}
    <div className="qr-tag-code" style={{ fontSize: '15px', fontWeight: 700, color: '#1D2733', marginTop: '2px', marginBottom: '8px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
      {item.areaCode}
    </div>
    {item.qrDataUrl ? (
      <img
        src={item.qrDataUrl}
        alt={`QR code for ${item.name} (${item.areaCode})`}
        className="qr-tag-image"
        style={{ width: '175px', height: '175px', margin: '0 auto', display: 'block', border: '1px solid #CBD5E1', padding: '6px', borderRadius: '6px', background: '#FFFFFF' }}
      />
    ) : (
      <div
        role="img"
        aria-label={`QR code for ${item.areaCode} could not be generated`}
        style={{ width: '175px', height: '175px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '12px', background: '#FEF2F2', border: '1px dashed #FCA5A5', borderRadius: '6px', color: '#991B1B', fontSize: '12px' }}
      >
        {item.error || 'QR code could not be generated'}
      </div>
    )}
    <div className="qr-tag-name" style={{ fontSize: '13px', fontWeight: 600, color: '#1D2733', marginTop: '10px', lineHeight: 1.3 }}>
      {item.name}
    </div>
    {placeOf(item) && (
      <div className="qr-tag-meta" style={{ fontSize: '11px', color: '#475569', marginTop: '3px', lineHeight: 1.3 }}>
        {placeOf(item)}
      </div>
    )}
    <div className="qr-tag-owner" style={{ fontSize: '10.5px', color: '#64748B', marginTop: '3px' }}>
      Owner: {item.ownerName ?? 'Unassigned'}
    </div>
  </>
);

export const QrStudioPage: React.FC = () => {
  const { currentTenant, currentUser, activeUserRole, addToast } = useApp();
  // "My areas": owned / backed-up areas and those under the units the user's roles are limited to
  const showMine = !!currentUser?.roles.some((r) => SCOPED_ROLES.includes(r.code));
  const [mineOnly, setMineOnly] = useState(() => activeUserRole === 'DEPT_HEAD');
  const { formatDate } = useI18n();

  const [items, setItems] = useState<QrBatchItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    setError(null);
    try {
      const list = await areasApi.getQrTags(showMine && mineOnly);
      setItems(list);
      // Keep only selections that still exist; nothing is pre-selected
      setSelectedIds((prev) => prev.filter((id) => list.some((i) => i.id === id && i.qrDataUrl)));
    } catch (err) {
      setError(getApiErrorMessage(err, 'The QR tags could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [currentTenant, showMine, mineOnly]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return items.filter((item) => {
      if (typeFilter && item.locationType !== typeFilter) return false;
      if (!q) return true;
      return [item.areaCode, item.name, item.orgNodeName, item.building, item.floor, item.ownerName]
        .some((v) => v && v.toLowerCase().includes(q));
    });
  }, [items, typeFilter, searchTerm]);

  const selectableVisible = filteredItems.filter((i) => i.qrDataUrl);
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((i) => selectedIds.includes(i.id));
  const failedCount = items.filter((i) => !i.qrDataUrl).length;

  const toggleSelectAllVisible = () => {
    const visibleIds = selectableVisible.map((item) => item.id);
    setSelectedIds((prev) => (allVisibleSelected ? prev.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds]))));
  };

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleDownloadQr = (item: QrBatchItem) => {
    if (!item.qrDataUrl) return;
    const fileName = fileNameFor(item.areaCode);
    const link = document.createElement('a');
    link.href = item.qrDataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addToast({ type: 'info', title: 'QR code downloaded', message: `Saved ${fileName}` });
  };

  // Printed tags are the selected ones, even if the current filter hides some of them
  const selectedItems = items.filter((item) => selectedIds.includes(item.id) && item.qrDataUrl);
  const filtersActive = !!searchTerm || !!typeFilter || (showMine && mineOnly);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="no-print">
        <PageHeader
          title="QR tags"
          description={`Print the QR tags that identify each location${currentTenant?.name ? ` of ${currentTenant.name}` : ''}. Scanning a tag in the mobile app opens that location.`}
          actions={
            <>
              <Button variant="secondary" icon={<RefreshCw size={16} />} loading={loading} onClick={load}>
                Refresh
              </Button>
              <Button variant="primary" icon={<Printer size={16} />} onClick={() => window.print()} disabled={selectedItems.length === 0}>
                Print {selectedItems.length} selected tag{selectedItems.length === 1 ? '' : 's'}
              </Button>
            </>
          }
        />
      </div>

      <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <FilterBar label="Filter QR tags">
          <SearchInput
            label="Search tags"
            placeholder="Search by area code, name, building or owner"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select className="form-select" aria-label="Location type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All location types</option>
            {Object.entries(LOCATION_TYPE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
          {showMine && (
            <button
              type="button"
              className={`pillar-tab-pill${mineOnly ? ' active' : ''}`}
              aria-pressed={mineOnly}
              title="Areas you own or back up, and those under the units your role covers"
              onClick={() => setMineOnly((v) => !v)}
              style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
            >
              My areas
            </button>
          )}
          <Button
            variant="secondary"
            icon={allVisibleSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            onClick={toggleSelectAllVisible}
            disabled={selectableVisible.length === 0}
            style={{ flex: '0 0 auto' }}
          >
            {allVisibleSelected ? 'Clear visible' : `Select visible (${selectableVisible.length})`}
          </Button>
        </FilterBar>
        {failedCount > 0 && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--color-danger)' }}>
            <AlertTriangle size={16} aria-hidden="true" />
            {failedCount} tag{failedCount === 1 ? '' : 's'} could not be generated and cannot be printed.
          </div>
        )}
      </div>

      {/* Print-only sheet header */}
      <div className="print-only qr-print-sheet-header" style={{ marginBottom: '16px', borderBottom: '2px solid #000', paddingBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '18pt', fontWeight: 800, margin: 0, color: '#000000' }}>Location QR tags</h2>
            {currentTenant?.name && <div style={{ fontSize: '10pt', color: '#333333' }}>{currentTenant.name}</div>}
          </div>
          <div style={{ textAlign: 'right', fontSize: '9pt', color: '#555555' }}>
            <div>{selectedItems.length} tag{selectedItems.length === 1 ? '' : 's'}</div>
            <div>Printed {formatDate(new Date())}</div>
          </div>
        </div>
      </div>

      {/* Print-only grid of the selected tags */}
      <div className="print-only">
        <div className="qr-sheet-grid">
          {selectedItems.map((item) => (
            <div key={item.id} className="qr-card-printable">
              <QrTag item={item} tenantName={currentTenant?.name} />
            </div>
          ))}
        </div>
      </div>

      <div className="no-print">
        {loading && items.length === 0 ? (
          <Card><LoadingState label="Loading QR tags…" /></Card>
        ) : error ? (
          <Card><ErrorState message={error} onRetry={load} /></Card>
        ) : filteredItems.length === 0 ? (
          <Card>
            <EmptyState
              icon={<QrCode size={28} />}
              title={filtersActive ? 'No tags match these filters' : 'No locations yet'}
              description={filtersActive ? 'Change the search or the location type, or show all areas.' : 'Add locations to print their QR tags.'}
              action={
                filtersActive ? (
                  <Button size="sm" variant="secondary" onClick={() => { setSearchTerm(''); setTypeFilter(''); setMineOnly(false); }}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: '16px' }}>
            {filteredItems.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const checkboxId = `qr-select-${item.id}`;
              return (
                <div
                  key={item.id}
                  style={{
                    background: isSelected ? 'var(--bg-pale)' : 'var(--bg-surface)',
                    border: `1px solid ${isSelected ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
                    boxShadow: isSelected ? 'inset 0 0 0 1px var(--color-primary)' : 'none',
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
                    <label
                      htmlFor={checkboxId}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', cursor: item.qrDataUrl ? 'pointer' : 'not-allowed', minHeight: '32px' }}
                    >
                      <input id={checkboxId} type="checkbox" checked={isSelected} disabled={!item.qrDataUrl} onChange={() => toggleSelectId(item.id)} style={{ width: '16px', height: '16px' }} />
                      {isSelected ? 'Selected' : 'Select'}
                      <span className="sr-only">{item.areaCode}</span>
                    </label>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Badge variant="neutral">{locationTypeLabel(item.locationType)}</Badge>
                      {item.status !== 'ACTIVE' && <Badge variant="warning">{locationStatusLabel(item.status)}</Badge>}
                    </div>
                  </div>

                  {/* The tag preview stays white: it shows exactly what is printed */}
                  <div style={{ padding: '16px', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ background: '#FFFFFF', border: '1px solid #D5DEE8', borderRadius: 'var(--radius-md)', padding: '14px 16px', textAlign: 'center', width: '100%', maxWidth: '260px' }}>
                      <QrTag item={item} tenantName={currentTenant?.name} />
                    </div>
                  </div>

                  <div style={{ marginTop: 'auto', padding: '8px 12px 8px 16px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <span title="Text encoded in the QR code" style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.qrPayload}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Download size={16} />}
                      onClick={() => handleDownloadQr(item)}
                      disabled={!item.qrDataUrl}
                      aria-label={`Download QR code for ${item.areaCode} as PNG`}
                      style={{ flexShrink: 0 }}
                    >
                      PNG
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selection bar: stays in view while scrolling through the tags */}
      {selectedItems.length > 0 && (
        <div
          className="no-print"
          role="region"
          aria-label="Selected tags"
          style={{
            position: 'sticky',
            bottom: '16px',
            zIndex: 5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            padding: '12px 16px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {selectedItems.length} tag{selectedItems.length === 1 ? '' : 's'} selected
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => setSelectedIds([])}>
              Clear selection
            </Button>
            <Button variant="primary" icon={<Printer size={16} />} onClick={() => window.print()}>
              Print {selectedItems.length} tag{selectedItems.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
