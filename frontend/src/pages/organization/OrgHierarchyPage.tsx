import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OnboardingChecklistCard } from '../../components/common/OnboardingChecklistCard';
import { useApp } from '../../context/AppContext';
import { api, getApiErrorMessage } from '../../services/api';
import { masterDataApi } from '../../services/masterDataApi';
import { areasApi } from '../../services/api-areas';
import { OrgTreeNode, OrgNode, Location, User } from '../../types';
import { NodeTypeOption } from '../../types/areas';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { FormField, SearchInput } from '../../components/ui/FormField';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { FREQUENCY_LABELS, LOCATION_TYPE_LABELS, RISK_LABELS } from '../../constants/labels';
import {
  Building,
  ChevronRight,
  ChevronDown,
  Plus,
  Edit2,
  Trash2,
  Move,
  MapPin,
  Layers,
  Factory,
  QrCode,
  ExternalLink,
  Boxes,
  Wrench,
  Archive,
  LayoutGrid,
  ShieldAlert,
  Building2,
  Network,
  Eye,
} from 'lucide-react';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type AuditFrequency = 'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY';
/** Audit frequencies a location accepts (backend AUDIT_FREQUENCIES). */
const LOCATION_FREQUENCIES: AuditFrequency[] = ['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY'];

type NodeDetails = OrgNode & { locations?: Location[] };

const getNodeIcon = (type: string, size = 16) => {
  switch (type) {
    case 'ENTERPRISE':
      return <Building size={size} />;
    case 'PLANT':
      return <Factory size={size} />;
    case 'DIVISION':
      return <Building2 size={size} />;
    case 'DEPARTMENT':
      return <Layers size={size} />;
    case 'SUB_DEPARTMENT':
      return <Network size={size} />;
    case 'PRODUCTION_LINE':
      return <LayoutGrid size={size} />;
    case 'WORK_CELL':
      return <Boxes size={size} />;
    case 'STORAGE_RACK':
      return <Archive size={size} />;
    case 'WORKBENCH':
      return <Wrench size={size} />;
    case 'QUARANTINE_ZONE':
      return <ShieldAlert size={size} />;
    case 'BAY_STATION':
    case 'SUB_SECTION':
    default:
      return <MapPin size={size} />;
  }
};

/** Type badges stay quiet; only the red-tag quarantine zone stands out. */
const getNodeTypeBadgeVariant = (type: string) => {
  switch (type) {
    case 'ENTERPRISE':
    case 'PLANT':
      return 'info';
    case 'QUARANTINE_ZONE':
      return 'danger';
    default:
      return 'neutral';
  }
};

/** Built-in node types with plain examples; used when the organization's hierarchy levels cannot be loaded. */
const NODE_TYPE_OPTIONS: Array<{ code: string; label: string; hint: string }> = [
  { code: 'ENTERPRISE', label: 'Enterprise / group', hint: '' },
  { code: 'DIVISION', label: 'Division / business unit', hint: '' },
  { code: 'PLANT', label: 'Plant / site', hint: '' },
  { code: 'DEPARTMENT', label: 'Department', hint: 'Machining, assembly, warehouse' },
  { code: 'SUB_DEPARTMENT', label: 'Sub-department', hint: 'Sub-assembly, receiving' },
  { code: 'PRODUCTION_LINE', label: 'Production line', hint: 'Line 01, final pack' },
  { code: 'WORK_CELL', label: 'Work cell', hint: 'Welding cell, kitting bay' },
  { code: 'BAY_STATION', label: 'Bay / station', hint: 'Inspection bay 03' },
  { code: 'STORAGE_RACK', label: 'Storage rack / shelf', hint: 'Raw material rack' },
  { code: 'WORKBENCH', label: 'Workbench / desk', hint: 'Assembly bench 04' },
  { code: 'SUB_SECTION', label: 'Sub-section / area', hint: 'Staging area' },
  { code: 'QUARANTINE_ZONE', label: 'Quarantine zone', hint: 'Red-tag holding bay' },
];

const formatNodeTypeLabel = (type: string) => NODE_TYPE_OPTIONS.find((o) => o.code === type)?.label ?? type.replace(/_/g, ' ').toLowerCase();

