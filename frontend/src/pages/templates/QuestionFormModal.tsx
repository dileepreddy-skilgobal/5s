import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { AuditTemplateQuestion, AuditTemplateSection, Standard } from '../../types';
import { QUESTION_TYPE_LABELS, SEVERITY_LABELS, pillarLabel } from '../../constants/labels';
import { QuestionPayload } from '../../services/auditPlanningApi';
import { auditExecutionApi } from '../../services/auditExecutionApi';
import { getApiErrorMessage } from '../../services/api';
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { FieldError } from './templateShared';

type QuestionType = AuditTemplateQuestion['questionType'];
type Severity = AuditTemplateQuestion['severity'];

const PICKABLE_TYPES: QuestionType[] = ['PASS_FAIL', 'YES_NO', 'NUMERIC_0_5', 'NUMERIC_0_10', 'PERCENTAGE', 'MULTIPLE_CHOICE', 'CHECKLIST', 'PHOTO', 'TEXT', 'NOT_APPLICABLE'];
const SEVERITIES: Severity[] = ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL'];
/** The server requires at least this many labelled choices for a multiple-choice question. */
const MIN_CHOICES = 2;
const MAX_REFERENCE_PHOTO_BYTES = 10 * 1024 * 1024;

interface QuestionFormModalProps {
  isOpen: boolean;
  /** Question being edited; omitted when adding. */
  question?: AuditTemplateQuestion | null;
  section?: AuditTemplateSection | null;
  standards: Standard[];
  /** Organization default score cap for failed critical questions. */
  defaultCap: number;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: QuestionPayload & { referencePhotoUrl?: string }) => void;
}

interface ChoiceRow {
  key: number;
  label: string;
  /** Percentage of the question's points this choice earns (0–100). */
  score: string;
}

interface FormState {
  questionCode: string;
  questionText: string;
  description: string;
  guidance: string;
  standardId: string;
  questionType: QuestionType;
  choices: ChoiceRow[];
  weightage: string;
  severity: Severity;
  isCritical: boolean;
  scoreCapOnFail: string;
  mandatoryEvidence: boolean;
  referencePhotoUrl: string;
}

let choiceSeq = 0;
const choiceRow = (label = '', score = ''): ChoiceRow => ({ key: ++choiceSeq, label, score });
/** A sensible starting scale for a new multiple-choice question. */
const defaultChoices = () => [choiceRow('Fully meets the standard', '100'), choiceRow('Partly meets the standard', '50'), choiceRow('Does not meet the standard', '0')];

const typeHint = (type: QuestionType) => {
  switch (type) {
    case 'PASS_FAIL':
    case 'YES_NO':
    case 'CHECKLIST':
    case 'PHOTO':
      return 'Answered with two buttons (conforms / does not conform).';
    case 'MULTIPLE_CHOICE':
      return 'The auditor picks one choice; each choice earns its share of the question’s points.';
    case 'NUMERIC_0_10':
      return 'Rated 0–10 by the auditor.';
    case 'PERCENTAGE':
      return 'The auditor enters a percentage.';
    case 'TEXT':
      return 'The auditor writes a response; any response earns full points.';
    case 'NOT_APPLICABLE':
      return 'Information only; not scored.';
    default:
      return 'Rated 0–5 by the auditor.';
  }
};

