import React, { useRef } from 'react';
import { ArrowLeft, Award, CheckCircle2, FileText, PlayCircle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { CourseProgress, TrainingCourse } from '../../services/trainingApi';

interface CourseViewerProps {
  course: TrainingCourse;
  progress: CourseProgress | undefined;
  /** Lesson id currently being saved, so its button shows a busy state. */
  savingLessonId: string | null;
  onToggleLesson: (lessonId: string, completed: boolean) => void;
  onBack: () => void;
  onTakeAssessment: () => void;
}

/** "mm:ss" or "h:mm:ss" -> seconds. */
const toSeconds = (time: string): number =>
  time
    .split(':')
    .map((p) => parseInt(p, 10))
    .reduce((total, part) => (Number.isFinite(part) ? total * 60 + part : total * 60), 0);

/**
 * One course. Without a video the lessons are the reading material; when the course has a video the player
 * appears above them and lessons with a start time can jump to it.
 */
export const CourseViewer: React.FC<CourseViewerProps> = ({ course, progress, savingLessonId, onToggleLesson, onBack, onTakeAssessment }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const done = new Set(progress?.completedLessonIds ?? []);
  const percent = progress?.percent ?? 0;

  const playFrom = (time: string) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = toSeconds(time);
    video.play().catch(() => undefined);
    video.focus();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '900px', width: '100%', margin: '0 auto' }}>
      <div>
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBack}>
          All courses
        </Button>
      </div>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Badge variant={progress?.completed ? 'success' : 'neutral'}>{progress?.completed ? 'Completed' : course.badgeText}</Badge>
            <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              {course.lessons.length} {course.lessons.length === 1 ? 'lesson' : 'lessons'}
            </span>
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>{course.title}</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{course.description}</p>
          <div style={{ marginTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              <span>Your progress</span>
              <strong style={{ color: 'var(--text-primary)' }}>
                {done.size} of {course.lessons.length} lessons
              </strong>
            </div>
            <ProgressBar value={percent} height={6} color={progress?.completed ? 'success' : 'primary'} ariaLabel={`Progress in ${course.title}`} />
          </div>
        </div>
      </Card>

      {course.videoUrl && (
        <Card noPadding>
          <div style={{ width: '100%', aspectRatio: '16 / 9', background: '#0F172A', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
            <video ref={videoRef} src={course.videoUrl} controls preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'contain' }}>
              {course.captionsUrl && <track kind="captions" src={course.captionsUrl} srcLang="en" label="English" default />}
            </video>
          </div>
        </Card>
      )}

      <Card title="Lessons" subtitle="Read each lesson and mark it done. Your progress is saved to your account.">
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
          {course.lessons.map((lesson, i) => {
            const isDone = done.has(lesson.id);
            return (
              <li
                key={lesson.id}
                style={{
                  padding: '14px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)',
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: isDone ? 'var(--color-success-bg)' : 'var(--bg-surface-subtle)',
                    border: isDone ? '1px solid var(--color-success-border)' : '1px solid var(--border-subtle)',
                    color: isDone ? 'var(--color-success)' : 'var(--text-secondary)',
                    fontSize: '12.5px',
                    fontWeight: 600,
                  }}
                  aria-hidden="true"
                >
                  {isDone ? <CheckCircle2 size={16} /> : i + 1}
                </span>
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                    <span className="sr-only">Lesson {i + 1}{isDone ? ', done' : ''}: </span>
                    {lesson.title}
                  </h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: 1.5 }}>{lesson.summary}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginLeft: 'auto' }}>
                  {course.videoUrl && lesson.videoStart && (
                    <Button variant="ghost" size="sm" icon={<PlayCircle size={14} />} onClick={() => playFrom(lesson.videoStart as string)}>
                      Play from {lesson.videoStart}
                    </Button>
                  )}
                  <Button
                    variant={isDone ? 'secondary' : 'primary'}
                    size="sm"
                    aria-pressed={isDone}
                    loading={savingLessonId === lesson.id}
                    disabled={savingLessonId !== null && savingLessonId !== lesson.id}
                    onClick={() => onToggleLesson(lesson.id, !isDone)}
                  >
                    {isDone ? (
                      <>
                        <CheckCircle2 size={14} aria-hidden="true" /> Done
                      </>
                    ) : (
                      'Mark as done'
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {course.keyTakeaways.length > 0 && (
        <Card title="Key takeaways">
          <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
            {course.keyTakeaways.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Card>
      )}

      {course.jobAidUrl && (
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <FileText size={20} color="var(--color-primary)" aria-hidden="true" />
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{course.jobAidTitle || 'Job aid'}</div>
            </div>
            <a className="btn btn-secondary btn-sm" href={course.jobAidUrl} target="_blank" rel="noopener noreferrer">
              Open job aid
            </a>
          </div>
        </Card>
      )}

      {progress?.completed && (
        <div className="section-intro-banner">
          <div className="section-intro-content">
            <div className="section-intro-icon" aria-hidden="true">
              <CheckCircle2 size={20} />
            </div>
            <span style={{ fontSize: '14px', color: 'var(--text-primary)', fontWeight: 600 }}>You have completed this course.</span>
          </div>
          <Button variant="primary" icon={<Award size={16} />} onClick={onTakeAssessment}>
            Take the assessment
          </Button>
        </div>
      )}
    </div>
  );
};
