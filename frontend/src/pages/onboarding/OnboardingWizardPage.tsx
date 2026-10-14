import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  Compass,
  CheckCircle2,
  Building2,
  Layers,
  MapPin,
  Users,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Factory,
  Plus,
  Trash2,
} from 'lucide-react';
import { TenantLogoUploader } from '../../components/common/TenantLogoUploader';

export const OnboardingWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { refreshTenants, addToast, currentUser, activeUserRole } = useApp();

  const isSuper = currentUser?.isSuperAdmin === true || (currentUser?.email === 'superadmin@skilglobal.com' && activeUserRole === 'SUPER_ADMIN');

  React.useEffect(() => {
    if (!isSuper) {
      addToast({
        type: 'error',
        title: 'Access Restricted',
        message: 'Tenant Provisioning is restricted to platform administrators.',
      });
      navigate('/locations', { replace: true });
    }
  }, [isSuper, navigate, addToast]);

  if (!isSuper) {
    return null;
  }

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);


  // Wizard Form State
  const [orgName, setOrgName] = useState('Titan Precision Technologies');
  const [orgSlug, setOrgSlug] = useState('titan-precision');
  const [industry, setIndustry] = useState('Discrete Manufacturing');
  const [logoUrl, setLogoUrl] = useState('');
  const [presetHierarchy, setPresetHierarchy] = useState('MANUFACTURING');

  const [sites, setSites] = useState<string[]>([
    'Bangalore Heavy Plant 1',
    'Chennai Assembly Plant 2',
  ]);
  const [newSiteInput, setNewSiteInput] = useState('');

  const [departments, setDepartments] = useState<string[]>([
    'CNC Machining & Tooling',
    'Chassis Main Assembly',
    'Quality & Metrology Lab',
    'Raw Material Stores & Logistics',
  ]);
  const [newDeptInput, setNewDeptInput] = useState('');

  const [adminName, setAdminName] = useState('Vikram Sharma');
  const [adminEmail, setAdminEmail] = useState('vikram.sharma@titanprecision.com');

  const presets = [
    {
      id: 'MANUFACTURING',
      title: 'Discrete Manufacturing',
      desc: 'Plant → Department → Production Line → Machine / Workstation',
      icon: <Factory size={24} />,
    },
    {
      id: 'PROCESS_PLANT',
      title: 'Process Plant & Pharma',
      desc: 'Site → Unit → Cleanroom / Bay → Equipment Skid',
      icon: <Building2 size={24} />,
    },
    {
      id: 'LOGISTICS',
      title: 'Warehouse & Logistics',
      desc: 'Distribution Center → Inbound / Outbound → Aisle → Pallet Bay',
      icon: <Layers size={24} />,
    },
    {
      id: 'HOSPITAL',
      title: 'Healthcare & Hospital',
      desc: 'Facility → Block → Ward / Department → Room / Station',
      icon: <MapPin size={24} />,
    },
  ];

  const handleAddSite = () => {
    if (newSiteInput.trim()) {
      setSites([...sites, newSiteInput.trim()]);
      setNewSiteInput('');
    }
  };

  const handleRemoveSite = (idx: number) => {
    setSites(sites.filter((_, i) => i !== idx));
  };

  const handleAddDept = () => {
    if (newDeptInput.trim()) {
      setDepartments([...departments, newDeptInput.trim()]);
      setNewDeptInput('');
    }
  };

  const handleRemoveDept = (idx: number) => {
    setDepartments(departments.filter((_, i) => i !== idx));
  };

  const handleExecuteOnboarding = async () => {
    setLoading(true);
    try {
      const res = await api.executeOnboarding({
        orgName,
        orgSlug: orgSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        industry,
        logoUrl,
        presetHierarchy,
        sites,
        departments,
        adminName,
        adminEmail,
      });

      setCompleted(true);
      await refreshTenants();
      addToast({
        type: 'success',
        title: 'Organization Bootstrapped',
        message: `${orgName} is live with hierarchical nodes, admin account, and default 5S locations.`,
      });
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Onboarding Failed',
        message: err?.response?.data?.message || 'Could not complete onboarding wizard.',
      });
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { num: 1, title: 'Identity', desc: 'Organization profile' },
    { num: 2, title: 'Hierarchy', desc: 'Structure preset' },
    { num: 3, title: 'Sites & Plants', desc: 'Physical facilities' },
    { num: 4, title: 'Departments', desc: 'Operating units' },
    { num: 5, title: 'Admin Account', desc: 'Primary owner' },
    { num: 6, title: 'Launch', desc: 'Automated setup' },
  ];

  if (completed) {
    return (
      <div className="animate-fade-in" style={{ maxWidth: '680px', margin: '40px auto' }}>
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-success-bg)',
                color: 'var(--color-success)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <CheckCircle2 size={36} />
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {orgName} is Ready!
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px', maxWidth: '460px', margin: '8px auto 24px auto' }}>
              Your multi-tier hierarchy, default 5S workstations, QR codes, and initial rollout timelines have been generated.
            </p>

            <div
              style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                textAlign: 'left',
                marginBottom: '28px',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>
                Summary of Provisioned Masters
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', fontSize: '13px' }}>
                <div><strong>Tenant ID:</strong> {orgSlug}</div>
                <div><strong>Admin User:</strong> {adminEmail}</div>
                <div><strong>Sites Configured:</strong> {sites.length} Plants</div>
                <div><strong>Departments:</strong> {departments.length} Units</div>
                <div><strong>RBAC Engine:</strong> 9 Standard Roles</div>
                <div><strong>QR Deep-linking:</strong> Automated</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
              <Button variant="primary" icon={<MapPin size={16} />} onClick={() => navigate('/locations')}>
                Explore Centralized Location Master
              </Button>
              <Button variant="secondary" icon={<Building2 size={16} />} onClick={() => navigate('/organization')}>
                View Hierarchy Tree
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '840px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h1 className="page-title">Guided Onboarding Wizard</h1>
          <Badge variant="info" icon={<Compass size={12} />}>Setup Flow</Badge>
        </div>
        <p className="page-subtitle">
          Rapidly bootstrap a complete organization with sites, departments, administrative owners, and initial 5S timelines.
        </p>
      </div>

      {/* Stepper Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
          gap: '8px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px',
        }}
      >
        {steps.map((s) => {
          const isActive = currentStep === s.num;
          const isDone = currentStep > s.num;

          return (
            <div
              key={s.num}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                borderRadius: 'var(--radius-md)',
                background: isActive ? 'var(--color-primary-light)' : 'transparent',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: 'var(--radius-full)',
                  background: isDone ? 'var(--color-success)' : isActive ? 'var(--color-primary)' : 'var(--bg-surface-subtle)',
                  color: isDone || isActive ? '#FFFFFF' : 'var(--text-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                {isDone ? '✓' : s.num}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '12px', fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--color-primary)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                  {s.title}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <Card>
        {/* Step 1: Identity */}
        {currentStep === 1 && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Step 1: Organization Identity & Profile</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Enter the legal enterprise name and primary industry sector.</p>
            </div>

            <div className="form-group">
              <label className="form-label">Organization Legal Name <span className="required">*</span></label>
              <input
                type="text"
                className="form-input"
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  setOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                }}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tenant Identifier (Slug)</label>
              <input
                type="text"
                className="form-input"
                value={orgSlug}
                onChange={(e) => setOrgSlug(e.target.value)}
                required
              />
              <span className="form-hint">Used for tenant database routing and mobile deep-link scanning.</span>
            </div>

            {/* Tenant Logo Uploader */}
            <TenantLogoUploader
              value={logoUrl}
              onChange={setLogoUrl}
              label="Organization Brand Logo"
              helperText="Upload your company logo or select an industry preset to customize reports and screens."
            />

            <div className="form-group">
              <label className="form-label">Industry Classification</label>
              <select className="form-select" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option value="Discrete Manufacturing">Discrete Manufacturing (Automotive, Heavy Machinery, Electronics)</option>
                <option value="Process & Chemical">Process Manufacturing, Pharma & Chemical Refining</option>
                <option value="Warehousing & Logistics">Warehousing, Distribution & E-Commerce Logistics</option>
                <option value="Healthcare Facilities">Healthcare, Diagnostics & Hospital Operations</option>
                <option value="Offices & Corporate">Corporate Facilities & Workplace Management</option>
              </select>
            </div>
          </div>
        )}

        {/* Step 2: Hierarchy Presets */}
        {currentStep === 2 && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Step 2: Choose Organizational Hierarchy Preset</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Select an operational model matching your physical facility layout.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
              {presets.map((p) => {
                const isSelected = presetHierarchy === p.id;
                return (
                  <div
                    key={p.id}
                    onClick={() => setPresetHierarchy(p.id)}
                    style={{
                      padding: '16px',
                      borderRadius: 'var(--radius-lg)',
                      border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                      background: isSelected ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <div style={{ color: isSelected ? 'var(--color-primary)' : 'var(--text-tertiary)' }}>{p.icon}</div>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>{p.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{p.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Sites & Plants */}
        {currentStep === 3 && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Step 3: Define Initial Sites / Plants</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Add the physical locations or factories that will conduct 5S audits.</p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Pune Stamping Facility 03"
                value={newSiteInput}
                onChange={(e) => setNewSiteInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSite())}
              />
              <Button variant="secondary" icon={<Plus size={14} />} onClick={handleAddSite}>
                Add Site
              </Button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sites.map((site, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--bg-surface-subtle)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Factory size={16} color="var(--color-primary)" />
                    <span style={{ fontWeight: 500 }}>{site}</span>
                  </div>
                  {sites.length > 1 && (
                    <button
                      onClick={() => handleRemoveSite(idx)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 4: Departments */}
        {currentStep === 4 && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Step 4: Configure Operating Departments</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Departments group workstations, 5S area owners, and CAPA actions.</p>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Surface Coating & Painting"
                value={newDeptInput}
                onChange={(e) => setNewDeptInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddDept())}
              />
              <Button variant="secondary" icon={<Plus size={14} />} onClick={handleAddDept}>
                Add Department
              </Button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {departments.map((dept, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'var(--bg-surface-subtle)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Layers size={16} color="var(--color-purple)" />
                    <span style={{ fontWeight: 500 }}>{dept}</span>
                  </div>
                  {departments.length > 1 && (
                    <button
                      onClick={() => handleRemoveDept(idx)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Admin Account */}
        {currentStep === 5 && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Step 5: Primary Administrator Account</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>This account receives the ORG_ADMIN role with full governance authority.</p>
            </div>

            <div className="form-group">
              <label className="form-label">Administrator Full Name <span className="required">*</span></label>
              <input
                type="text"
                className="form-input"
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Corporate Email Address <span className="required">*</span></label>
              <input
                type="email"
                className="form-input"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
              />
            </div>
          </div>
        )}

        {/* Step 6: Confirmation & Review */}
        {currentStep === 6 && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Step 6: Review & Finalize Onboarding</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Confirm parameters before the platform provisions your tenant environment.</p>
            </div>

            <div
              style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: '20px',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '16px',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Organization</div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>{orgName}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Slug: {orgSlug}</div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Operating Model</div>
                <div style={{ fontSize: '15px', fontWeight: 600 }}>{presetHierarchy}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{industry}</div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Configured Sites</div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{sites.join(', ')}</div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Primary Admin</div>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{adminName}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{adminEmail}</div>
              </div>
            </div>
          </div>
        )}

        {/* Wizard Footer Controls */}
        <div
          style={{
            marginTop: '28px',
            paddingTop: '20px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {currentStep > 1 ? (
            <Button
              variant="secondary"
              icon={<ArrowLeft size={16} />}
              onClick={() => setCurrentStep(currentStep - 1)}
            >
              Previous
            </Button>
          ) : (
            <div />
          )}

          {currentStep < 6 ? (
            <Button
              variant="primary"
              icon={<ArrowRight size={16} />}
              onClick={() => setCurrentStep(currentStep + 1)}
            >
              Next Step
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={loading}
              icon={<Sparkles size={16} />}
              onClick={handleExecuteOnboarding}
            >
              Bootstrap Organization Now
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};
