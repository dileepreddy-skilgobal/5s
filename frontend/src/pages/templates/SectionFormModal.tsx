import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { AuditTemplateSection } from '../../types';
import { PILLARS, PILLAR_LABELS } from '../../constants/labels';
import { SectionPayload } from '../../services/auditPlanningApi';
import { FieldError } from './templateShared';

interface SectionFormModalProps {
  isOpen: boolean;
  /** Section being edited; omitted when adding. */
  section?: AuditTemplateSection | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: Required<Pick<SectionPayload, 'title' | 'description' | 'category'>>) => void;
}

export const SectionFormModal: React.FC<SectionFormModalProps> = ({ isOpen, section, saving, onClose, onSubmit }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<AuditTemplateSection['category']>('S1_SORT');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(section?.title ?? '');
    setDescription(section?.description ?? '');
    setCategory(section?.category ?? 'S1_SORT');
    setError(null);
  }, [isOpen, section]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Enter a section title.');
      return;
    }
    onSubmit({ title: title.trim(), description: description.trim(), category });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={section ? 'Edit section' : 'Add section'}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="section-form" loading={saving} disabled={saving}>
            {section ? 'Save section' : 'Add section'}
          </Button>
        </>
      }
    >
      <form id="section-form" onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="section-category">Pillar<span className="required" aria-hidden="true"> *</span></label>
          <select
            id="section-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as AuditTemplateSection['category'])}
            className="form-control"
          >
            {PILLARS.map((p) => (
              <option key={p} value={p}>{PILLAR_LABELS[p]}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="section-title">Section title<span className="required" aria-hidden="true"> *</span></label>
          <input
            id="section-title"
            type="text"
            placeholder="e.g. Sort – unneeded items removed"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="form-control"
            aria-invalid={!!error}
            aria-describedby={error ? 'section-title-error' : undefined}
          />
          <FieldError id="section-title-error" message={error} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="section-description">Description</label>
          <textarea
            id="section-description"
            rows={2}
            placeholder="Optional scope notes for this section"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="form-control"
          />
        </div>
      </form>
    </Modal>
  );
};
