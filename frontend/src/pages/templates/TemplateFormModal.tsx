import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { AuditTemplateDetail, PillarWeights, TemplateStatus } from '../../services/auditPlanningApi';
import {
  AUDIT_TYPE_LABELS,
  DEFAULT_WEIGHTS,
  FieldError,
  TEMPLATE_STATUS_LABELS,
  WEIGHT_KEYS,
  WEIGHT_LABELS,
  usePillarWeighting,
} from './templateShared';

export interface TemplateFormValues {
  code: string;
  name: string;
  description: string;
  auditType: string;
  status: TemplateStatus;
  /** Only set when the organization scores with pillar weights. */
  weights?: PillarWeights;
}

interface TemplateFormModalProps {
  isOpen: boolean;
  /** Template being edited; omitted when creating. */
  template?: AuditTemplateDetail | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: TemplateFormValues) => void;
}

type Weights = Record<(typeof WEIGHT_KEYS)[number], number>;

const weightsFrom = (model?: Record<string, number> | null): Weights => {
  const w = { ...DEFAULT_WEIGHTS };
  WEIGHT_KEYS.forEach((k) => {
    const v = model?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) w[k] = v;
  });
  return w;
};

export const TemplateFormModal: React.FC<TemplateFormModalProps> = ({ isOpen, template, saving, onClose, onSubmit }) => {
  const isEdit = !!template;
  const pillarWeighted = usePillarWeighting();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [auditType, setAuditType] = useState('ROUTINE');
  const [status, setStatus] = useState<TemplateStatus>('DRAFT');
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setCode(template?.code ?? '');
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setAuditType(template?.auditType ?? 'ROUTINE');
    setStatus(template?.status ?? 'DRAFT');
    setWeights(weightsFrom(template?.categoryScoringModel));
    setErrors({});
  }, [isOpen, template]);

  const totalWeight = WEIGHT_KEYS.reduce((sum, k) => sum + weights[k], 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!isEdit && !code.trim()) next.code = 'Enter a template code.';
    if (!name.trim()) next.name = 'Enter a template name.';
    if (pillarWeighted && totalWeight !== 100) next.weights = `Pillar weights must add up to 100% (currently ${totalWeight}%).`;
    setErrors(next);
    if (Object.keys(next).length) return;
    onSubmit({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      description: description.trim(),
      auditType,
      status,
      weights: pillarWeighted ? weights : undefined,
    });
  };

  // A template without a published version cannot be made active
  const statusOptions = (Object.keys(TEMPLATE_STATUS_LABELS) as TemplateStatus[]).filter(
    (s) => s !== 'ACTIVE' || template?.hasPublishedVersion || status === 'ACTIVE',
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit template details` : 'New audit template'}
      subtitle={isEdit ? template?.code : 'Version 1.0 starts as a draft. Publish it in the builder to use it in audits.'}
      maxWidth="640px"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="template-form" loading={saving} disabled={saving}>
            {isEdit ? 'Save details' : 'Create and open builder'}
          </Button>
        </>
      }
    >
      <form id="template-form" onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
          {!isEdit && (
            <div className="form-group">
              <label className="form-label" htmlFor="tpl-code">Template code<span className="required" aria-hidden="true"> *</span></label>
              <input
                id="tpl-code"
                type="text"
                placeholder="e.g. TPL-ASSEMBLY-01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="form-control"
                aria-invalid={!!errors.code}
                aria-describedby={errors.code ? 'tpl-code-error' : undefined}
              />
              <FieldError id="tpl-code-error" message={errors.code} />
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="tpl-type">Audit type<span className="required" aria-hidden="true"> *</span></label>
            <select id="tpl-type" value={auditType} onChange={(e) => setAuditType(e.target.value)} className="form-control">
              {Object.entries(AUDIT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {isEdit && (
            <div className="form-group">
              <label className="form-label" htmlFor="tpl-status">Status</label>
              <select id="tpl-status" value={status} onChange={(e) => setStatus(e.target.value as TemplateStatus)} className="form-control">
                {statusOptions.map((s) => (
                  <option key={s} value={s}>{TEMPLATE_STATUS_LABELS[s]}</option>
                ))}
              </select>
              <div className="form-hint">Deprecated templates are hidden from new audits and schedules.</div>
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="tpl-name">Template name<span className="required" aria-hidden="true"> *</span></label>
          <input
            id="tpl-name"
            type="text"
            placeholder="e.g. Assembly line 5S audit"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="form-control"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'tpl-name-error' : undefined}
          />
          <FieldError id="tpl-name-error" message={errors.name} />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="tpl-description">Purpose and scope</label>
          <textarea
            id="tpl-description"
            rows={3}
            placeholder="Which areas this template is for and any instructions for auditors"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="form-control"
          />
        </div>

        {pillarWeighted ? (
          <fieldset style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', padding: '16px 0 0 0', margin: 0 }}>
            <legend className="form-section-title" style={{ width: '100%', padding: '0 0 8px', margin: '0 0 4px' }}>Pillar weights</legend>
            <div className="form-hint" style={{ margin: '0 0 12px 0' }}>
              Your organization uses pillar-weighted scoring: each pillar's score counts by these weights. They must add up to 100%.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))', gap: '10px' }}>
              {WEIGHT_KEYS.map((k) => (
                <div key={k} className="form-group">
                  <label className="form-label" htmlFor={`tpl-weight-${k}`}>
                    {WEIGHT_LABELS[k]} (%)
                  </label>
                  <input
                    id={`tpl-weight-${k}`}
                    type="number"
                    min={0}
                    max={100}
                    value={weights[k]}
                    onChange={(e) => setWeights({ ...weights, [k]: Math.max(0, Number(e.target.value) || 0) })}
                    className="form-control"
                  />
                </div>
              ))}
            </div>
            <div role="status" style={{ fontSize: '12.5px', marginTop: '8px', color: totalWeight === 100 ? 'var(--text-secondary)' : 'var(--color-danger)' }}>
              Total: {totalWeight}%
            </div>
            <FieldError message={errors.weights} />
          </fieldset>
        ) : pillarWeighted === false ? (
          <div className="form-hint">
            Your organization scores audits by pooling all questions, so pillar weights are not used.
          </div>
        ) : null}
      </form>
    </Modal>
  );
};
