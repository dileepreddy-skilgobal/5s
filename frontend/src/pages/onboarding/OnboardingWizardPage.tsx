import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { getApiErrorMessage } from '../../services/api';
import { adminApi } from '../../services/api-admin';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { FormField } from '../../components/ui/FormField';
import { Check, CheckCircle2, Building2, Layers, ArrowRight, ArrowLeft, Factory, Plus, Trash2, KeyRound } from 'lucide-react';
import { TenantLogoUploader } from '../../components/common/TenantLogoUploader';

const FORM_ID = 'onboarding-step-form';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const INDUSTRIES = [
  { value: 'Discrete Manufacturing', label: 'Discrete manufacturing (automotive, machinery, electronics)' },
  { value: 'Process & Chemical', label: 'Process manufacturing, pharma and chemicals' },
  { value: 'Warehousing & Logistics', label: 'Warehousing and logistics' },
  { value: 'Healthcare Facilities', label: 'Healthcare and hospitals' },
  { value: 'Offices & Corporate', label: 'Offices and corporate facilities' },
];

const STEPS = [
  { num: 1, title: 'Organization' },
  { num: 2, title: 'Sites' },
  { num: 3, title: 'Departments' },
  { num: 4, title: 'Administrator' },
  { num: 5, title: 'Review' },
];
const LAST_STEP = STEPS.length;

type FieldErrors = Partial<Record<'orgName' | 'orgSlug' | 'sites' | 'departments' | 'adminName' | 'adminEmail', string>>;

interface OnboardingResult {
  tenantSlug: string;
  adminEmail: string;
  adminTemporaryPassword?: string;
  sitesCreated: number;
  departmentsCreated: number;
  starterTemplateCreated: boolean;
  starterStandardsCreated: number;
}

/** A checkbox with a title and an explanation, used for the optional starter content. */
const OptionCheckbox: React.FC<{ id: string; checked: boolean; onChange: (checked: boolean) => void; title: string; description: string }> = ({
  id,
  checked,
  onChange,
  title,
  description,
}) => (
  <label
    htmlFor={id}
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      padding: '12px 16px',
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
      background: checked ? 'var(--bg-pale)' : 'var(--bg-surface)',
      cursor: 'pointer',
    }}
  >
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: 'var(--color-primary)', flexShrink: 0 }}
    />
    <span>
      <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</span>
      <span style={{ display: 'block', fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.45 }}>{description}</span>
    </span>
  </label>
);

const termStyle: React.CSSProperties = { fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '2px' };
const definitionStyle: React.CSSProperties = { margin: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflowWrap: 'anywhere' };
const definitionHintStyle: React.CSSProperties = { margin: '2px 0 0', fontSize: '13px', color: 'var(--text-secondary)', overflowWrap: 'anywhere' };

/** Heading of the current wizard step. */
const StepHeading: React.FC<{ step: number; title: string; children: React.ReactNode }> = ({ step, title, children }) => (
  <div>
    <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.5 }}>
      <span className="sr-only">
        Step {step} of {LAST_STEP}.{' '}
      </span>
      {children}
    </p>
  </div>
);

