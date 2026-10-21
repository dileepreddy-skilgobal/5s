import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Award, BookOpen, CheckCircle2, ChevronRight, HelpCircle, PlayCircle, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api, getApiErrorMessage } from '../../services/api';
import { CourseProgress, QuizSubmissionResult, TrainingCourse, trainingApi } from '../../services/trainingApi';
import { TrainingCertificate } from '../../types';
import { useCachedSettings } from '../../hooks/useTerminology';
import { PageHeader } from '../../components/ui/PageHeader';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { Tabs } from '../../components/ui/Tabs';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/StateViews';
import { CourseViewer } from './CourseViewer';
import { AssessmentPanel } from './AssessmentPanel';
import { CertificatesPanel } from './CertificatesPanel';
import { CompetencyRegisterPanel } from './CompetencyRegisterPanel';

type TabId = 'courses' | 'assessment' | 'certificates' | 'register';

const lessonsLabel = (n: number) => `${n} ${n === 1 ? 'lesson' : 'lessons'}`;

export const TrainingAcademyPage: React.FC = () => {
  const { currentTenant, addToast, can } = useApp();
  const orgSettings = useCachedSettings();
  const configuredPass = orgSettings?.competency?.quizPassPercent;
  const passPercent = typeof configuredPass === 'number' && Number.isFinite(configuredPass) ? configuredPass : null;

  const canViewRegister = can('PROGRAM_MANAGERS');
  const canRevoke = can('ORG_ADMINS');

  const [activeTab, setActiveTab] = useState<TabId>('courses');

  // Courses and the signed-in user's progress (stored on the server)
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [progress, setProgress] = useState<Record<string, CourseProgress>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [savingLessonId, setSavingLessonId] = useState<string | null>(null);

  // Certificates: the one rendered on the certificates tab, plus the user's own history
  const [certificate, setCertificate] = useState<TrainingCertificate | null>(null);
  const [myCertificates, setMyCertificates] = useState<TrainingCertificate[]>([]);
  const [myCertsLoading, setMyCertsLoading] = useState(false);
  const [myCertsError, setMyCertsError] = useState<string | null>(null);

  // Competency register (program managers)
  const [register, setRegister] = useState<TrainingCertificate[]>([]);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerLoaded, setRegisterLoaded] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<TrainingCertificate | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [courseList, progressList] = await Promise.all([trainingApi.getCourses(), trainingApi.getProgress()]);
      setCourses(Array.isArray(courseList) ? courseList : []);
      setProgress(Object.fromEntries((Array.isArray(progressList) ? progressList : []).map((p) => [p.courseId, p])));
    } catch (err) {
      setLoadError(getApiErrorMessage(err, 'The training courses could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMyCertificates = useCallback(async (selectId?: string) => {
    setMyCertsLoading(true);
    setMyCertsError(null);
    try {
      const list = await api.getMyCertificates();
      const certs = Array.isArray(list) ? list : [];
      setMyCertificates(certs);
      setCertificate((current) => {
        if (selectId) return certs.find((c) => c.certificateId === selectId) || current;
        if (current) return certs.find((c) => c.certificateId === current.certificateId) || current;
        // Default to the newest valid certificate, otherwise the newest one
        return certs.find((c) => c.status === 'VALID') || certs[0] || null;
      });
    } catch (err) {
      setMyCertsError(getApiErrorMessage(err, 'Your certificates could not be loaded.'));
    } finally {
      setMyCertsLoading(false);
    }
  }, []);

  const loadRegister = useCallback(async () => {
    setRegisterLoading(true);
    setRegisterError(null);
    try {
      const list = await api.getCertificates();
      setRegister(Array.isArray(list) ? list : []);
    } catch (err) {
      setRegisterError(getApiErrorMessage(err, 'The competency register could not be loaded.'));
    } finally {
      setRegisterLoaded(true);
      setRegisterLoading(false);
    }
  }, []);

  /** Verification links look like /training?cert=CERT-5S-XXXX: open that certificate directly. */
  const openCertificateFromUrl = useCallback(async () => {
    let code: string | null = null;
    try {
      code = new URLSearchParams(window.location.search).get('cert');
    } catch {
      code = null;
    }
    if (!code) return;
    try {
      const cert = await api.getCertificate(code);
      setCertificate(cert);
      setActiveTab('certificates');
    } catch (err) {
      addToast({ type: 'error', title: 'Certificate not found', message: getApiErrorMessage(err, `Certificate ${code} could not be verified.`) });
    }
  }, [addToast]);

  useEffect(() => {
    loadCourses();
    loadMyCertificates();
    openCertificateFromUrl();
  }, [loadCourses, loadMyCertificates, openCertificateFromUrl]);

  useEffect(() => {
    if (activeTab === 'register' && canViewRegister && !registerLoaded && !registerLoading) loadRegister();
  }, [activeTab, canViewRegister, registerLoaded, registerLoading, loadRegister]);

  const handleToggleLesson = async (courseId: string, lessonId: string, completed: boolean) => {
    if (savingLessonId) return;
    setSavingLessonId(lessonId);
    try {
      const updated = await trainingApi.setLessonCompleted({ courseId, lessonId, completed });
      const wasCompleted = progress[courseId]?.completed ?? false;
      setProgress((prev) => ({ ...prev, [courseId]: updated }));
      if (updated.completed && !wasCompleted) {
        addToast({ type: 'success', title: 'Course completed', message: 'All lessons in this course are done.' });
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Progress not saved', message: getApiErrorMessage(err, 'Your progress could not be saved.') });
    } finally {
      setSavingLessonId(null);
    }
  };

  const handleQuizSubmitted = (result: QuizSubmissionResult) => {
    if (!result.passed) return;
    if (result.certificate) setCertificate(result.certificate);
    // Refresh the stored history so the new or renewed certificate shows under "My certificates"
    loadMyCertificates(result.certificate?.certificateId);
    if (registerLoaded) loadRegister();
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const updated = await api.revokeCertificate(revokeTarget.certificateId);
      const revoke = (c: TrainingCertificate) => (c.certificateId === revokeTarget.certificateId ? { ...c, ...(updated || {}), status: 'REVOKED' as const } : c);
      setRegister((prev) => prev.map(revoke));
      setMyCertificates((prev) => prev.map(revoke));
      setCertificate((prev) => (prev ? revoke(prev) : prev));
      addToast({ type: 'success', title: 'Certificate revoked', message: `${revokeTarget.certificateId} (${revokeTarget.traineeName}) is no longer valid.` });
      setRevokeTarget(null);
    } catch (err) {
      addToast({ type: 'error', title: 'Revoke failed', message: getApiErrorMessage(err, 'The certificate could not be revoked.') });
    } finally {
      setRevoking(false);
    }
  };

  const totalLessons = useMemo(() => courses.reduce((n, c) => n + c.lessons.length, 0), [courses]);
  const completedCourses = courses.filter((c) => progress[c.id]?.completed).length;
  const startedAny = courses.some((c) => (progress[c.id]?.completedLessonIds.length ?? 0) > 0);
  const nextCourse = courses.find((c) => !progress[c.id]?.completed) ?? courses[0];
  const programPercent = courses.length > 0 ? Math.round((completedCourses / courses.length) * 100) : 0;
  const openCourse = openCourseId ? courses.find((c) => c.id === openCourseId) ?? null : null;
  const hasValidCert = myCertificates.some((c) => c.status === 'VALID');

  const openCourseView = (courseId: string) => {
    setOpenCourseId(courseId);
    setActiveTab('courses');
  };

  const tabs = [
    { id: 'courses', label: 'Courses', icon: <BookOpen size={15} />, badge: courses.length || undefined },
    { id: 'assessment', label: 'Assessment', icon: <HelpCircle size={15} /> },
    { id: 'certificates', label: 'My certificates', icon: <Award size={15} />, badge: hasValidCert ? 'Valid' : myCertificates.length || undefined },
    ...(canViewRegister ? [{ id: 'register', label: 'Competency register', icon: <Users size={15} />, badge: registerLoaded && !registerError ? register.length : undefined }] : []),
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <PageHeader
        title="Training"
        description={
          <>
            5S courses and the competency assessment{currentTenant?.name ? ` for ${currentTenant.name}` : ''}.
            {passPercent !== null ? ` Pass the assessment with ${passPercent}% or more to earn your certificate.` : ''}
          </>
        }
        actions={
          nextCourse ? (
            <Button variant="primary" icon={<PlayCircle size={16} />} onClick={() => openCourseView(nextCourse.id)}>
              {startedAny ? 'Continue training' : 'Start training'}
            </Button>
          ) : undefined
        }
      />

      {courses.length > 0 && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Your progress</span>
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {completedCourses} of {courses.length}
                  </strong>{' '}
                  {courses.length === 1 ? 'course' : 'courses'} completed
                </span>
              </div>
              <ProgressBar value={programPercent} height={8} color={programPercent === 100 ? 'success' : 'primary'} ariaLabel="Training progress" />
            </div>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {courses.length} {courses.length === 1 ? 'course' : 'courses'} · {lessonsLabel(totalLessons)}
            </span>
          </div>
        </Card>
      )}

      <Tabs tabs={tabs} activeTab={activeTab} onChange={(id) => setActiveTab(id as TabId)} ariaLabel="Training sections" />

      {activeTab === 'courses' &&
        (loading ? (
          <Card><LoadingState label="Loading courses…" /></Card>
        ) : loadError ? (
          <Card><ErrorState message={loadError} onRetry={loadCourses} /></Card>
        ) : courses.length === 0 ? (
          <Card><EmptyState title="No courses yet" description="Training courses will appear here once they are available." /></Card>
        ) : openCourse ? (
          <CourseViewer
            course={openCourse}
            progress={progress[openCourse.id]}
            savingLessonId={savingLessonId}
            onToggleLesson={(lessonId, completed) => handleToggleLesson(openCourse.id, lessonId, completed)}
            onBack={() => setOpenCourseId(null)}
            onTakeAssessment={() => setActiveTab('assessment')}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="grid-auto" style={{ ['--min' as string]: 'min(320px, 100%)', gap: '16px' } as React.CSSProperties}>
              {courses.map((course) => {
                const p = progress[course.id];
                const doneCount = p?.completedLessonIds.length ?? 0;
                const total = course.lessons.length;
                const percent = p?.completed ? 100 : total > 0 ? Math.round((doneCount / total) * 100) : 0;
                const actionLabel = p?.completed ? 'Review' : doneCount > 0 ? 'Continue' : 'Open';
                return (
                  <article key={course.id} className="card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <Badge variant="neutral">{course.badgeText}</Badge>
                      {p?.completed ? (
                        <Badge variant="success" icon={<CheckCircle2 size={12} />}>
                          Completed
                        </Badge>
                      ) : doneCount > 0 ? (
                        <Badge variant="info">In progress</Badge>
                      ) : null}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0', lineHeight: 1.4 }}>{course.title}</h2>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{course.description}</p>
                    </div>
                    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        <span>
                          {doneCount > 0 && !p?.completed ? `${doneCount} of ${lessonsLabel(total)} done` : lessonsLabel(total)}
                          {course.videoUrl ? ' · video' : ' · reading'}
                        </span>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{percent}%</span>
                      </div>
                      <ProgressBar value={percent} height={6} color={p?.completed ? 'success' : 'primary'} ariaLabel={`${course.title} progress`} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid var(--border-subtle)' }}>
                      <Button
                        variant={p?.completed ? 'secondary' : 'primary'}
                        size="sm"
                        icon={<ChevronRight size={16} />}
                        onClick={() => openCourseView(course.id)}
                        aria-label={`${actionLabel} ${course.title}`}
                      >
                        {actionLabel}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="section-intro-banner">
              <div className="section-intro-content">
                <div className="section-intro-icon" aria-hidden="true">
                  <Award size={20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Competency assessment</h2>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.5 }}>
                    Scenario questions on the five pillars, auditing, red tags and root cause analysis.
                    {passPercent !== null ? ` Pass mark ${passPercent}%.` : ''}
                  </div>
                </div>
              </div>
              <Button variant="primary" icon={<Award size={16} />} onClick={() => setActiveTab('assessment')}>
                Take the assessment
              </Button>
            </div>
          </div>
        ))}

      {activeTab === 'assessment' && (
        <div style={{ maxWidth: '820px', margin: '0 auto', width: '100%' }}>
          <AssessmentPanel passPercent={passPercent} onSubmitted={handleQuizSubmitted} onViewCertificate={() => setActiveTab('certificates')} />
        </div>
      )}

      {activeTab === 'certificates' && (
        <CertificatesPanel
          certificates={myCertificates}
          loading={myCertsLoading}
          error={myCertsError}
          onReload={() => loadMyCertificates()}
          shown={certificate}
          onShow={setCertificate}
          onTakeAssessment={() => setActiveTab('assessment')}
          passPercent={passPercent}
          tenant={currentTenant}
        />
      )}

      {activeTab === 'register' && canViewRegister && (
        <CompetencyRegisterPanel
          certificates={register}
          loading={registerLoading}
          error={registerError}
          onReload={loadRegister}
          onView={(c) => {
            setCertificate(c);
            setActiveTab('certificates');
          }}
          onRevoke={canRevoke ? setRevokeTarget : undefined}
        />
      )}

      <ConfirmDialog
        isOpen={revokeTarget !== null}
        title="Revoke certificate?"
        message={
          <>
            {revokeTarget && (
              <span style={{ display: 'block', marginBottom: '8px' }}>
                <span className="code-tag">{revokeTarget.certificateId}</span> · {revokeTarget.traineeName}
              </span>
            )}
            The certificate will be marked as revoked immediately and cannot be reinstated. If your organization requires certified auditors,{' '}
            <strong>{revokeTarget?.traineeName || 'this person'}</strong> will no longer be able to conduct audits until they pass the assessment again.
          </>
        }
        confirmLabel="Revoke certificate"
        tone="danger"
        busy={revoking}
        onConfirm={() => void handleRevoke()}
        onCancel={() => {
          if (!revoking) setRevokeTarget(null);
        }}
      />
    </div>
  );
};
