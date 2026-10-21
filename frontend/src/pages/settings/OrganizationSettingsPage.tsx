import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { getApiErrorMessage } from '../../services/api';
import { adminApi } from '../../services/api-admin';
import { useApp } from '../../context/AppContext';
import { primeSettingsCache } from '../../hooks/useTerminology';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { FormField } from '../../components/ui/FormField';
import { LoadingState, ErrorState } from '../../components/ui/StateViews';
import { AdminOrganizationSettings as OrganizationSettings, AdminTenantSettings as TenantSettings } from '../../types/admin';
import {
  SECTION_LABELS,
  SECTION_ORDER,
  SectionId,
  applySection,
  buildSectionPayload,
  cloneSettings,
  isSectionDirty,
  isSectionId,
  validateSection,
} from './settingsModel';
import { SectionCard } from './SettingsFields';
import {
  CapaSection,
  CompetencySection,
  EscalationSection,
  GeneralSection,
  NumberingSection,
  RecognitionSection,
  ScoringSection,
  SectionBodyProps,
  SlaSection,
  TerminologySection,
} from './SettingsSections';
import { AnalyticsSettingsSection } from './AnalyticsSettingsSection';
import { SecuritySection } from './SecuritySettingsSection';
import { OrganizationLogoCard } from './OrganizationLogoCard';

const SECTION_META: Record<SectionId, { subtitle: string; Body: React.FC<SectionBodyProps> }> = {
  general: { subtitle: 'Default language and audit frequency, and the names of your hierarchy levels.', Body: GeneralSection },
  scoring: { subtitle: 'How audit scores are calculated and judged.', Body: ScoringSection },
  sla: { subtitle: 'Default corrective-action deadlines by finding severity.', Body: SlaSection },
  escalation: { subtitle: 'Who is reminded, and when, as actions and audits fall behind; daily digests.', Body: EscalationSection },
  capa: { subtitle: 'Closure evidence rules for corrective actions.', Body: CapaSection },
  numbering: { subtitle: 'Prefixes used when new document numbers are generated.', Body: NumberingSection },
  terminology: { subtitle: 'Labels shown to your users for core concepts.', Body: TerminologySection },
  competency: { subtitle: 'Auditor certification, quiz pass mark and certificate details.', Body: CompetencySection },
  analytics: { subtitle: 'Repeat detection, maturity bands and internal certification rules.', Body: AnalyticsSettingsSection },
  recognition: { subtitle: 'Optional points, badges, trophies, kudos and leaderboards.', Body: RecognitionSection },
  security: { subtitle: 'Sign-in protection for your organization.', Body: SecuritySection },
};

