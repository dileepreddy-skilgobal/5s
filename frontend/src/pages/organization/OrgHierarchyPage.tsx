import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { OrgTreeNode, OrgNode, Location, User } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import {
  Building,
  ChevronRight,
  ChevronDown,
  Plus,
  FolderTree,
  Edit2,
  Trash2,
  Move,
  MapPin,
  Layers,
  Factory,
  Search,
  CheckCircle2,
  QrCode,
  Printer,
  ExternalLink,
  Boxes,
  Wrench,
  Archive,
  LayoutGrid,
  ShieldAlert,
  Calendar,
  Sparkles,
  Info,
  Check,
  Building2,
  Network,
  Maximize2,
} from 'lucide-react';

interface TreeNodeProps {
  node: OrgTreeNode;
  selectedId: string | null;
  onSelect: (node: OrgTreeNode) => void;
  onAddChild: (parent: OrgTreeNode) => void;
  onMove: (node: OrgTreeNode) => void;
  onShowQR: (node: OrgTreeNode) => void;
  searchTerm?: string;
}

const getNodeIcon = (type: string) => {
  switch (type) {
    case 'ENTERPRISE':
      return <Building size={16} color="var(--color-primary)" />;
    case 'PLANT':
      return <Factory size={16} color="#0284c7" />;
    case 'DIVISION':
      return <Building2 size={16} color="#0d9488" />;
    case 'DEPARTMENT':
      return <Layers size={16} color="#7c3aed" />;
    case 'SUB_DEPARTMENT':
      return <Network size={16} color="#9333ea" />;
    case 'PRODUCTION_LINE':
      return <LayoutGrid size={16} color="#d97706" />;
    case 'WORK_CELL':
      return <Boxes size={16} color="#ea580c" />;
    case 'BAY_STATION':
      return <MapPin size={16} color="#2563eb" />;
    case 'STORAGE_RACK':
      return <Archive size={16} color="#059669" />;
    case 'WORKBENCH':
      return <Wrench size={16} color="#ca8a04" />;
    case 'QUARANTINE_ZONE':
      return <ShieldAlert size={16} color="#dc2626" />;
    case 'SUB_SECTION':
    default:
      return <MapPin size={16} color="#4b5563" />;
  }
};

const getNodeTypeBadgeVariant = (type: string) => {
  switch (type) {
    case 'ENTERPRISE':
    case 'PLANT':
      return 'info';
    case 'DIVISION':
    case 'DEPARTMENT':
      return 'purple';
    case 'SUB_DEPARTMENT':
    case 'PRODUCTION_LINE':
      return 'warning';
    case 'STORAGE_RACK':
    case 'WORKBENCH':
      return 'success';
    case 'QUARANTINE_ZONE':
      return 'danger';
    default:
      return 'neutral';
  }
};

const formatNodeTypeLabel = (type: string) => {
  switch (type) {
    case 'ENTERPRISE':
      return 'Enterprise / Group';
    case 'PLANT':
      return 'Plant / Site';
    case 'DIVISION':
      return 'Division / BU';
    case 'DEPARTMENT':
      return 'Department';
    case 'SUB_DEPARTMENT':
      return 'Sub-Department';
    case 'PRODUCTION_LINE':
      return 'Production Line';
    case 'WORK_CELL':
      return 'Work Cell';
    case 'BAY_STATION':
      return 'Bay / Station';
    case 'STORAGE_RACK':
      return 'Storage Rack / Shelf';
    case 'WORKBENCH':
      return 'Workbench / Desk';
    case 'SUB_SECTION':
      return 'Sub-Section / Area';
    case 'QUARANTINE_ZONE':
      return 'Red Tag Quarantine';
    default:
      return type.replace(/_/g, ' ');
  }
};

