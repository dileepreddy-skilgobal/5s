import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Award, CheckCircle2, RotateCcw, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getApiErrorMessage } from '../../services/api';
import { QuizQuestion, QuizSubmissionResult, trainingApi } from '../../services/trainingApi';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { SummaryCard, SummaryGrid } from '../../components/ui/SummaryCard';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';

interface AssessmentPanelProps {
  /** Organization pass mark, when known; the server's grading is authoritative. */
  passPercent: number | null;
  onSubmitted: (result: QuizSubmissionResult) => void;
  onViewCertificate: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const AssessmentPanel: React.FC<AssessmentPanelProps> = ({ passPercent, onSubmitted, onViewCertificate }) => {
  const { addToast } = useApp();
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizSubmissionResult | null>(null);

  // Every fetch returns the options in a new order, so a retake loads the quiz again
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await trainingApi.getQuiz();
      setQuestions(Array.isArray(list) ? list : []);
      setAnswers({});
      setIndex(0);
      setResult(null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'The assessment could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unanswered = questions.filter((q) => !answers[q.id]).length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || unanswered > 0) return;
    setSubmitting(true);
    try {
      const res = await trainingApi.submitQuiz(answers);
      setResult(res);
      onSubmitted(res);
      if (res.passed) {
        addToast({
          type: 'success',
          title: 'Assessment passed',
          message: `Score ${res.percentage}%. ${res.certificateRenewed ? 'Your certificate has been renewed.' : 'Your certificate has been issued.'}`,
        });
      } else {
        addToast({ type: 'warning', title: 'Pass mark not reached', message: `Score ${res.percentage}%; ${res.passPercent}% is needed to pass.` });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Submission failed', message: getApiErrorMessage(err, 'The assessment could not be graded.') });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Card><LoadingState label="Loading assessment…" /></Card>;
  if (error) return <Card><ErrorState message={error} onRetry={load} /></Card>;
  if (questions.length === 0) return <Card><EmptyState title="No assessment questions" description="The assessment is not available right now." /></Card>;

  if (result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Card>
          <div style={{ textAlign: 'center', padding: '12px 8px' }}>
            <div
              aria-hidden="true"
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: result.passed ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                color: result.passed ? 'var(--color-success)' : 'var(--color-danger)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '12px',
              }}
            >
              {result.passed ? <Award size={28} /> : <AlertTriangle size={28} />}
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {result.passed ? 'You passed' : 'Pass mark not reached'}
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '6px auto 0 auto', maxWidth: '560px', lineHeight: 1.5 }}>
              {result.passed
                ? result.certificateRenewed
                  ? 'Your existing certificate has been renewed with this score.'
                  : 'Your certificate has been issued.'
                : `You need ${result.passPercent}% to pass. Review the answers below and try again.`}
            </p>
            <div style={{ maxWidth: '480px', margin: '20px auto 0 auto', textAlign: 'left' }}>
              <SummaryGrid min={180}>
                <SummaryCard
                  label="Score"
                  value={`${result.percentage}%`}
                  tone={result.passed ? 'success' : 'danger'}
                  hint={result.passed ? 'Passed' : `Below the ${result.passPercent}% pass mark`}
                />
                <SummaryCard label="Correct answers" value={`${result.correctCount} / ${result.totalQuestions}`} tone="neutral" />
              </SummaryGrid>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap', marginTop: '20px' }}>
              <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={load}>
                Retake assessment
              </Button>
              {result.passed && result.certificate && (
                <Button variant="primary" icon={<Award size={16} />} onClick={onViewCertificate}>
                  View certificate
                </Button>
              )}
            </div>
          </div>
        </Card>

        <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '8px 0 0 0' }}>Review your answers</h3>
        {result.results.map((r, i) => (
          <Card key={r.questionId}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>Question {i + 1}</span>
                <Badge variant={r.isCorrect ? 'success' : 'danger'} icon={r.isCorrect ? <CheckCircle2 size={12} /> : <XCircle size={12} />}>
                  {r.isCorrect ? 'Correct' : 'Incorrect'}
                </Badge>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45 }}>{r.question}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                <div>
                  <strong>Your answer:</strong> {r.selectedAnswer ?? 'Not answered'}
                </div>
                {!r.isCorrect && (
                  <div>
                    <strong>Correct answer:</strong> {r.correctAnswer}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '13px', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-pale)', border: '1px solid var(--color-info-border)', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Why: </strong>
                {r.explanation}
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  const q = questions[Math.min(index, questions.length - 1)];
  const isLast = index >= questions.length - 1;
  const neededCorrect = passPercent !== null ? Math.ceil((passPercent / 100) * questions.length - 1e-9) : null;
  const groupLabelId = `quiz-q-${q.id}`;

  return (
    <Card>
      <form id="training-assessment" onSubmit={submit}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }} aria-live="polite">
            Question {index + 1} of {questions.length}
          </span>
          {passPercent !== null && neededCorrect !== null && (
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Pass mark {passPercent}% ({neededCorrect} of {questions.length} correct)
            </span>
          )}
        </div>
        <ProgressBar value={Math.round(((index + 1) / questions.length) * 100)} height={6} color="primary" ariaLabel="Assessment progress" />

        <div style={{ marginTop: '20px' }}>
          <Badge variant="neutral">{q.category}</Badge>
          <h3 id={groupLabelId} style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.45, margin: '8px 0 16px 0' }}>
            {q.question}
          </h3>
          <div role="radiogroup" aria-labelledby={groupLabelId} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {q.options.map((option, optIdx) => {
              const id = `${q.id}-opt-${optIdx}`;
              const checked = answers[q.id] === option;
              return (
                <label
                  key={id}
                  htmlFor={id}
                  style={{
                    padding: '12px 14px',
                    minHeight: '44px',
                    borderRadius: 'var(--radius-md)',
                    background: checked ? 'var(--bg-pale)' : 'var(--bg-surface)',
                    border: `1px solid ${checked ? 'var(--color-primary)' : 'var(--border-subtle)'}`,
                    boxShadow: checked ? 'inset 0 0 0 1px var(--color-primary)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    fontSize: '14px',
                    color: 'var(--text-primary)',
                    fontWeight: checked ? 600 : 400,
                    lineHeight: 1.45,
                  }}
                >
                  <input
                    type="radio"
                    id={id}
                    name={`quiz-${q.id}`}
                    value={option}
                    checked={checked}
                    onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: option }))}
                    style={{ marginTop: '3px', flexShrink: 0, width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>
        </div>

        <nav aria-label="Questions" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '20px' }}>
          {questions.map((qq, i) => {
            const answered = Boolean(answers[qq.id]);
            const current = i === index;
            return (
              <button
                key={qq.id}
                type="button"
                onClick={() => setIndex(i)}
                aria-current={current ? 'step' : undefined}
                aria-label={`Question ${i + 1}${answered ? ', answered' : ''}`}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-sm)',
                  border: current ? '2px solid var(--color-primary)' : '1px solid var(--border-subtle)',
                  background: answered ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                  color: answered || current ? 'var(--color-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--border-subtle)', flexWrap: 'wrap', gap: '12px' }}>
          <Button type="button" variant="secondary" disabled={index === 0} icon={<ArrowLeft size={16} />} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
            Previous
          </Button>
          {unanswered > 0 && isLast && (
            <span style={{ fontSize: '13px', color: 'var(--color-warning)', display: 'inline-flex', alignItems: 'center', gap: '6px' }} role="status">
              <AlertTriangle size={14} aria-hidden="true" />
              {plural(unanswered, 'question', 'questions')} still to answer
            </span>
          )}
          {isLast ? (
            <Button type="submit" form="training-assessment" variant="primary" loading={submitting} disabled={unanswered > 0} icon={<CheckCircle2 size={16} />}>
              Submit assessment
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}>
              Next <ArrowRight size={16} aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
};