/** The location type a node type usually corresponds to; only a suggestion the user can change. */
const suggestedLocationType = (nodeType: string) =>
  nodeType === 'STORAGE_RACK' ? 'WAREHOUSE_BAY' : nodeType === 'QUARANTINE_ZONE' ? 'RED_TAG_ZONE' : nodeType === 'WORKBENCH' ? 'WORKSHOP' : 'PRODUCTION_LINE';

const NodeIcon: React.FC<{ type: string; active?: boolean; large?: boolean }> = ({ type, active = false, large = false }) => (
  <div
    aria-hidden="true"
    style={{
      width: large ? '40px' : '28px',
      height: large ? '40px' : '28px',
      borderRadius: 'var(--radius-md)',
      background: active ? 'var(--bg-surface)' : 'var(--bg-surface-subtle)',
      border: '1px solid var(--border-subtle)',
      color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    {getNodeIcon(type, large ? 20 : 16)}
  </div>
);

const findInTree = (nodes: OrgTreeNode[], id: string): OrgTreeNode | null => {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = findInTree(n.children ?? [], id);
    if (hit) return hit;
  }
  return null;
};

interface TreeNodeProps {
  node: OrgTreeNode;
  selectedId: string | null;
  canEdit: boolean;
  /** Display name of a node type (the organization's own level names). */
  labelOf: (type: string) => string;
  onSelect: (node: OrgTreeNode) => void;
  onAddChild: (parent: OrgTreeNode) => void;
  onMove: (node: OrgTreeNode) => void;
  searchTerm?: string;
}

const TreeNodeItem: React.FC<TreeNodeProps> = ({ node, selectedId, canEdit, labelOf, onSelect, onAddChild, onMove, searchTerm = '' }) => {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;
  const q = searchTerm.toLowerCase();
  const isMatch = q ? node.name.toLowerCase().includes(q) || node.code.toLowerCase().includes(q) || labelOf(node.nodeType).toLowerCase().includes(q) : false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div
        className={`org-tree-row${isSelected || isMatch ? ' is-marked' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 8px',
          borderRadius: 'var(--radius-md)',
          background: isSelected ? 'var(--color-primary-light)' : isMatch ? 'var(--color-warning-bg)' : 'transparent',
          // Selected: pale blue with a blue bar on the left
          boxShadow: isSelected ? 'inset 3px 0 0 var(--color-primary)' : isMatch ? 'inset 3px 0 0 var(--color-warning)' : 'none',
          transition: 'background var(--transition-fast)',
          minWidth: 0,
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.name}`}
            style={{
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              padding: 0,
              flexShrink: 0,
            }}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <div style={{ width: '28px', flexShrink: 0, display: 'flex', justifyContent: 'center' }} aria-hidden="true">
            <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border-strong)' }} />
          </div>
        )}

        <button
          type="button"
          onClick={() => onSelect(node)}
          aria-current={isSelected ? 'true' : undefined}
          style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}
        >
          <NodeIcon type={node.nodeType} active={isSelected} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
            <span
              style={{ fontWeight: 600, fontSize: '14px', color: isSelected ? 'var(--color-primary)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={node.name}
            >
              {node.name}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{node.code}</span>
              <span aria-hidden="true">·</span>
              <span>{labelOf(node.nodeType)}</span>
              {node.locationCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {node.locationCount} {node.locationCount === 1 ? 'location' : 'locations'}
                  </span>
                </>
              )}
              {isMatch && <span className="sr-only">(matches the search)</span>}
            </span>
          </span>
        </button>

        {canEdit && (
          <div style={{ display: 'inline-flex', gap: '2px', flexShrink: 0 }}>
            <Button size="sm" variant="ghost" icon={<Plus size={16} />} onClick={() => onAddChild(node)} aria-label={`Add a unit under ${node.name}`} title="Add a unit under this one" />
            <Button size="sm" variant="ghost" icon={<Move size={16} />} onClick={() => onMove(node)} aria-label={`Move ${node.name}`} title="Move" />
          </div>
        )}
      </div>

      {hasChildren && expanded && (
        <div style={{ marginLeft: '21px', paddingLeft: '10px', borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              selectedId={selectedId}
              canEdit={canEdit}
              labelOf={labelOf}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onMove={onMove}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface NodeForm {
  name: string;
  code: string;
  nodeType: string;
  autoCreateLocation: boolean;
  locationType: string;
  riskLevel: RiskLevel;
  auditFrequency: AuditFrequency;
  ownerId: string;
  building: string;
  floor: string;
  description: string;
}

const emptyForm = (nodeType: string, autoCreateLocation: boolean): NodeForm => ({
  name: '',
  code: '',
  nodeType,
  autoCreateLocation,
  locationType: suggestedLocationType(nodeType),
  riskLevel: 'MEDIUM',
  auditFrequency: 'WEEKLY',
  ownerId: '',
  building: '',
  floor: '',
  description: '',
});

/**
 * Type options: the organization's hierarchy levels, then other unit types. Falls back to the built-in list when the
 * levels could not be loaded, and always keeps the current value selectable.
 */
const NodeTypeSelectOptions: React.FC<{ configured: NodeTypeOption[]; others: NodeTypeOption[]; current: string; labelOf: (type: string) => string }> = ({
  configured,
  others,
  current,
  labelOf,
}) => {
  if (!configured.length && !others.length) {
    return (
      <>
        {NODE_TYPE_OPTIONS.map((o) => (
          <option key={o.code} value={o.code}>{o.hint ? `${o.label} (e.g. ${o.hint})` : o.label}</option>
        ))}
        {current && !NODE_TYPE_OPTIONS.some((o) => o.code === current) && <option value={current}>{labelOf(current)}</option>}
      </>
    );
  }
  const known = [...configured, ...others].some((o) => o.code === current);
  return (
    <>
      {configured.length > 0 && (
        <optgroup label="Your hierarchy levels">
          {configured.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
        </optgroup>
      )}
      <optgroup label={configured.length ? 'Other unit types' : 'Unit types'}>
        {others.map((o) => {
          const hint = NODE_TYPE_OPTIONS.find((b) => b.code === o.code)?.hint;
          return <option key={o.code} value={o.code}>{hint ? `${o.label} (e.g. ${hint})` : o.label}</option>;
        })}
      </optgroup>
      {current && !known && <option value={current}>{labelOf(current)}</option>}
    </>
  );
};

export const OrgHierarchyPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTenant, addToast, can } = useApp();
  const canEdit = can('ORG_ADMINS');

  const [tree, setTree] = useState<OrgTreeNode[]>([]);
  const [flatNodes, setFlatNodes] = useState<OrgNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<NodeDetails | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Create
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [parentNode, setParentNode] = useState<OrgTreeNode | null>(null);
  const [form, setForm] = useState<NodeForm>(emptyForm('PLANT', false));
  const [formErrors, setFormErrors] = useState<Partial<Record<'name' | 'code' | 'form', string>>>({});
  const [saving, setSaving] = useState(false);

  // Edit
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', code: '', nodeType: '' });
  const [editErrors, setEditErrors] = useState<Partial<Record<'name' | 'code' | 'form', string>>>({});

  // Move
  const [moveNode, setMoveNode] = useState<OrgTreeNode | null>(null);
  const [targetParentId, setTargetParentId] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Unit types: the organization's configured hierarchy levels first, then built-in types
  const [nodeTypes, setNodeTypes] = useState<NodeTypeOption[]>([]);
  const configuredLevels = useMemo(() => nodeTypes.filter((t) => t.configured), [nodeTypes]);
  const otherTypes = useMemo(() => nodeTypes.filter((t) => !t.configured), [nodeTypes]);
  const typeLabel = useCallback(
    (type: string) => nodeTypes.find((t) => t.code === type)?.label ?? formatNodeTypeLabel(type),
    [nodeTypes],
  );

  useEffect(() => {
    if (!currentTenant) return;
    let cancelled = false;
    areasApi
      .getNodeTypes()
      .then((types) => !cancelled && setNodeTypes(types))
      // Without the configured levels the built-in list is offered; the server still validates the choice
      .catch(() => !cancelled && setNodeTypes([]));
    return () => {
      cancelled = true;
    };
  }, [currentTenant]);

  const selectedNode = useMemo(() => (selectedId ? findInTree(tree, selectedId) : null), [tree, selectedId]);

  const loadTree = useCallback(async () => {
    if (!currentTenant) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [treeData, flatData, usersData] = await Promise.all([api.getOrgTree(), api.getOrgNodes(), api.getUsers()]);
      setTree(treeData);
      setFlatNodes(flatData);
      setUsers(usersData);
      // Keep the current selection when it still exists, otherwise select the first top-level unit
      setSelectedId((prev) => (prev && findInTree(treeData, prev) ? prev : treeData[0]?.id ?? null));
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'The organization structure could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [currentTenant]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  // Linked locations of the selected node
  useEffect(() => {
    if (!selectedId) {
      setSelectedNodeDetails(null);
      return;
    }
    let cancelled = false;
    api
      .getOrgNodeById(selectedId)
      .then((data) => !cancelled && setSelectedNodeDetails(data as NodeDetails))
      .catch(() => !cancelled && setSelectedNodeDetails(null));
    return () => {
      cancelled = true;
    };
  }, [selectedId, tree]);

  const selectedBreadcrumbs = useMemo(() => {
    if (!selectedId || !flatNodes.length) return [];
    const trail: OrgNode[] = [];
    let curr = flatNodes.find((n) => n.id === selectedId);
    while (curr) {
      trail.unshift(curr);
      if (!curr.parentId) break;
      const parentId = curr.parentId;
      curr = flatNodes.find((n) => n.id === parentId);
    }
    return trail;
  }, [selectedId, flatNodes]);

  const fetchAutoCode = async (targetType: string, parentId?: string | null) => {
    try {
      const nextCode = await api.getNextOrgNodeCode(targetType, parentId || undefined);
      if (nextCode) setForm((f) => ({ ...f, code: nextCode }));
    } catch {
      // Leaving the code empty lets the user type one; the server reports duplicates
    }
  };

  const handleOpenAddChild = (parent: OrgTreeNode | null, defaultType?: string) => {
    let targetType = 'PLANT';
    // With configured levels, a new unit defaults to the level below its parent (or the top level)
    let nextLevel: NodeTypeOption | undefined;
    if (!parent) {
      nextLevel = configuredLevels[0];
    } else {
      const parentLevel = configuredLevels.find((t) => t.code === parent.nodeType)?.level;
      if (parentLevel != null) nextLevel = configuredLevels.find((t) => t.level != null && t.level > parentLevel);
    }
    if (defaultType) targetType = defaultType;
    else if (nextLevel) targetType = nextLevel.code;
    else if (parent) {
      if (parent.nodeType === 'ENTERPRISE') targetType = defaultType || 'PLANT';
      else if (parent.nodeType === 'PLANT') targetType = defaultType || 'DEPARTMENT';
      else if (parent.nodeType === 'DEPARTMENT') targetType = defaultType || 'SUB_DEPARTMENT';
      else if (parent.nodeType === 'SUB_DEPARTMENT') targetType = defaultType || 'PRODUCTION_LINE';
      else if (parent.nodeType === 'PRODUCTION_LINE') targetType = defaultType || 'WORK_CELL';
      else if (parent.nodeType === 'WORK_CELL') targetType = defaultType || 'STORAGE_RACK';
      else targetType = defaultType || 'SUB_SECTION';
    }
    setParentNode(parent);
    setForm(emptyForm(targetType, !!parent));
    setFormErrors({});
    setAddModalOpen(true);
    fetchAutoCode(targetType, parent?.id);
  };

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: typeof formErrors = {};
    if (!form.name.trim()) errors.name = 'Enter a name.';
    if (!form.code.trim()) errors.code = 'Enter a code.';
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    setSaving(true);
    try {
      const formattedCode = form.code.trim().toUpperCase().replace(/\s+/g, '-');
      await api.createOrgNode({
        parentId: parentNode?.id || undefined,
        name: form.name.trim(),
        code: formattedCode,
        nodeType: form.nodeType,
        autoCreateLocation: form.autoCreateLocation,
        ...(form.autoCreateLocation
          ? {
              locationType: form.locationType,
              riskLevel: form.riskLevel,
              auditFrequency: form.auditFrequency,
              ownerId: form.ownerId || undefined,
              building: form.building.trim() || undefined,
              floor: form.floor.trim() || undefined,
              description: form.description.trim() || undefined,
            }
          : {}),
      });
      addToast({
        type: 'success',
        title: `${typeLabel(form.nodeType)} created`,
        message: `${form.name.trim()} (${formattedCode}) was added${form.autoCreateLocation ? ' together with its location' : ''}.`,
      });
      setAddModalOpen(false);
      await loadTree();
    } catch (err) {
      setFormErrors({ form: getApiErrorMessage(err, 'The unit could not be created.') });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = () => {
    if (!selectedNode) return;
    setEditForm({ name: selectedNode.name, code: selectedNode.code, nodeType: selectedNode.nodeType });
    setEditErrors({});
    setEditOpen(true);
  };

  const handleEditNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode) return;
    const errors: typeof editErrors = {};
    if (!editForm.name.trim()) errors.name = 'Enter a name.';
    if (!editForm.code.trim()) errors.code = 'Enter a code.';
    setEditErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      await api.updateOrgNode(selectedNode.id, { name: editForm.name.trim(), code: editForm.code.trim(), nodeType: editForm.nodeType });
      addToast({ type: 'success', title: 'Unit updated', message: `${editForm.name.trim()} was saved.` });
      setEditOpen(false);
      await loadTree();
    } catch (err) {
      setEditErrors({ form: getApiErrorMessage(err, 'The unit could not be saved.') });
    } finally {
      setSaving(false);
    }
  };

  const openMove = (node: OrgTreeNode) => {
    setSelectedId(node.id);
    setMoveNode(node);
    setTargetParentId(node.parentId ?? '');
    setMoveError(null);
  };

  // A node cannot move under itself or one of its own descendants
  const moveTargets = useMemo(() => {
    if (!moveNode) return [];
    return flatNodes.filter((n) => n.id !== moveNode.id && !n.path.startsWith(moveNode.path));
  }, [flatNodes, moveNode]);

  const handleMoveNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!moveNode) return;
    if ((targetParentId || null) === (moveNode.parentId ?? null)) {
      setMoveError('Choose a different place than the current one.');
      return;
    }
    setSaving(true);
    try {
      await masterDataApi.moveOrgNode(moveNode.id, targetParentId || null);
      addToast({ type: 'success', title: 'Unit moved', message: `${moveNode.name} and everything under it were moved.` });
      setMoveNode(null);
      await loadTree();
    } catch (err) {
      setMoveError(getApiErrorMessage(err, 'The unit could not be moved.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNode = async () => {
    if (!selectedNode) return;
    setSaving(true);
    setDeleteError(null);
    try {
      await api.deleteOrgNode(selectedNode.id);
      addToast({ type: 'success', title: 'Unit deleted', message: `${selectedNode.name} was removed.` });
      setDeleteOpen(false);
      setSelectedId(null);
      await loadTree();
    } catch (err) {
      // The server explains what still depends on the node (child units, locations)
      setDeleteError(getApiErrorMessage(err, 'The unit could not be deleted.'));
    } finally {
      setSaving(false);
    }
  };

  const setField = <K extends keyof NodeForm>(key: K, value: NodeForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const linkedLocations = selectedNodeDetails?.id === selectedId ? selectedNodeDetails?.locations ?? [] : [];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Organization structure"
        description="Plants, departments, lines, cells and racks. Locations are audited at the units where they belong."
        actions={
          <>
            <Button variant="secondary" icon={<MapPin size={16} />} onClick={() => navigate('/locations')}>
              Locations
            </Button>
            {canEdit && (
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => handleOpenAddChild(null)}>
                Add top-level unit
              </Button>
            )}
          </>
        }
      />

      {/* Go-live checklist for org admins / 5S coordinators while setup is incomplete */}
      <OnboardingChecklistCard />

      {!canEdit && (
        <div role="note" className="section-intro-banner" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
          <Eye size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
          <span><strong style={{ color: 'var(--text-primary)' }}>View only.</strong> Organization administrators change the structure.</span>
        </div>
      )}

      {loading && tree.length === 0 ? (
        <Card><LoadingState label="Loading organization structure…" /></Card>
      ) : loadError ? (
        <Card><ErrorState message={loadError} onRetry={loadTree} /></Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(360px, 100%), 1fr))', gap: '24px', alignItems: 'start' }}>
          <Card title="Structure" subtitle="Select a unit to see its details and locations">
            <SearchInput
              label="Search units"
              placeholder="Search by name, code or type"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ marginBottom: '16px' }}
            />

            {tree.length === 0 ? (
              <EmptyState
                title="No units yet"
                description={canEdit ? 'Start with a plant or the enterprise itself.' : 'An administrator has not set up the structure yet.'}
                action={canEdit ? <Button size="sm" icon={<Plus size={16} />} onClick={() => handleOpenAddChild(null)}>Add top-level unit</Button> : undefined}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '680px', overflowY: 'auto', margin: '0 -8px', padding: '0 8px' }}>
                {tree.map((root) => (
                  <TreeNodeItem
                    key={root.id}
                    node={root}
                    selectedId={selectedId}
                    canEdit={canEdit}
                    labelOf={typeLabel}
                    onSelect={(n) => setSelectedId(n.id)}
                    onAddChild={(parent) => handleOpenAddChild(parent)}
                    onMove={openMove}
                    searchTerm={searchTerm}
                  />
                ))}
              </div>
            )}
          </Card>

          <div style={{ position: 'sticky', top: '88px', minWidth: 0 }}>
            {selectedNode ? (
              <Card
                header={
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <NodeIcon type={selectedNode.nodeType} large />
                    <div style={{ minWidth: 0 }}>
                      <h2 className="card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={selectedNode.name}>
                        {selectedNode.name}
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                        <Badge variant={getNodeTypeBadgeVariant(selectedNode.nodeType)}>{typeLabel(selectedNode.nodeType)}</Badge>
                        <span className="code-tag" style={{ whiteSpace: 'nowrap' }}>{selectedNode.code}</span>
                        {selectedNode.status !== 'ACTIVE' && <Badge variant="neutral">Inactive</Badge>}
                      </div>
                    </div>
                  </div>
                }
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {selectedBreadcrumbs.length > 1 && (
                    <nav aria-label="Position in the structure">
                      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '13px' }}>
                        {selectedBreadcrumbs.map((crumb, idx) => {
                          const last = idx === selectedBreadcrumbs.length - 1;
                          return (
                            <li key={crumb.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              {idx > 0 && <ChevronRight size={14} color="var(--text-tertiary)" aria-hidden="true" />}
                              {last ? (
                                <span aria-current="location" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{crumb.name}</span>
                              ) : (
                                <button type="button" onClick={() => setSelectedId(crumb.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--color-primary)', fontWeight: 500, fontSize: '13px' }}>
                                  {crumb.name}
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    </nav>
                  )}

                  <dl className="keep-cols" style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ padding: '12px 16px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)' }}>
                      <dt style={{ color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 500 }}>Units under it</dt>
                      <dd className="tabular-nums" style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedNode.children?.length ?? 0}</dd>
                    </div>
                    <div style={{ padding: '12px 16px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)' }}>
                      <dt style={{ color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 500 }}>Locations</dt>
                      <dd className="tabular-nums" style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>{selectedNode.locationCount}</dd>
                    </div>
                  </dl>

                  {linkedLocations.length > 0 && (
                    <section>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Locations here ({linkedLocations.length})</h3>
                        <Button size="sm" variant="ghost" icon={<QrCode size={16} />} onClick={() => navigate('/qr-studio')}>
                          Print QR tags
                        </Button>
                      </div>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0, border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                        {linkedLocations.map((loc, i) => (
                          <li key={loc.id} style={{ borderTop: i === 0 ? undefined : '1px solid var(--border-subtle)' }}>
                            <button
                              type="button"
                              onClick={() => navigate(`/locations/${loc.id}`)}
                              style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-surface)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}
                            >
                              <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span className="code-tag" style={{ whiteSpace: 'nowrap' }}>{loc.areaCode}</span>
                                <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{loc.name}</span>
                              </span>
                              <ExternalLink size={16} color="var(--text-tertiary)" aria-hidden="true" style={{ flexShrink: 0 }} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {canEdit && (
                    <>
                      <section>
                        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>Add under this unit</h3>
                        <div className="grid-auto" style={{ ['--min' as string]: '150px', gap: '8px' } as React.CSSProperties}>
                          <Button size="sm" variant="secondary" icon={<Archive size={16} />} onClick={() => handleOpenAddChild(selectedNode, 'STORAGE_RACK')}>Storage rack</Button>
                          <Button size="sm" variant="secondary" icon={<Boxes size={16} />} onClick={() => handleOpenAddChild(selectedNode, 'WORK_CELL')}>Work cell</Button>
                          <Button size="sm" variant="secondary" icon={<Wrench size={16} />} onClick={() => handleOpenAddChild(selectedNode, 'WORKBENCH')}>Workbench</Button>
                          <Button size="sm" variant="secondary" icon={<Plus size={16} />} onClick={() => handleOpenAddChild(selectedNode)}>Other unit</Button>
                        </div>
                      </section>

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
                        <Button variant="secondary" icon={<Edit2 size={16} />} onClick={openEdit}>Edit</Button>
                        <Button variant="secondary" icon={<Move size={16} />} onClick={() => openMove(selectedNode)}>Move</Button>
                        <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => { setDeleteError(null); setDeleteOpen(true); }} style={{ marginLeft: 'auto' }}>Delete</Button>
                      </div>
                    </>
                  )}
                </div>
              </Card>
            ) : (
              <Card title="Details">
                <EmptyState title="No unit selected" description="Select a unit in the structure to see its details." />
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Create unit */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => !saving && setAddModalOpen(false)}
        title={parentNode ? `Add a unit under ${parentNode.name}` : 'Add a top-level unit'}
        subtitle={parentNode ? `${parentNode.code} · ${typeLabel(parentNode.nodeType)}` : undefined}
        maxWidth="640px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddModalOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="org-node-create-form" variant="primary" icon={<Plus size={16} />} loading={saving}>
              Create unit
            </Button>
          </>
        }
      >
        <form id="org-node-create-form" onSubmit={handleCreateNode} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="grid-auto" style={{ ['--min' as string]: '220px', gap: '16px' } as React.CSSProperties}>
            <FormField label="Name" required error={formErrors.name} style={{ marginBottom: 0 }}>
              {(p) => <input {...p} type="text" className="form-input" value={form.name} onChange={(e) => setField('name', e.target.value)} />}
            </FormField>
            <FormField label="Code" required error={formErrors.code} hint="Unique in your organization." style={{ marginBottom: 0 }}>
              {(p) => (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input {...p} type="text" className="form-input" value={form.code} onChange={(e) => setField('code', e.target.value)} style={{ whiteSpace: 'nowrap' }} />
                  <Button type="button" variant="secondary" onClick={() => fetchAutoCode(form.nodeType, parentNode?.id)} style={{ flexShrink: 0 }}>
                    Suggest
                  </Button>
                </div>
              )}
            </FormField>
          </div>

          <FormField
            label="Type"
            required
            hint={configuredLevels.length ? undefined : 'Name your own hierarchy levels (e.g. Country, Region, Zone) in Settings.'}
            style={{ marginBottom: 0 }}
          >
            {(p) => (
              <select
                {...p}
                className="form-select"
                value={form.nodeType}
                onChange={(e) => {
                  const newType = e.target.value;
                  setForm((f) => ({ ...f, nodeType: newType, locationType: suggestedLocationType(newType) }));
                  fetchAutoCode(newType, parentNode?.id);
                }}
              >
                <NodeTypeSelectOptions configured={configuredLevels} others={otherTypes} current={form.nodeType} labelOf={typeLabel} />
              </select>
            )}
          </FormField>

          <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', border: '1px solid var(--color-info-border)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <input
                type="checkbox"
                id="autoLocCheck"
                checked={form.autoCreateLocation}
                onChange={(e) => setField('autoCreateLocation', e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', marginTop: '2px', flexShrink: 0 }}
              />
              <label htmlFor="autoLocCheck" style={{ fontWeight: 600, fontSize: '14px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                Also create a location for this unit (gets a QR tag and can be audited)
              </label>
            </div>

            {form.autoCreateLocation && (
              <div className="grid-auto" style={{ ['--min' as string]: '200px', gap: '16px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-info-border)' } as React.CSSProperties}>
                <FormField label="Location type" style={{ marginBottom: 0 }}>
                  {(p) => (
                    <select {...p} className="form-select" value={form.locationType} onChange={(e) => setField('locationType', e.target.value)}>
                      {Object.entries(LOCATION_TYPE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  )}
                </FormField>
                <FormField label="Audit frequency" style={{ marginBottom: 0 }}>
                  {(p) => (
                    <select {...p} className="form-select" value={form.auditFrequency} onChange={(e) => setField('auditFrequency', e.target.value as AuditFrequency)}>
                      {LOCATION_FREQUENCIES.map((code) => <option key={code} value={code}>{FREQUENCY_LABELS[code]}</option>)}
                    </select>
                  )}
                </FormField>
                <FormField label="Risk level" style={{ marginBottom: 0 }}>
                  {(p) => (
                    <select {...p} className="form-select" value={form.riskLevel} onChange={(e) => setField('riskLevel', e.target.value as RiskLevel)}>
                      {Object.entries(RISK_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                    </select>
                  )}
                </FormField>
                <FormField label="Area owner" style={{ marginBottom: 0 }}>
                  {(p) => (
                    <select {...p} className="form-select" value={form.ownerId} onChange={(e) => setField('ownerId', e.target.value)}>
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}{u.jobTitle ? ` (${u.jobTitle})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                <FormField label="Building" style={{ marginBottom: 0 }}>
                  {(p) => <input {...p} type="text" className="form-input" value={form.building} onChange={(e) => setField('building', e.target.value)} />}
                </FormField>
                <FormField label="Floor" style={{ marginBottom: 0 }}>
                  {(p) => <input {...p} type="text" className="form-input" value={form.floor} onChange={(e) => setField('floor', e.target.value)} />}
                </FormField>
                <FormField label="Description" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  {(p) => <textarea {...p} className="form-textarea" rows={2} value={form.description} onChange={(e) => setField('description', e.target.value)} />}
                </FormField>
              </div>
            )}
          </div>
          {formErrors.form && <p role="alert" className="form-error" style={{ margin: 0 }}>{formErrors.form}</p>}
        </form>
      </Modal>

      {/* Edit unit */}
      <Modal
        isOpen={editOpen}
        onClose={() => !saving && setEditOpen(false)}
        title="Edit unit"
        subtitle="Changing the code updates the unit's position path; location area codes do not change."
        maxWidth="520px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="org-node-edit-form" variant="primary" loading={saving}>Save</Button>
          </>
        }
      >
        <form id="org-node-edit-form" onSubmit={handleEditNode} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormField label="Name" required error={editErrors.name} style={{ marginBottom: 0 }}>
            {(p) => <input {...p} type="text" className="form-input" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />}
          </FormField>
          <FormField label="Code" required error={editErrors.code} style={{ marginBottom: 0 }}>
            {(p) => <input {...p} type="text" className="form-input" value={editForm.code} onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))} />}
          </FormField>
          <FormField label="Type" style={{ marginBottom: 0 }}>
            {(p) => (
              <select {...p} className="form-select" value={editForm.nodeType} onChange={(e) => setEditForm((f) => ({ ...f, nodeType: e.target.value }))}>
                <NodeTypeSelectOptions configured={configuredLevels} others={otherTypes} current={editForm.nodeType} labelOf={typeLabel} />
              </select>
            )}
          </FormField>
          {editErrors.form && <p role="alert" className="form-error" style={{ margin: 0 }}>{editErrors.form}</p>}
        </form>
      </Modal>

      {/* Move unit */}
      <Modal
        isOpen={moveNode !== null}
        onClose={() => !saving && setMoveNode(null)}
        title={moveNode ? `Move ${moveNode.name}` : 'Move unit'}
        subtitle="Everything under this unit moves with it."
        maxWidth="540px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveNode(null)} disabled={saving}>Cancel</Button>
            <Button type="submit" form="org-node-move-form" variant="primary" loading={saving}>Move</Button>
          </>
        }
      >
        <form id="org-node-move-form" onSubmit={handleMoveNode} noValidate>
          <FormField label="New place" error={moveError} style={{ marginBottom: 0 }}>
            {(p) => (
              <select {...p} className="form-select" value={targetParentId} onChange={(e) => { setTargetParentId(e.target.value); setMoveError(null); }}>
                <option value="">Top level (no parent)</option>
                {moveTargets.map((n) => (
                  <option key={n.id} value={n.id}>
                    {'— '.repeat(n.depth)}{n.name} ({n.code})
                  </option>
                ))}
              </select>
            )}
          </FormField>
        </form>
      </Modal>

      {/* Delete unit */}
      <ConfirmDialog
        isOpen={deleteOpen}
        title={selectedNode ? `Delete ${selectedNode.name}?` : 'Delete unit?'}
        message={
          <>
            A unit can only be deleted when no units and no locations are under it. Its history is kept.
            {deleteError && <p role="alert" className="form-error" style={{ margin: '12px 0 0' }}>{deleteError}</p>}
          </>
        }
        confirmLabel="Delete"
        tone="danger"
        busy={saving}
        onConfirm={handleDeleteNode}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
};