/** Editable list of names (sites, departments) with an add field. */
const NameList: React.FC<{
  label: string;
  placeholder: string;
  addLabel: string;
  items: string[];
  onChange: (items: string[]) => void;
  icon: React.ReactNode;
  error?: string;
}> = ({ label, placeholder, addLabel, items, onChange, icon, error }) => {
  const [input, setInput] = useState('');
  const add = () => {
    const value = input.trim();
    if (!value) return;
    if (!items.some((i) => i.toLowerCase() === value.toLowerCase())) onChange([...items, value]);
    setInput('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <FormField label={label} required error={error} style={{ margin: 0 }}>
        {(control) => (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              {...control}
              type="text"
              className="form-input"
              style={{ flex: '1 1 200px', minWidth: 0 }}
              placeholder={placeholder}
              value={input}
              maxLength={120}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <Button type="button" variant="secondary" icon={<Plus size={16} />} onClick={add} disabled={!input.trim()}>
              {addLabel}
            </Button>
          </div>
        )}
      </FormField>
      {items.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((item, idx) => (
            <li
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '6px 6px 6px 14px',
                minHeight: '44px',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, fontSize: '14px', color: 'var(--text-primary)' }}>
                {icon}
                <span style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{item}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remove ${item}`}
                icon={<Trash2 size={16} aria-hidden="true" />}
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
                style={{ color: 'var(--color-danger)' }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Wizard progress: completed steps get a blue check, the current step a filled blue number. */
const Stepper: React.FC<{ current: number }> = ({ current }) => (
  <nav aria-label="Progress">
    <ol
      style={{
        listStyle: 'none',
        margin: 0,
        padding: '12px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))',
        gap: '8px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {STEPS.map((s) => {
        const isActive = current === s.num;
        const isDone = current > s.num;
        return (
          <li
            key={s.num}
            aria-current={isActive ? 'step' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: 'var(--radius-md)',
              background: isActive ? 'var(--bg-pale)' : 'transparent',
              boxShadow: isActive ? 'inset 0 0 0 1px var(--color-info-border)' : 'none',
              minWidth: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: 'var(--radius-full)',
                background: isDone || isActive ? 'var(--color-primary)' : 'var(--bg-surface)',
                border: `1px solid ${isDone || isActive ? 'var(--color-primary)' : 'var(--border-strong)'}`,
                color: isDone || isActive ? 'var(--text-on-primary)' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {isDone ? <Check size={16} /> : s.num}
            </span>
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Step {s.num}</span>
              <span
                style={{
                  fontSize: '13.5px',
                  fontWeight: 600,
                  color: isActive ? 'var(--color-primary)' : isDone ? 'var(--text-primary)' : 'var(--text-secondary)',
                  overflowWrap: 'anywhere',
                }}
              >
                {s.title}
                {isDone && <span className="sr-only"> (complete)</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  </nav>
);

export const OnboardingWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { refreshTenants, addToast } = useApp();

  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  // Wizard form state (starts empty; the platform admin enters the real organization)
  const [orgName, setOrgName] = useState('');
  const [orgSlug, setOrgSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [industry, setIndustry] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [sites, setSites] = useState<string[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  // Optional starter content (BRD onboarding: select a standard 5S template, upload workplace standards)
  const [starterTemplate, setStarterTemplate] = useState(true);
  const [starterStandards, setStarterStandards] = useState(true);

  const validateStep = (step: number): FieldErrors => {
    const e: FieldErrors = {};
    if (step === 1) {
      if (!orgName.trim()) e.orgName = 'Enter the organization name.';
      if (!orgSlug.trim()) e.orgSlug = 'Enter an organization code.';
      else if (!SLUG_PATTERN.test(orgSlug)) e.orgSlug = 'Use lower-case letters, digits and single hyphens only.';
    }
    if (step === 2 && sites.length === 0) e.sites = 'Add at least one site.';
    if (step === 3 && departments.length === 0) e.departments = 'Add at least one department.';
    if (step === 4) {
      if (!adminName.trim()) e.adminName = "Enter the administrator's name.";
      if (!adminEmail.trim()) e.adminEmail = "Enter the administrator's email address.";
      else if (!EMAIL_PATTERN.test(adminEmail.trim())) e.adminEmail = 'Enter a valid email address.';
    }
    return e;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    const stepErrors = validateStep(currentStep);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    if (currentStep < LAST_STEP) {
      setCurrentStep(currentStep + 1);
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminApi.executeOnboarding({
        orgName: orgName.trim(),
        orgSlug,
        industry: industry || undefined,
        logoUrl: logoUrl || undefined,
        sites,
        departments,
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim().toLowerCase(),
        starterTemplate,
        starterStandards,
      });
      setResult({
        tenantSlug: res.tenantSlug,
        adminEmail: res.adminEmail,
        adminTemporaryPassword: res.adminTemporaryPassword,
        sitesCreated: res.sitesCreated,
        departmentsCreated: res.departmentsCreated,
        starterTemplateCreated: res.starterTemplateCreated === true,
        starterStandardsCreated: res.starterStandardsCreated ?? 0,
      });
      await refreshTenants();
      addToast({ type: 'success', title: 'Organization created', message: `${orgName.trim()} has been set up.` });
    } catch (err) {
      addToast({ type: 'error', title: 'Organization not created', message: getApiErrorMessage(err, 'The organization could not be created.') });
    } finally {
      setSubmitting(false);
    }
  };

  const breadcrumbs = [{ label: 'Organizations', to: '/super-admin' }, { label: 'New organization' }];

  if (result) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '760px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <PageHeader breadcrumbs={breadcrumbs} title="Organization created" description="The organization, its sites and departments and its first administrator are ready." />
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span
                aria-hidden="true"
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-success-bg)',
                  color: 'var(--color-success)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <CheckCircle2 size={22} />
              </span>
              <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, overflowWrap: 'anywhere' }}>
                {orgName.trim()} has been created
              </h2>
            </div>

            <dl
              style={{
                margin: 0,
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                gap: '16px',
              }}
            >
              <div>
                <dt style={termStyle}>Organization code</dt>
                <dd style={definitionStyle}>
                  <span className="code-tag">{result.tenantSlug}</span>
                </dd>
              </div>
              <div>
                <dt style={termStyle}>Administrator</dt>
                <dd style={definitionStyle}>{result.adminEmail}</dd>
              </div>
              <div>
                <dt style={termStyle}>Created</dt>
                <dd style={definitionStyle}>
                  {result.sitesCreated} site{result.sitesCreated === 1 ? '' : 's'}, {result.departmentsCreated} department{result.departmentsCreated === 1 ? '' : 's'}
                </dd>
                {(result.starterTemplateCreated || result.starterStandardsCreated > 0) && (
                  <dd style={definitionHintStyle}>
                    {[
                      result.starterTemplateCreated ? 'starter 6S checklist' : null,
                      result.starterStandardsCreated > 0 ? `${result.starterStandardsCreated} draft standard${result.starterStandardsCreated === 1 ? '' : 's'}` : null,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </dd>
                )}
              </div>
            </dl>

            <div>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 6px' }}>Next steps for the administrator</h3>
              <ol style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <li>Sign in and open the go-live checklist on the home page.</li>
                <li>Confirm the scoring rules (pass mark, scoring method) and the action deadlines and escalation ladder in Settings.</li>
                <li>Add areas and owners, invite the team and nominate auditors.</li>
                {result.starterStandardsCreated > 0 && <li>Review the draft standards, add reference photos and approve them.</li>}
                {result.starterTemplateCreated && <li>Adapt the starter checklist if needed, then schedule the first audits.</li>}
              </ol>
            </div>

            {result.adminTemporaryPassword ? (
              <div
                role="status"
                style={{
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-warning-bg)',
                  border: '1px solid var(--color-warning-border)',
                  fontSize: '13px',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                }}
              >
                <KeyRound size={18} aria-hidden="true" style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: '1px' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Temporary administrator password (shown only once)</div>
                  <code
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '14px',
                      userSelect: 'all',
                      overflowWrap: 'anywhere',
                      color: 'var(--text-primary)',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 8px',
                      display: 'inline-block',
                    }}
                  >
                    {result.adminTemporaryPassword}
                  </code>
                  <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Share it securely with {result.adminEmail}. It cannot be shown again.
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                An account with this email already existed in the organization, so no new password was created.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)' }}>
              <Button variant="primary" icon={<Building2 size={16} />} onClick={() => navigate('/super-admin')}>
                Back to organizations
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '880px', width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title="New organization"
        description="Create an organization with its sites, departments and first administrator."
      />

      <Stepper current={currentStep} />

      <Card>
        <form id={FORM_ID} noValidate onSubmit={handleSubmit}>
          {currentStep === 1 && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <StepHeading step={1} title="Organization">
                The organization's name, sign-in code and industry.
              </StepHeading>

              <div className="grid grid-cols-2" style={{ gap: '16px' }}>
                <FormField label="Organization name" required error={errors.orgName} style={{ margin: 0 }}>
                  {(control) => (
                    <input
                      {...control}
                      type="text"
                      className="form-input"
                      placeholder="Company or site name"
                      value={orgName}
                      maxLength={120}
                      onChange={(e) => {
                        setOrgName(e.target.value);
                        if (!slugEdited) setOrgSlug(toSlug(e.target.value));
                      }}
                    />
                  )}
                </FormField>

                <FormField
                  label="Organization code"
                  required
                  error={errors.orgSlug}
                  hint="Users enter this code at sign-in when their email belongs to more than one organization."
                  style={{ margin: 0 }}
                >
                  {(control) => (
                    <input
                      {...control}
                      type="text"
                      className="form-input"
                      placeholder="e.g. acme-pune"
                      value={orgSlug}
                      maxLength={60}
                      onChange={(e) => {
                        setSlugEdited(true);
                        setOrgSlug(e.target.value.toLowerCase());
                      }}
                    />
                  )}
                </FormField>
              </div>

              <FormField label="Industry (optional)" style={{ margin: 0 }}>
                {(control) => (
                  <select {...control} className="form-select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                    <option value="">Select an industry</option>
                    {INDUSTRIES.map((i) => (
                      <option key={i.value} value={i.value}>
                        {i.label}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>

              <TenantLogoUploader value={logoUrl} onChange={setLogoUrl} label="Organization logo" />
            </div>
          )}

          {currentStep === 2 && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <StepHeading step={2} title="Sites">
                The plants or facilities where 5S audits will take place.
              </StepHeading>
              <NameList
                label="Sites"
                placeholder="Site or plant name"
                addLabel="Add site"
                items={sites}
                onChange={setSites}
                icon={<Factory size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />}
                error={errors.sites}
              />
            </div>
          )}

          {currentStep === 3 && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <StepHeading step={3} title="Departments">
                Departments are created under the first site ({sites[0] ?? '—'}). Add departments for other sites later in Organization.
              </StepHeading>
              <NameList
                label="Departments"
                placeholder="Department name"
                addLabel="Add department"
                items={departments}
                onChange={setDepartments}
                icon={<Layers size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} aria-hidden="true" />}
                error={errors.departments}
              />
            </div>
          )}

          {currentStep === 4 && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <StepHeading step={4} title="Administrator">
                This person gets the organization admin role.
              </StepHeading>

              <div className="grid grid-cols-2" style={{ gap: '16px' }}>
                <FormField label="Full name" required error={errors.adminName} style={{ margin: 0 }}>
                  {(control) => (
                    <input
                      {...control}
                      type="text"
                      className="form-input"
                      placeholder="First and last name"
                      autoComplete="off"
                      value={adminName}
                      maxLength={120}
                      onChange={(e) => setAdminName(e.target.value)}
                    />
                  )}
                </FormField>

                <FormField label="Work email" required error={errors.adminEmail} style={{ margin: 0 }}>
                  {(control) => (
                    <input
                      {...control}
                      type="email"
                      className="form-input"
                      placeholder="name@company.com"
                      autoComplete="off"
                      value={adminEmail}
                      maxLength={200}
                      onChange={(e) => setAdminEmail(e.target.value)}
                    />
                  )}
                </FormField>
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <StepHeading step={5} title="Review">
                Check the details before the organization is created.
              </StepHeading>

              <dl
                style={{
                  margin: 0,
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '20px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
                  gap: '20px',
                }}
              >
                <div>
                  <dt style={termStyle}>Organization</dt>
                  <dd style={definitionStyle}>{orgName}</dd>
                  <dd style={definitionHintStyle}>
                    Code: {orgSlug}
                    {industry ? ` · ${industry}` : ''}
                  </dd>
                </div>
                <div>
                  <dt style={termStyle}>Administrator</dt>
                  <dd style={definitionStyle}>{adminName}</dd>
                  <dd style={definitionHintStyle}>{adminEmail}</dd>
                </div>
                <div>
                  <dt style={termStyle}>{sites.length === 1 ? 'Site' : `Sites (${sites.length})`}</dt>
                  <dd style={definitionStyle}>{sites.join(', ')}</dd>
                </div>
                <div>
                  <dt style={termStyle}>{departments.length === 1 ? 'Department' : `Departments (${departments.length})`}</dt>
                  <dd style={definitionStyle}>{departments.join(', ')}</dd>
                </div>
              </dl>

              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <legend style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px', padding: 0 }}>Starter content (optional)</legend>
                <OptionCheckbox
                  id="onboarding-starter-template"
                  checked={starterTemplate}
                  onChange={setStarterTemplate}
                  title="Starter 6S audit checklist"
                  description="A published checklist with Sort, Set in order, Shine, Standardize, Sustain and Safety sections and two questions each, including a critical safety question. The organization can edit it and publish new versions."
                />
                <OptionCheckbox
                  id="onboarding-starter-standards"
                  checked={starterStandards}
                  onChange={setStarterStandards}
                  title="Starter workplace standards"
                  description="Draft standards for walkway marking, daily cleaning and emergency equipment access, for the organization to adapt, illustrate and approve."
                />
              </fieldset>
            </div>
          )}
        </form>

        {/* Wizard controls */}
        <div
          style={{
            marginTop: '24px',
            paddingTop: '16px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {currentStep > 1 ? (
            <Button
              type="button"
              variant="secondary"
              icon={<ArrowLeft size={16} />}
              disabled={submitting}
              onClick={() => {
                setErrors({});
                setCurrentStep(currentStep - 1);
              }}
            >
              Previous
            </Button>
          ) : (
            <span />
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }} aria-hidden="true">
              Step {currentStep} of {LAST_STEP}
            </span>
            {currentStep < LAST_STEP ? (
              <Button type="submit" form={FORM_ID} variant="primary" icon={<ArrowRight size={16} />}>
                Next
              </Button>
            ) : (
              <Button type="submit" form={FORM_ID} variant="primary" loading={submitting} disabled={submitting} icon={<Building2 size={16} />}>
                Create organization
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};