/** True while the viewport is at most `px` wide (the section list becomes a select there). */
const useIsNarrow = (px: number) => {
  const query = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setNarrow(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return narrow;
};

export const OrganizationSettingsPage: React.FC = () => {
  const { addToast, can, refreshSession } = useApp();
  const [saved, setSaved] = useState<OrganizationSettings | null>(null);
  const [draft, setDraft] = useState<OrganizationSettings | null>(null);
  const [defaults, setDefaults] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // ?section=<id> opens a section directly (links from the go-live checklist)
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get('section');
  const [activeTab, setActiveTabState] = useState<SectionId>(isSectionId(requestedSection) ? requestedSection : 'general');
  const setActiveTab = (id: SectionId) => {
    setActiveTabState(id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('section', id);
        return next;
      },
      { replace: true },
    );
  };
  const [savingSection, setSavingSection] = useState<SectionId | null>(null);
  // Confirmations (replace window.confirm)
  const [resetTarget, setResetTarget] = useState<SectionId | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const isNarrow = useIsNarrow(768);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [current, platformDefaults] = await Promise.all([adminApi.getSettings(), adminApi.getDefaultSettings()]);
      setSaved(current);
      setDraft(cloneSettings(current));
      setDefaults(platformDefaults);
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'Could not load organization settings.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback((mutate: (d: OrganizationSettings) => void) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = cloneSettings(prev);
      mutate(next);
      return next;
    });
  }, []);

  const dirtyBySection = useMemo(() => {
    const out = {} as Record<SectionId, boolean>;
    SECTION_ORDER.forEach((id) => {
      out[id] = !!draft && !!saved && isSectionDirty(id, draft, saved);
    });
    return out;
  }, [draft, saved]);

  const errors = useMemo(() => (draft ? validateSection(activeTab, draft) : []), [draft, activeTab]);

  const persist = async (id: SectionId, payload: ReturnType<typeof buildSectionPayload>, successMessage: string) => {
    setSavingSection(id);
    try {
      const result = await adminApi.updateSettings(payload);
      setSaved(result);
      // Keep unsaved edits of other sections; take this section from the server's effective values
      setDraft((prev) => (prev ? applySection(id, prev, result) : cloneSettings(result)));
      primeSettingsCache(result);
      addToast({ type: 'success', title: `${SECTION_LABELS[id]} settings saved`, message: successMessage });
      // A changed MFA policy can affect the signed-in admin straight away (mandatory enrolment)
      if (id === 'security') refreshSession().catch(() => undefined);
    } catch (err) {
      addToast({ type: 'error', title: 'Settings not saved', message: getApiErrorMessage(err, 'Could not save organization settings.') });
    } finally {
      setSavingSection(null);
    }
  };

  const handleSave = (id: SectionId) => {
    if (!draft) return;
    const problems = validateSection(id, draft);
    if (problems.length > 0) {
      addToast({ type: 'warning', title: 'Check the highlighted values', message: problems[0] });
      return;
    }
    persist(
      id,
      buildSectionPayload(id, draft),
      id === 'security' ? 'The security policy applies from the next request.' : 'Changes apply to new records from now on.',
    );
  };

  const handleReset = (id: SectionId) => {
    if (!defaults) return;
    setResetTarget(id);
  };

  const confirmReset = () => {
    const id = resetTarget;
    setResetTarget(null);
    if (!id || !defaults) return;
    // Hierarchy level names have no platform default and are left as they are
    persist(id, buildSectionPayload(id, defaults, { includeHierarchy: false }), 'Section restored to the platform defaults.');
  };

  const anyDirty = SECTION_ORDER.some((id) => dirtyBySection[id]);
  const { subtitle, Body } = SECTION_META[activeTab];

  const sectionNav = isNarrow ? (
    <FormField label="Settings section">
      {(control) => (
        <select {...control} className="form-select" value={activeTab} onChange={(e) => setActiveTab(e.target.value as SectionId)}>
          {SECTION_ORDER.map((id) => (
            <option key={id} value={id}>
              {SECTION_LABELS[id]}
              {dirtyBySection[id] ? ' (unsaved changes)' : ''}
            </option>
          ))}
        </select>
      )}
    </FormField>
  ) : (
    <nav aria-label="Settings sections" className="card" style={{ padding: '8px', position: 'sticky', top: '16px' }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {SECTION_ORDER.map((id) => {
          const active = id === activeTab;
          return (
            <li key={id}>
              <button
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => setActiveTab(id)}
                style={{
                  width: '100%',
                  minHeight: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '8px 12px',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  background: active ? 'var(--color-primary-light)' : 'transparent',
                  boxShadow: active ? 'inset 3px 0 0 var(--color-primary)' : 'none',
                  color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
                  font: 'inherit',
                  fontSize: '14px',
                  fontWeight: active ? 600 : 500,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span>{SECTION_LABELS[id]}</span>
                {dirtyBySection[id] && (
                  <span title="Unsaved changes" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-warning)', flexShrink: 0 }}>
                    <span className="sr-only">Unsaved changes</span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Organization settings"
        description="Every value has a working default; change only what your organization needs."
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw size={16} />}
            disabled={loading || savingSection !== null}
            onClick={() => {
              if (anyDirty) {
                setConfirmReload(true);
                return;
              }
              load();
            }}
          >
            Reload
          </Button>
        }
      />

      {loading && !draft ? (
        <Card>
          <LoadingState label="Loading settings…" />
        </Card>
      ) : loadError || !draft || !saved ? (
        <Card>
          <ErrorState message={loadError || 'Settings are unavailable.'} onRetry={load} />
        </Card>
      ) : (
        <div className="grid" style={isNarrow ? { gridTemplateColumns: 'minmax(0, 1fr)', gap: '16px' } : { gridTemplateColumns: '220px minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
          {sectionNav}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', minWidth: 0 }}>
            <SectionCard
              title={SECTION_LABELS[activeTab]}
              subtitle={subtitle}
              dirty={dirtyBySection[activeTab]}
              errors={errors}
              saving={savingSection === activeTab}
              onSave={() => handleSave(activeTab)}
              onReset={() => handleReset(activeTab)}
              resetDisabled={!defaults}
            >
              <Body draft={draft} update={update} />
            </SectionCard>
            {activeTab === 'general' && can('ORG_ADMINS') && <OrganizationLogoCard />}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={resetTarget !== null}
        title="Reset section to default?"
        message={`Reset the ${resetTarget ? SECTION_LABELS[resetTarget] : ''} section to the platform defaults? Unsaved changes in this section are discarded.`}
        confirmLabel="Reset section"
        tone="danger"
        onConfirm={confirmReset}
        onCancel={() => setResetTarget(null)}
      />
      <ConfirmDialog
        isOpen={confirmReload}
        title="Discard unsaved changes?"
        message="Discard unsaved changes and reload the saved settings?"
        confirmLabel="Discard and reload"
        tone="danger"
        onConfirm={() => {
          setConfirmReload(false);
          load();
        }}
        onCancel={() => setConfirmReload(false)}
      />
    </div>
  );
};