const getNodeIconContainer = (type: string) => {
  let bg = 'rgba(37, 99, 235, 0.1)';

  switch (type) {
    case 'ENTERPRISE':
      bg = 'rgba(37, 99, 235, 0.12)';
      break;
    case 'PLANT':
      bg = 'rgba(2, 132, 199, 0.12)';
      break;
    case 'DIVISION':
      bg = 'rgba(13, 148, 136, 0.12)';
      break;
    case 'DEPARTMENT':
      bg = 'rgba(124, 58, 237, 0.12)';
      break;
    case 'SUB_DEPARTMENT':
      bg = 'rgba(147, 51, 234, 0.12)';
      break;
    case 'PRODUCTION_LINE':
      bg = 'rgba(217, 119, 6, 0.12)';
      break;
    case 'WORK_CELL':
      bg = 'rgba(234, 88, 12, 0.12)';
      break;
    case 'STORAGE_RACK':
      bg = 'rgba(5, 150, 105, 0.12)';
      break;
    case 'WORKBENCH':
      bg = 'rgba(202, 138, 4, 0.12)';
      break;
    case 'QUARANTINE_ZONE':
      bg = 'rgba(220, 38, 38, 0.12)';
      break;
    default:
      bg = 'rgba(100, 116, 139, 0.12)';
  }

  return (
    <div
      style={{
        width: '28px',
        height: '28px',
        borderRadius: 'var(--radius-sm)',
        background: bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {getNodeIcon(type)}
    </div>
  );
};

const TreeNodeItem: React.FC<TreeNodeProps> = ({
  node,
  selectedId,
  onSelect,
  onAddChild,
  onMove,
  onShowQR,
  searchTerm = '',
}) => {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  const isMatch = searchTerm
    ? node.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.nodeType.toLowerCase().includes(searchTerm.toLowerCase())
    : false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <div
        onClick={() => onSelect(node)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          background: isSelected
            ? 'var(--color-primary-light)'
            : isMatch
            ? 'rgba(245, 158, 11, 0.08)'
            : '#FFFFFF',
          border: isSelected
            ? '1.5px solid var(--color-primary)'
            : isMatch
            ? '1.5px dashed #f59e0b'
            : '1px solid var(--border-subtle)',
          boxShadow: isSelected
            ? '0 2px 8px rgba(37, 99, 235, 0.12)'
            : '0 1px 2px rgba(0, 0, 0, 0.02)',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        {/* Left main info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, paddingRight: '8px' }}>
          {/* Chevron expand/collapse */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '20px',
                height: '20px',
                padding: 0,
                flexShrink: 0,
              }}
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <div style={{ width: '20px', flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--border-strong)' }} />
            </div>
          )}

          {/* Icon Badge */}
          {getNodeIconContainer(node.nodeType)}

          {/* Clean 2-Row text block */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span
                style={{
                  fontWeight: isSelected ? 800 : 600,
                  fontSize: '13.5px',
                  color: isSelected ? 'var(--color-primary)' : 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={node.name}
              >
                {node.name}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-tertiary)', flexWrap: 'wrap' }}>
              <span
                className="code-tag"
                style={{
                  background: 'var(--bg-surface-subtle)',
                  padding: '0.5px 5px',
                  borderRadius: 'var(--radius-xs)',
                  fontWeight: 700,
                  fontSize: '10.5px',
                  color: 'var(--text-secondary)',
                }}
              >
                {node.code}
              </span>
              <span>•</span>
              <Badge variant={getNodeTypeBadgeVariant(node.nodeType)} style={{ fontSize: '9.5px', padding: '1px 5px' }}>
                {formatNodeTypeLabel(node.nodeType)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Right side actions & area pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          {node.locationCount > 0 && (
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 700,
                color: 'var(--color-primary)',
                background: 'rgba(37, 99, 235, 0.08)',
                padding: '2px 7px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid rgba(37, 99, 235, 0.2)',
                whiteSpace: 'nowrap',
              }}
            >
              {node.locationCount} {node.locationCount === 1 ? 'Area' : 'Areas'}
            </span>
          )}

          <div style={{ display: 'inline-flex', gap: '2px', background: 'var(--bg-surface-subtle)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            <button
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 6px',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
              onClick={() => onShowQR(node)}
              title="View / Print QR Code"
            >
              <QrCode size={13} />
            </button>
            <button
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 6px',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
              onClick={() => onAddChild(node)}
              title="Add Sub-Section / Node / Rack"
            >
              <Plus size={13} />
            </button>
            <button
              style={{
                background: 'transparent',
                border: 'none',
                padding: '4px 6px',
                borderRadius: 'var(--radius-xs)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
              }}
              onClick={() => onMove(node)}
              title="Move in Hierarchy"
            >
              <Move size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Children branches with clean vertical tree guide line */}
      {hasChildren && expanded && (
        <div
          style={{
            marginLeft: '14px',
            paddingLeft: '14px',
            borderLeft: '1.5px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
            marginTop: '2px',
          }}
        >
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onAddChild={onAddChild}
              onMove={onMove}
              onShowQR={onShowQR}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const OrgHierarchyPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTenant, addToast } = useApp();
  const [tree, setTree] = useState<OrgTreeNode[]>([]);
  const [flatNodes, setFlatNodes] = useState<OrgNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<OrgTreeNode | null>(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<any | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [qrModalNode, setQrModalNode] = useState<OrgTreeNode | OrgNode | null>(null);
  const [parentNode, setParentNode] = useState<OrgTreeNode | null>(null);

  // Form State for creating sub-sections / nodes / racks
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [nodeType, setNodeType] = useState('SUB_DEPARTMENT');
  const [targetParentId, setTargetParentId] = useState('');
  const [autoCreateLocation, setAutoCreateLocation] = useState(true);
  const [locationType, setLocationType] = useState('PRODUCTION_LINE');
  const [riskLevel, setRiskLevel] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('MEDIUM');
  const [auditFrequency, setAuditFrequency] = useState<'DAILY' | 'WEEKLY' | 'FORTNIGHTLY' | 'MONTHLY' | 'QUARTERLY'>('WEEKLY');
  const [ownerId, setOwnerId] = useState('');
  const [building, setBuilding] = useState('Building A');
  const [floor, setFloor] = useState('Ground Floor');
  const [description, setDescription] = useState('');

  const loadTree = async () => {
    if (!currentTenant) return;
    setLoading(true);
    try {
      const [treeData, flatData, usersData] = await Promise.all([
        api.getOrgTree(),
        api.getOrgNodes(),
        api.getUsers().catch(() => []),
      ]);
      setTree(treeData);
      setFlatNodes(flatData);
      setUsers(usersData);
      if (treeData.length > 0 && !selectedNode) {
        setSelectedNode(treeData[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTree();
  }, [currentTenant]);

  // Load detailed node info whenever selection changes
  useEffect(() => {
    if (selectedNode?.id) {
      api.getOrgNodeById(selectedNode.id)
        .then((data) => setSelectedNodeDetails(data))
        .catch(() => setSelectedNodeDetails(null));
    } else {
      setSelectedNodeDetails(null);
    }
  }, [selectedNode]);

  // Compute clean breadcrumb hierarchy trail for selected node
  const selectedBreadcrumbs = useMemo(() => {
    if (!selectedNode || !flatNodes.length) return [];
    const trail: OrgNode[] = [];
    let curr = flatNodes.find((n) => n.id === selectedNode.id);
    while (curr) {
      trail.unshift(curr);
      if (!curr.parentId) break;
      curr = flatNodes.find((n) => n.id === curr!.parentId);
    }
    return trail;
  }, [selectedNode, flatNodes]);

  // Auto-fetch next sequential code from database
  const fetchAutoCode = async (targetType: string, parentId?: string | null) => {
    try {
      const nextCode = await api.getNextOrgNodeCode(targetType, parentId || undefined);
      if (nextCode) {
        setCode(nextCode);
      }
    } catch (e) {
      // Fallback
    }
  };

  const handleOpenAddChild = async (parent: OrgTreeNode | null, defaultType?: string) => {
    setParentNode(parent);
    setName('');
    setDescription('');

    let targetType = 'PLANT';
    if (parent) {
      if (parent.nodeType === 'ENTERPRISE') targetType = 'PLANT';
      else if (parent.nodeType === 'PLANT') targetType = 'DEPARTMENT';
      else if (parent.nodeType === 'DEPARTMENT') targetType = defaultType || 'SUB_DEPARTMENT';
      else if (parent.nodeType === 'SUB_DEPARTMENT') targetType = defaultType || 'PRODUCTION_LINE';
      else if (parent.nodeType === 'PRODUCTION_LINE') targetType = defaultType || 'WORK_CELL';
      else if (parent.nodeType === 'WORK_CELL') targetType = defaultType || 'STORAGE_RACK';
      else targetType = defaultType || 'SUB_SECTION';

      setAutoCreateLocation(true);
    } else {
      targetType = 'PLANT';
      setAutoCreateLocation(false);
    }

    setNodeType(targetType);
    setAddModalOpen(true);
    await fetchAutoCode(targetType, parent?.id);
  };

  const handleCreateNode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code) return;

    try {
      const formattedCode = code.toUpperCase().replace(/\s+/g, '-');
      await api.createOrgNode({
        parentId: parentNode?.id || undefined,
        name,
        code: formattedCode,
        nodeType,
        autoCreateLocation,
        locationType,
        riskLevel,
        auditFrequency,
        ownerId: ownerId || undefined,
        building,
        floor,
        description,
      });

      addToast({
        type: 'success',
        title: `${formatNodeTypeLabel(nodeType)} Created!`,
        message: `'${name}' (${formattedCode}) registered with unique QR code ${autoCreateLocation ? 'and synchronized in Location Directory.' : '.'}`,
      });

      setAddModalOpen(false);
      setName('');
      setCode('');
      setParentNode(null);
      await loadTree();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Creation Failed',
        message: err?.response?.data?.message || 'Failed to create hierarchy node.',
      });
    }
  };

  const handleMoveNode = async () => {
    if (!selectedNode || !targetParentId) return;
    try {
      await api.moveOrgNode(selectedNode.id, targetParentId);
      addToast({
        type: 'success',
        title: 'Hierarchy Restructured',
        message: `Node '${selectedNode.name}' moved successfully. Materialized paths updated.`,
      });
      setMoveModalOpen(false);
      await loadTree();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Move Failed',
        message: err?.response?.data?.message || 'Could not move hierarchy node.',
      });
    }
  };

  const handleDeleteNode = async (id: string, nodeName: string) => {
    if (!window.confirm(`Are you sure you want to delete '${nodeName}'?`)) return;
    try {
      await api.deleteOrgNode(id);
      addToast({
        type: 'success',
        title: 'Node Deleted',
        message: `Node '${nodeName}' removed.`,
      });
      setSelectedNode(null);
      await loadTree();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Deletion Blocked',
        message: err?.response?.data?.message || 'Cannot delete node with active locations.',
      });
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      {/* Top Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Badge variant="info" icon={<FolderTree size={12} />}>
              Enterprise Org Structure
            </Badge>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Plants, Departments, Sub-Departments, Lines, Cells, Racks & Workbenches
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            Organizational Hierarchy & Sub-Section Master
          </h1>
        </div>

        <div className="page-header-actions">
          <Button
            variant="secondary"
            icon={<MapPin size={15} />}
            onClick={() => navigate('/locations')}
          >
            Go to Location Master
          </Button>
          <Button
            variant="primary"
            icon={<Plus size={16} />}
            onClick={() => handleOpenAddChild(null)}
          >
            Add Root Plant / Unit
          </Button>
        </div>
      </div>

      {/* Main Grid: Hierarchy Explorer + Node Inspector */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.4fr) minmax(320px, 1fr)', gap: '18px' }}>
        {/* Left Column: Interactive Tree Explorer */}
        <Card
          title="Organizational Tree & Structure"
          subtitle="Click any unit, department or rack to inspect QR code, 5S status, and sub-units"
        >
          {/* Search bar inside tree */}
          <div style={{ position: 'relative', marginBottom: '14px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              type="text"
              placeholder="Search departments, lines, racks, cells, codes..."
              className="form-control"
              style={{ paddingLeft: '32px', fontSize: '12.5px' }}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {tree.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
              No organizational nodes configured yet. Click "Add Root Plant / Unit" to begin.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '680px', overflowY: 'auto' }}>
              {tree.map((root) => (
                <TreeNodeItem
                  key={root.id}
                  node={root}
                  selectedId={selectedNode?.id || null}
                  onSelect={(n) => setSelectedNode(n)}
                  onAddChild={(parent) => handleOpenAddChild(parent)}
                  onMove={(n) => {
                    setSelectedNode(n);
                    setMoveModalOpen(true);
                  }}
                  onShowQR={(n) => setQrModalNode(n)}
                  searchTerm={searchTerm}
                />
              ))}
            </div>
          )}
        </Card>

        {/* Right Column: Node Inspector & Linked 5S Areas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Card title="Node Inspector & 5S Location Sync" subtitle="Metadata, QR code & linked auditable areas">
            {selectedNode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Node Top Profile Banner */}
                <div
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.06) 0%, rgba(124, 58, 237, 0.06) 100%)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    {getNodeIconContainer(selectedNode.nodeType)}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
                        <Badge variant={getNodeTypeBadgeVariant(selectedNode.nodeType)}>
                          {formatNodeTypeLabel(selectedNode.nodeType)}
                        </Badge>
                        <span className="code-tag" style={{ fontSize: '11px', fontWeight: 700 }}>
                          {selectedNode.code}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedNode.name}
                      </h3>
                    </div>
                  </div>

                  {/* QR Trigger Button */}
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<QrCode size={14} />}
                    onClick={() => setQrModalNode(selectedNode)}
                    style={{ background: '#FFFFFF', flexShrink: 0 }}
                  >
                    View QR
                  </Button>
                </div>

                {/* Materialized Hierarchy Breadcrumb Navigation */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <span style={{ color: 'var(--text-tertiary)', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Hierarchy Path & Location
                  </span>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexWrap: 'wrap',
                      background: 'var(--bg-surface-subtle)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '12px',
                    }}
                  >
                    {selectedBreadcrumbs.map((crumb, idx) => (
                      <React.Fragment key={crumb.id}>
                        {idx > 0 && <ChevronRight size={12} color="var(--text-tertiary)" />}
                        <span
                          onClick={() => setSelectedNode(tree.find((t) => t.id === crumb.id) || (crumb as any))}
                          style={{
                            fontWeight: idx === selectedBreadcrumbs.length - 1 ? 700 : 500,
                            color: idx === selectedBreadcrumbs.length - 1 ? 'var(--color-primary)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          {crumb.name}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Structured 2-box metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div style={{ padding: '10px 12px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Hierarchy Tier
                    </span>
                    <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                      Tier Level {selectedNode.depth} • {formatNodeTypeLabel(selectedNode.nodeType)}
                    </strong>
                  </div>

                  <div style={{ padding: '10px 12px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ color: 'var(--text-tertiary)', display: 'block', fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                      Auditable Areas
                    </span>
                    <strong style={{ fontSize: '13px', color: 'var(--color-primary)' }}>
                      {selectedNode.locationCount} {selectedNode.locationCount === 1 ? '5S Workstation' : '5S Workstations'}
                    </strong>
                  </div>
                </div>

                {/* Linked 5S Locations in Master Directory */}
                {selectedNodeDetails?.locations && selectedNodeDetails.locations.length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                        Linked Locations & Racks ({selectedNodeDetails.locations.length})
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<ExternalLink size={12} />}
                        onClick={() => navigate('/locations')}
                        style={{ fontSize: '11px' }}
                      >
                        Open Directory
                      </Button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {selectedNodeDetails.locations.map((loc: Location) => (
                        <div
                          key={loc.id}
                          style={{
                            padding: '8px 12px',
                            background: 'var(--bg-surface-subtle)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            fontSize: '12px',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{loc.name}</div>
                            <span className="code-tag" style={{ fontSize: '10px' }}>{loc.areaCode}</span>
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => navigate(`/locations/${loc.id}`)}
                            style={{ fontSize: '11px', padding: '2px 8px' }}
                          >
                            Details
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Add Sub-Section Buttons */}
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
                    Quick Create Under This Node
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Archive size={13} />}
                      onClick={() => handleOpenAddChild(selectedNode, 'STORAGE_RACK')}
                    >
                      + Add Storage Rack
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Boxes size={13} />}
                      onClick={() => handleOpenAddChild(selectedNode, 'WORK_CELL')}
                    >
                      + Add Work Cell
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Wrench size={13} />}
                      onClick={() => handleOpenAddChild(selectedNode, 'WORKBENCH')}
                    >
                      + Add Workbench
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<MapPin size={13} />}
                      onClick={() => handleOpenAddChild(selectedNode, 'SUB_SECTION')}
                    >
                      + Add Sub-Section
                    </Button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px', paddingTop: '14px', borderTop: '1px solid var(--border-subtle)' }}>
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<Plus size={14} />}
                    onClick={() => handleOpenAddChild(selectedNode)}
                  >
                    Add Custom Sub-Node
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 size={14} />}
                    onClick={() => handleDeleteNode(selectedNode.id, selectedNode.name)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', textAlign: 'center', padding: '30px 0' }}>
                Select an organizational node from the tree to view properties and generate QR code.
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: ADD SUB-SECTION / NODE / RACK */}
      {/* ========================================================================= */}
      {addModalOpen && (
        <Modal
          isOpen={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          title={
            parentNode
              ? `Add Sub-Section / Node / Rack under '${parentNode.name}'`
              : 'Add Root Plant / Enterprise Unit'
          }
          subtitle="Configures a nested tier in the hierarchy and optionally registers it in the Location Master Directory"
          maxWidth="640px"
        >
          <form onSubmit={handleCreateNode} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {parentNode && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '12.5px' }}>
                <strong>Parent Node:</strong> {parentNode.name} ({parentNode.code}) — {formatNodeTypeLabel(parentNode.nodeType)}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '12px' }}>
              <div>
                <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  Section / Node Name *
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. High-Bay Storage Rack A1 / CNC Cell 02"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                  Node Code *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. RACK-A1 / CELL-02"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => fetchAutoCode(nodeType, parentNode?.id)}
                    style={{
                      position: 'absolute',
                      right: '6px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '2px 6px',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                    }}
                    title="Refresh auto-generated sequential code"
                  >
                    Auto
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Classification Tier (How it is called in Industry) *
              </label>
              <select
                className="form-control"
                value={nodeType}
                onChange={(e) => {
                  const newType = e.target.value;
                  setNodeType(newType);
                  fetchAutoCode(newType, parentNode?.id);
                }}
              >
                <option value="DEPARTMENT">Department (Machining, Assembly, Warehouse, Quality)</option>
                <option value="SUB_DEPARTMENT">Sub-Department (SMD Prep, Sub-Assembly, Receiving)</option>
                <option value="PRODUCTION_LINE">Production Line (Line 01, SMT Line 02, Final Pack)</option>
                <option value="WORK_CELL">Work Cell (CNC Milling Cell, Welding Cell, Kitting Bay)</option>
                <option value="BAY_STATION">Bay / Station (Station A, Inspection Bay 03)</option>
                <option value="STORAGE_RACK">Storage Rack / Shelf (Raw Material Rack, Tool Storage)</option>
                <option value="WORKBENCH">Workbench / Operator Desk (Assembly Bench 04)</option>
                <option value="SUB_SECTION">Sub-Section / Material Bay (Chemical Bay, Staging Area)</option>
                <option value="QUARANTINE_ZONE">Quarantine Zone (Red Tag Holding Bay)</option>
                <option value="PLANT">Plant / Physical Factory Site</option>
                <option value="DIVISION">Business Division / Operational Unit</option>
                <option value="ENTERPRISE">Enterprise / Group</option>
              </select>
            </div>

            {/* Sync with Location Master Checkbox */}
            <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(16, 185, 129, 0.05) 100%)', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: autoCreateLocation ? '12px' : 0 }}>
                <input
                  type="checkbox"
                  id="autoLocCheck"
                  checked={autoCreateLocation}
                  onChange={(e) => setAutoCreateLocation(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="autoLocCheck" style={{ fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
                  Register as Auditable 5S Area Master & Generate QR in Location Directory
                </label>
              </div>

              {autoCreateLocation && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 600 }}>Location Type</label>
                      <select className="form-control" value={locationType} onChange={(e) => setLocationType(e.target.value)}>
                        <option value="PRODUCTION_LINE">Production Line / Cell</option>
                        <option value="WAREHOUSE_BAY">Warehouse Bay / Rack</option>
                        <option value="WORKSHOP">Workshop / Workbench</option>
                        <option value="LABORATORY">Laboratory / Cleanroom</option>
                        <option value="RED_TAG_ZONE">Red Tag Quarantine Zone</option>
                        <option value="OFFICE_FLOOR">Office / Admin Floor</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 600 }}>5S Audit Frequency</label>
                      <select className="form-control" value={auditFrequency} onChange={(e) => setAuditFrequency(e.target.value as any)}>
                        <option value="DAILY">Daily (Kamishibai)</option>
                        <option value="WEEKLY">Weekly Routine</option>
                        <option value="FORTNIGHTLY">Fortnightly</option>
                        <option value="MONTHLY">Monthly Steering</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 600 }}>Risk Level</label>
                      <select className="form-control" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as any)}>
                        <option value="LOW">Low Risk</option>
                        <option value="MEDIUM">Medium Risk</option>
                        <option value="HIGH">High Risk</option>
                        <option value="CRITICAL">Critical Risk</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '11.5px', fontWeight: 600 }}>Area Owner / Lead</label>
                      <select className="form-control" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                        <option value="">-- Assign Area Owner --</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.firstName} {u.lastName} ({u.jobTitle || 'Team Member'})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
              <Button type="button" variant="secondary" onClick={() => setAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon={<Plus size={15} />}>
                Create Section & Generate QR
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: PRINTABLE QR CODE POSTER */}
      {/* ========================================================================= */}
      {qrModalNode && (
        <Modal
          isOpen={Boolean(qrModalNode)}
          onClose={() => setQrModalNode(null)}
          title={`QR Code Label: ${qrModalNode.name}`}
          maxWidth="520px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            {/* Printable QR Card */}
            <div
              id="printable-qr-card"
              className="printable-poster-card"
              style={{
                width: '100%',
                border: '4px solid var(--color-primary)',
                borderRadius: '12px',
                background: '#FFFFFF',
                padding: '24px',
                textAlign: 'center',
                boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
              }}
            >
              <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-primary)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                SKILGLOBAL 5S VISUAL MANAGEMENT SYSTEM
              </div>

              <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b', margin: '6px 0 2px 0' }}>
                {qrModalNode.name}
              </h2>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', margin: '6px 0 14px 0' }}>
                <Badge variant="purple">{formatNodeTypeLabel(qrModalNode.nodeType)}</Badge>
                <span className="code-tag" style={{ fontSize: '11px', fontWeight: 700 }}>
                  {qrModalNode.code}
                </span>
              </div>

              {/* QR Image */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                {qrModalNode.qrCodeData ? (
                  <img
                    src={qrModalNode.qrCodeData}
                    alt="QR Code"
                    style={{ width: '180px', height: '180px', border: '2px solid #000', borderRadius: '8px' }}
                  />
                ) : (
                  <div style={{ width: '180px', height: '180px', border: '2px dashed var(--border-subtle)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <QrCode size={64} color="var(--text-tertiary)" />
                  </div>
                )}
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Scan with SkilGlobal 5S Mobile App to execute routine audit, log red tags, or verify visual standards.
              </div>

              <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '14px', paddingTop: '10px', fontSize: '10.5px', color: 'var(--text-tertiary)' }}>
                Materialized Path: {qrModalNode.path || `/${qrModalNode.code}/`}
              </div>
            </div>

            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%' }}>
              <Button variant="secondary" onClick={() => setQrModalNode(null)}>
                Close
              </Button>
              <Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()}>
                Print QR Label Poster
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: MOVE NODE */}
      {/* ========================================================================= */}
      {moveModalOpen && selectedNode && (
        <Modal
          isOpen={moveModalOpen}
          onClose={() => setMoveModalOpen(false)}
          title={`Move '${selectedNode.name}' in Hierarchy`}
          subtitle="Select the new parent node. All child nodes, racks, and materialized paths will automatically update."
          maxWidth="540px"
        >
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700 }}>Select New Parent Unit *</label>
            <select
              className="form-control"
              value={targetParentId}
              onChange={(e) => setTargetParentId(e.target.value)}
            >
              <option value="">-- Choose New Parent --</option>
              {flatNodes
                .filter((n) => n.id !== selectedNode.id)
                .map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.code}) — {formatNodeTypeLabel(n.nodeType)}
                  </option>
                ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
            <Button variant="secondary" onClick={() => setMoveModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleMoveNode} disabled={!targetParentId}>
              Confirm Move
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
};