export const QuestionFormModal: React.FC<QuestionFormModalProps> = ({ isOpen, question, section, standards, defaultCap, saving, onClose, onSubmit }) => {
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const pillarCode = section?.category?.split('_')[0] ?? 'Q';
    const nextNum = (section?.questions?.length ?? 0) + 1;
    const existingChoices = (question?.options ?? []).map((o) => choiceRow(o.label, String(o.score)));
    setForm({
      questionCode: question?.questionCode ?? `Q-${pillarCode}-${String(nextNum).padStart(2, '0')}`,
      questionText: question?.questionText ?? '',
      description: question?.description ?? '',
      guidance: question?.guidance ?? '',
      standardId: question?.standardId ?? '',
      questionType: question?.questionType ?? 'NUMERIC_0_5',
      choices: existingChoices.length ? existingChoices : defaultChoices(),
      weightage: String(question?.weightage ?? 1),
      severity: question?.severity ?? 'MODERATE',
      isCritical: question?.isCritical ?? false,
      scoreCapOnFail: String(question?.scoreCapOnFail ?? defaultCap),
      mandatoryEvidence: question?.mandatoryEvidence ?? false,
      referencePhotoUrl: question?.referencePhotoUrl ?? '',
    });
    setErrors({});
  }, [isOpen, question, section, defaultCap]);

  if (!form) return null;
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm({ ...form, [key]: value });
  const typeOptions = PICKABLE_TYPES.includes(form.questionType) ? PICKABLE_TYPES : [...PICKABLE_TYPES, form.questionType];
  const isChoice = form.questionType === 'MULTIPLE_CHOICE';

  const updateChoice = (key: number, patch: Partial<ChoiceRow>) =>
    set('choices', form.choices.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const moveChoice = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= form.choices.length) return;
    const next = [...form.choices];
    [next[index], next[target]] = [next[target], next[index]];
    set('choices', next);
  };

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, referencePhotoUrl: 'Choose an image file.' }));
      return;
    }
    if (file.size > MAX_REFERENCE_PHOTO_BYTES) {
      setErrors((prev) => ({ ...prev, referencePhotoUrl: 'The photo is larger than 10 MB.' }));
      return;
    }
    setUploading(true);
    setErrors((prev) => ({ ...prev, referencePhotoUrl: '' }));
    try {
      const stored = await auditExecutionApi.uploadFile(file, file.name);
      setForm((prev) => (prev ? { ...prev, referencePhotoUrl: stored.url } : prev));
    } catch (err) {
      setErrors((prev) => ({ ...prev, referencePhotoUrl: getApiErrorMessage(err, 'The photo could not be uploaded.') }));
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    const weight = Number(form.weightage);
    const cap = Number(form.scoreCapOnFail);
    if (!form.questionCode.trim()) next.questionCode = 'Enter a question code.';
    if (!form.questionText.trim()) next.questionText = 'Enter the question.';
    if (form.weightage.trim() === '' || !Number.isFinite(weight) || weight < 0) next.weightage = 'Enter a weight of 0 or more.';
    if (form.isCritical && (!Number.isInteger(cap) || cap < 0 || cap > 100)) next.scoreCapOnFail = 'Enter a whole percentage from 0 to 100.';
    if (isChoice) {
      const filled = form.choices.filter((c) => c.label.trim());
      const labels = new Set(filled.map((c) => c.label.trim().toLowerCase()));
      if (filled.length < MIN_CHOICES) next.choices = `Add at least ${MIN_CHOICES} choices with a label.`;
      else if (labels.size !== filled.length) next.choices = 'Each choice needs a different label.';
      else if (filled.some((c) => c.score.trim() === '' || !Number.isFinite(Number(c.score)) || Number(c.score) < 0 || Number(c.score) > 100))
        next.choices = 'Give every choice a score from 0 to 100.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    onSubmit({
      questionCode: form.questionCode.trim().toUpperCase(),
      questionText: form.questionText.trim(),
      description: form.description.trim() || (question ? '' : undefined),
      guidance: form.guidance.trim() || (question ? '' : undefined),
      // Editing: null unlinks the standard
      standardId: form.standardId || (question ? null : undefined),
      questionType: form.questionType,
      options: isChoice ? form.choices.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), score: Number(c.score) })) : undefined,
      weightage: weight,
      severity: form.severity,
      isCritical: form.isCritical,
      scoreCapOnFail: form.isCritical ? cap : question ? null : undefined,
      mandatoryEvidence: form.mandatoryEvidence,
      referencePhotoUrl: form.referencePhotoUrl || (question ? '' : undefined),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={question ? `Edit question ${question.questionCode}` : 'Add question'}
      subtitle={section ? `${pillarLabel(section.category)} · ${section.title}` : undefined}
      maxWidth="680px"
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="question-form" loading={saving} disabled={saving || uploading}>
            Save question
          </Button>
        </>
      }
    >
      <form id="question-form" onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="q-code">Question code<span className="required" aria-hidden="true"> *</span></label>
            <input
              id="q-code"
              type="text"
              value={form.questionCode}
              onChange={(e) => set('questionCode', e.target.value)}
              className="form-control"
              aria-invalid={!!errors.questionCode}
              aria-describedby={errors.questionCode ? 'q-code-error' : undefined}
            />
            <FieldError id="q-code-error" message={errors.questionCode} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="q-type">Response type<span className="required" aria-hidden="true"> *</span></label>
            <select id="q-type" value={form.questionType} onChange={(e) => set('questionType', e.target.value as QuestionType)} className="form-control" aria-describedby="q-type-hint">
              {typeOptions.map((t) => (
                <option key={t} value={t}>{QUESTION_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
            <div id="q-type-hint" className="form-hint">{typeHint(form.questionType)}</div>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="q-text">Question<span className="required" aria-hidden="true"> *</span></label>
          <textarea
            id="q-text"
            rows={2}
            placeholder="e.g. Are only the tools needed for the current job at the workstation?"
            value={form.questionText}
            onChange={(e) => set('questionText', e.target.value)}
            className="form-control"
            aria-invalid={!!errors.questionText}
            aria-describedby={errors.questionText ? 'q-text-error' : undefined}
          />
          <FieldError id="q-text-error" message={errors.questionText} />
        </div>

        {isChoice && (
          <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px 14px', margin: 0, display: 'flex', flexDirection: 'column', gap: '10px', minWidth: 0 }} aria-describedby={errors.choices ? 'q-choices-error q-choices-hint' : 'q-choices-hint'}>
            <legend className="form-label" style={{ padding: '0 4px' }}>
              Choices<span className="required" aria-hidden="true"> *</span>
            </legend>
            <div id="q-choices-hint" className="form-hint" style={{ marginTop: 0 }}>
              In the order the auditor sees them. Score is the share of the question’s points the choice earns (100 = full marks).
            </div>
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {form.choices.map((c, idx) => (
                <li key={c.key} style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1 1 220px', margin: 0, minWidth: 0 }}>
                    <label className="form-label" htmlFor={`q-choice-label-${c.key}`} style={{ fontSize: '12.5px' }}>Choice {idx + 1}</label>
                    <input
                      id={`q-choice-label-${c.key}`}
                      type="text"
                      maxLength={200}
                      className="form-control"
                      value={c.label}
                      onChange={(e) => updateChoice(c.key, { label: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ flex: '0 0 96px', margin: 0 }}>
                    <label className="form-label" htmlFor={`q-choice-score-${c.key}`} style={{ fontSize: '12.5px' }}>Score %</label>
                    <input
                      id={`q-choice-score-${c.key}`}
                      type="number"
                      min={0}
                      max={100}
                      step={5}
                      inputMode="numeric"
                      className="form-control"
                      value={c.score}
                      onChange={(e) => updateChoice(c.key, { score: e.target.value })}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    <Button type="button" size="sm" variant="ghost" icon={<ArrowUp size={14} />} disabled={idx === 0} onClick={() => moveChoice(idx, -1)} aria-label={`Move choice ${idx + 1} up`} />
                    <Button type="button" size="sm" variant="ghost" icon={<ArrowDown size={14} />} disabled={idx === form.choices.length - 1} onClick={() => moveChoice(idx, 1)} aria-label={`Move choice ${idx + 1} down`} />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 size={14} />}
                      disabled={form.choices.length <= MIN_CHOICES}
                      onClick={() => set('choices', form.choices.filter((x) => x.key !== c.key))}
                      aria-label={`Remove choice ${idx + 1}`}
                    />
                  </div>
                </li>
              ))}
            </ol>
            <div>
              <Button type="button" size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => set('choices', [...form.choices, choiceRow()])}>
                Add choice
              </Button>
            </div>
            <FieldError id="q-choices-error" message={errors.choices} />
          </fieldset>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="q-description">Description</label>
          <textarea
            id="q-description"
            rows={2}
            placeholder="What this question checks and why it matters"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            className="form-control"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="q-guidance">Guidance for the auditor</label>
          <textarea
            id="q-guidance"
            rows={2}
            placeholder="Where to look and what counts as conforming"
            value={form.guidance}
            onChange={(e) => set('guidance', e.target.value)}
            className="form-control"
          />
        </div>

        <div className="form-group">
          <span className="form-label" id="q-photo-label">Reference photo</span>
          <div className="form-hint" id="q-photo-hint" style={{ marginTop: 0, marginBottom: '8px' }}>
            The standard condition, shown to the auditor next to the question.
          </div>
          {form.referencePhotoUrl ? (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ width: '200px', maxWidth: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                <ImageWithFallback src={form.referencePhotoUrl} alt="Reference photo of the standard condition" height="130px" allowZoom />
              </div>
              <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => set('referencePhotoUrl', '')}>
                Remove photo
              </Button>
            </div>
          ) : (
            <label className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', cursor: uploading ? 'progress' : 'pointer' }}>
              <ImagePlus size={14} aria-hidden="true" />
              {uploading ? 'Uploading…' : 'Upload photo'}
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                aria-labelledby="q-photo-label"
                aria-describedby={errors.referencePhotoUrl ? 'q-photo-error q-photo-hint' : 'q-photo-hint'}
                style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, overflow: 'hidden' }}
                onChange={(e) => {
                  handlePhoto(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          <FieldError id="q-photo-error" message={errors.referencePhotoUrl || undefined} />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="q-standard">Linked standard</label>
          <select id="q-standard" value={form.standardId} onChange={(e) => set('standardId', e.target.value)} className="form-control">
            <option value="">No linked standard</option>
            {standards.map((std) => (
              <option key={std.id} value={std.id}>
                {std.code} — {std.title} ({pillarLabel(std.category)})
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label" htmlFor="q-severity">Default severity of a finding</label>
            <select id="q-severity" value={form.severity} onChange={(e) => set('severity', e.target.value as Severity)} className="form-control" aria-describedby="q-severity-hint">
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
              ))}
            </select>
            <div id="q-severity-hint" className="form-hint">The auditor can change it for each finding.</div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="q-weight">Weight</label>
            <input
              id="q-weight"
              type="number"
              min={0}
              step={0.5}
              value={form.weightage}
              onChange={(e) => set('weightage', e.target.value)}
              className="form-control"
              aria-invalid={!!errors.weightage}
              aria-describedby={errors.weightage ? 'q-weight-error q-weight-hint' : 'q-weight-hint'}
            />
            <div id="q-weight-hint" className="form-hint">How much this question counts; 1 is normal.</div>
            <FieldError id="q-weight-error" message={errors.weightage} />
          </div>
        </div>

        <div style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isCritical} onChange={(e) => set('isCritical', e.target.checked)} style={{ width: '18px', height: '18px', marginTop: '2px' }} />
            <span>
              <span style={{ display: 'block', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Critical question</span>
              <span style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)' }}>If it fails, the overall audit score is capped.</span>
            </span>
          </label>
          {form.isCritical && (
            <div className="form-group">
              <label className="form-label" htmlFor="q-cap">Score cap when it fails (%)</label>
              <input
                id="q-cap"
                type="number"
                min={0}
                max={100}
                value={form.scoreCapOnFail}
                onChange={(e) => set('scoreCapOnFail', e.target.value)}
                className="form-control"
                aria-invalid={!!errors.scoreCapOnFail}
                aria-describedby={errors.scoreCapOnFail ? 'q-cap-error' : undefined}
              />
              <FieldError id="q-cap-error" message={errors.scoreCapOnFail} />
            </div>
          )}
        </div>

        <label style={{ padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.mandatoryEvidence} onChange={(e) => set('mandatoryEvidence', e.target.checked)} style={{ width: '18px', height: '18px', marginTop: '2px' }} />
          <span>
            <span style={{ display: 'block', fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Photo required</span>
            <span style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)' }}>The auditor must attach a photo to this answer.</span>
          </span>
        </label>
      </form>
    </Modal>
  );
};
