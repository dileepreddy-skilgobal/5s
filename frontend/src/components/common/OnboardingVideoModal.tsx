import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { PlayCircle, CheckCircle2, Video, Sparkles, BookOpen, Clock } from 'lucide-react';

interface OnboardingVideoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OnboardingVideoModal: React.FC<OnboardingVideoModalProps> = ({ isOpen, onClose }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Welcome to 5S: Quick 3-Minute Platform Tour"
      subtitle="Essential onboarding guide for machine operators, area owners, and certified auditors"
      maxWidth="760px"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={13} />
            <span>Duration: 3 minutes 20 seconds</span>
          </div>
          <Button variant="primary" icon={<CheckCircle2 size={16} />} onClick={onClose}>
            Done Watching
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Video Player */}
        <div
          style={{
            width: '100%',
            height: '340px',
            background: '#0B1120',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <video
            src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
            poster="/assets/5s/cnc_workstation_clean.jpg"
            controls
            autoPlay
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>

        {/* 3 Core Highlights */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)', marginBottom: '4px' }}>
              1. Scan Area QR Code
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Scan physical machine badges to initiate audits or report immediate abnormalities.
            </div>
          </div>

          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)', marginBottom: '4px' }}>
              2. Capture Photo Evidence
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Upload clear before/after photos with annotations to document non-conformances.
            </div>
          </div>

          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)', marginBottom: '4px' }}>
              3. 5-Why RCA Remediation
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Resolve underlying systemic root causes with supervisor sign-off and SOP updates.
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
