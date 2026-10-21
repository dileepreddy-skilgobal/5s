import { values } from '../../core/validation/domain-values';

/**
 * Organization unit types.
 *
 * A tenant names its own hierarchy levels in settings (Tenant.hierarchyConfig, e.g. ["Org", "Country", "Region",
 * "Plant", "Department", "Area", "Zone", "Workstation"]). Each level becomes a node type code ("Business unit" →
 * "BUSINESS_UNIT"). The built-in types stay accepted so units created before the levels were configured remain
 * editable and importable.
 */

export interface NodeTypeOption {
  /** Stored OrgNode.nodeType value. */
  code: string;
  /** Display name: the tenant's own wording for configured levels. */
  label: string;
  /** True for the tenant's configured hierarchy levels; false for built-in types. */
  configured: boolean;
  /** Position in the configured hierarchy (0 = top); null for built-in types that are not a configured level. */
  level: number | null;
}

/** Display names of the built-in node types. */
const BUILT_IN_LABELS: Record<string, string> = {
  ENTERPRISE: 'Enterprise / group',
  BUSINESS_UNIT: 'Business unit',
  COUNTRY: 'Country',
  REGION: 'Region',
  PLANT: 'Plant / site',
  DIVISION: 'Division',
  DEPARTMENT: 'Department',
  SUB_DEPARTMENT: 'Sub-department',
  AREA: 'Area',
  ZONE: 'Zone',
  WORKSTATION: 'Workstation',
  PRODUCTION_LINE: 'Production line',
  WORK_CELL: 'Work cell',
  BAY_STATION: 'Bay / station',
  STORAGE_RACK: 'Storage rack / shelf',
  WORKBENCH: 'Workbench / desk',
  SUB_SECTION: 'Sub-section',
  QUARANTINE_ZONE: 'Quarantine zone',
};

/** Hierarchy level names that mean the built-in top-level type. */
const LEVEL_ALIASES: Record<string, string> = { ORG: 'ENTERPRISE', ORGANIZATION: 'ENTERPRISE', ORGANISATION: 'ENTERPRISE', COMPANY: 'ENTERPRISE', GROUP: 'ENTERPRISE', SITE: 'PLANT' };

/** Node type codes: upper-case letters, digits and underscores, starting with a letter. */
export const NODE_TYPE_CODE_REGEX = /^[A-Z][A-Z0-9_]{0,39}$/;

/** "Business unit" → "BUSINESS_UNIT"; "Org" → "ENTERPRISE". Returns '' when nothing usable is left. */
export const nodeTypeCodeFor = (levelName: string): string => {
  const code = levelName
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/^[^A-Z]+/, '')
    .slice(0, 40);
  return LEVEL_ALIASES[code] ?? code;
};

/** Parses Tenant.hierarchyConfig (JSON array of level names); anything unreadable gives no configured levels. */
export const parseHierarchyLevels = (raw: string | null | undefined): string[] => {
  try {
    const parsed: unknown = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()) : [];
  } catch {
    return [];
  }
};

/** Configured levels first (in hierarchy order), then the built-in types not already covered. */
export const nodeTypeOptions = (hierarchyConfig: string | null | undefined): NodeTypeOption[] => {
  const options: NodeTypeOption[] = [];
  const seen = new Set<string>();
  parseHierarchyLevels(hierarchyConfig).forEach((name, level) => {
    const code = nodeTypeCodeFor(name);
    if (!code || !NODE_TYPE_CODE_REGEX.test(code) || seen.has(code)) return;
    seen.add(code);
    options.push({ code, label: name, configured: true, level });
  });
  for (const code of values('ORG_NODE_TYPES')) {
    if (seen.has(code)) continue;
    seen.add(code);
    options.push({ code, label: BUILT_IN_LABELS[code] ?? code.replace(/_/g, ' ').toLowerCase(), configured: false, level: null });
  }
  return options;
};

export const isAllowedNodeType = (hierarchyConfig: string | null | undefined, nodeType: string): boolean =>
  nodeTypeOptions(hierarchyConfig).some((o) => o.code === nodeType);
