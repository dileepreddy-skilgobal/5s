import React from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ImageWithFallback } from '../../components/ui/ImageWithFallback';
import { AuditTemplateQuestion, AuditTemplateVersion } from '../../types';
import { pillarLabel, pillarVariant, severityLabel } from '../../constants/labels';
import { Camera, ShieldAlert } from 'lucide-react';

/** How the audit runners ask for an answer (mirrors the web and mobile runners). */
const answerHint = (q: AuditTemplateQuestion) => {
  switch (q.questionType) {
    case 'PASS_FAIL':
    case 'YES_NO':
    case 'CHECKLIST':
    case 'PHOTO':
      return 'Conforming / Non-conforming';
    case 'MULTIPLE_CHOICE':
      return q.options?.length ? `Choose one of ${q.options.length}` : 'Rating 0 – 5';
    case 'NUMERIC_0_10':
      return 'Rating 0 – 10';
    case 'PERCENTAGE':
      return 'Percentage';
    case 'TEXT':
      return 'Written response';
    case 'NOT_APPLICABLE':
      return 'Information only';
    default:
      return 'Rating 0 – 5';
  }
};

/** Read-only preview of the checklist as the auditor sees it. No scoring: the server calculates scores. */
export const TemplatePreviewModal: React.FC<{ version: AuditTemplateVersion | null | undefined; title?: string; onClose: () => void }> = ({ version, title, onClose }) => (
  <Modal
    isOpen={!!version}
    onClose={onClose}
    title={title ?? 'Auditor preview'}
    subtitle={version ? `Version ${version.versionNumber}${version.isPublished ? '' : ' (draft)'} · questions in the order auditors see them` : undefined}
    maxWidth="680px"
    footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
  >
    {!version?.sections?.length ? (
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>This version has no sections yet.</p>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {version.sections.map((sec) => (
          <section key={sec.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px', background: 'var(--bg-surface)', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
              <Badge variant={pillarVariant(sec.category)}>{pillarLabel(sec.category)}</Badge>
              <h3 style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', margin: 0, overflowWrap: 'anywhere' }}>{sec.title}</h3>
            </div>
            {sec.questions?.length ? (
              <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sec.questions.map((q) => (
                  <li key={q.id} style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
                    <div style={{ fontWeight: 600 }}>{q.questionText}</div>
                    {q.description && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>{q.description}</div>}
                    {q.guidance && (
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        <strong style={{ fontWeight: 600 }}>Guidance:</strong> {q.guidance}
                      </div>
                    )}
                    {q.questionType === 'MULTIPLE_CHOICE' && !!q.options?.length && (
                      <ul style={{ margin: '6px 0 0', paddingLeft: '18px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {q.options.map((o, i) => (
                          <li key={`${o.label}-${i}`}>
                            {o.label} <span style={{ color: 'var(--text-tertiary)' }}>({o.score}%)</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {q.referencePhotoUrl && (
                      <div style={{ width: '180px', maxWidth: '100%', marginTop: '8px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                        <ImageWithFallback src={q.referencePhotoUrl} alt={`Reference photo for ${q.questionCode}`} height="110px" allowZoom />
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                      <Badge variant="neutral">{answerHint(q)}</Badge>
                      <Badge variant="neutral">Finding: {severityLabel(q.severity)}</Badge>
                      {q.isCritical && <Badge variant="danger" icon={<ShieldAlert size={12} />}>Critical</Badge>}
                      {q.mandatoryEvidence && <Badge variant="warning" icon={<Camera size={12} />}>Photo required</Badge>}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>No questions in this section.</p>
            )}
          </section>
        ))}
      </div>
    )}
  </Modal>
);
