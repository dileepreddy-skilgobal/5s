import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useI18n } from '../../i18n';
import { api, getApiErrorMessage, isPlanFeatureRequiredError } from '../../services/api';
import { PlanUpgradeNotice } from '../../components/common/PlanUpgradeNotice';
import { adminApi } from '../../services/api-admin';
import { AdminGamificationLeaderboards } from '../../types/admin';
import { useRecognitionSettings } from './recognitionSettings';
import {
  GamificationOverview,
  TrophiesAndAwardsData,
  BadgesAndMilestonesData,
  FloatingTrophy,
  TrophyHallOfFameItem,
  KudosCategory,
  TopContributor,
  TrophyKey,
  Location,
  User,
} from '../../types';
import { humanize } from '../../constants/labels';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { FormField } from '../../components/ui/FormField';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabItem } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { EmptyState } from '../../components/ui/StateViews';
import { RankMedal, SectionState, SegmentedFilter } from './recognitionParts';
import './recognition.css';
import {
  Trophy,
  Award,
  Medal,
  Sparkles,
  Zap,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  CheckCircle2,
  Star,
  Send,
  Printer,
  Lightbulb,
  Eye,
  Tag,
  RefreshCw,
  Heart,
  Calendar,
  Target,
  ClipboardCheck,
  Flame,
  Building2,
  Users,
  Lock,
  ArrowRight,
  Crown,
} from 'lucide-react';

const KUDOS_CATEGORY_LABELS: Record<KudosCategory, string> = {
  '5S_EXCELLENCE': '5S excellence',
  TEAMWORK: 'Teamwork',
  CLEAN_STREAK: 'Clean streak',
  RAPID_CAPA: 'Rapid corrective action',
  SAFETY_FIRST: 'Safety first',
  KAIZEN_INNOVATION: 'Kaizen improvement',
};

/** Server limits (GiveKudosDto.message, AwardTrophyDto.citation). */
const KUDOS_MESSAGE_MAX = 500;
const CITATION_MAX = 500;

/** Headings for server point-rule categories (unknown categories fall back to a humanized code). */
const RULE_CATEGORY_LABELS: Record<string, string> = {
  AUDIT: 'Audits and scores',
  CAPA: 'Corrective actions',
  OBSERVATION: 'Reporting issues',
  SORT: 'Sort and red tags',
  RECOGNITION: 'Peer recognition',
  TROPHY: 'Floating trophies',
};

const RULE_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  AUDIT: <CheckCircle2 size={18} />,
  CAPA: <Zap size={18} />,
  OBSERVATION: <Eye size={18} />,
  SORT: <Tag size={18} />,
  RECOGNITION: <Heart size={18} />,
  TROPHY: <Trophy size={18} />,
};

const TROPHY_ICONS: Record<string, React.ReactNode> = {
  BROOM: <Sparkles size={26} />,
  CUP: <Trophy size={26} />,
  SHIELD: <ShieldCheck size={26} />,
  STAR: <Star size={26} />,
};

/** Colour families of the recognition palette (recognition.css): gold trophies, violet badges, rose kudos, teal points. */
type Tone = 'gold' | 'violet' | 'rose' | 'teal' | 'sky' | 'green' | 'orange';

/** Rounded icon tile tinted in one palette colour. */
const IconTile: React.FC<{ children: React.ReactNode; tone?: Tone; size?: 'sm' | 'md' | 'lg' }> = ({ children, tone = 'sky', size = 'md' }) => (
  <span aria-hidden="true" className={`rc-icon rc-tone-${tone}${size === 'md' ? '' : ` ${size}`}`}>
    {children}
  </span>
);

const RULE_CATEGORY_TONES: Record<string, Tone> = { AUDIT: 'sky', CAPA: 'teal', OBSERVATION: 'violet', SORT: 'orange', RECOGNITION: 'rose', TROPHY: 'gold' };

/** Point rules (server RuleKey) → their category, for the colour and icon of each "how you earned XP" row. */
const RULE_CATEGORY_OF: Record<string, string> = {
  AUDIT_CONDUCTED: 'AUDIT',
  AREA_AUDIT_EXCELLENT: 'AUDIT',
  AREA_AUDIT_PASSED: 'AUDIT',
  ACTION_ON_TIME: 'CAPA',
  OBSERVATION_REPORTED: 'OBSERVATION',
  RED_TAG_RAISED: 'SORT',
  KUDOS_RECEIVED: 'RECOGNITION',
  TROPHY_AWARDED: 'TROPHY',
};

const KUDOS_CATEGORY_TONES: Record<string, Tone> = {
  '5S_EXCELLENCE': 'gold',
  TEAMWORK: 'sky',
  CLEAN_STREAK: 'teal',
  RAPID_CAPA: 'orange',
  SAFETY_FIRST: 'green',
  KAIZEN_INNOVATION: 'violet',
};

/** Badge rarity colours. */
const BADGE_TIER_TONES: Record<string, Tone> = { COMMON: 'teal', RARE: 'sky', EPIC: 'violet', LEGENDARY: 'gold' };

/** Circular progress ring around the level number in the hero. */
const LevelRing: React.FC<{ level: number; percent: number }> = ({ level, percent }) => {
  const r = 46;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return (
    <div className="rc-level-ring" role="img" aria-label={`Level ${level}, ${Math.round(p)}% of the way to the next level`}>
      <svg viewBox="0 0 104 104" aria-hidden="true">
        <circle cx="52" cy="52" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="8" />
        <circle cx="52" cy="52" r={r} fill="none" stroke="url(#rc-ring)" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />
        <defs>
          <linearGradient id="rc-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#F9D976" />
            <stop offset="1" stopColor="#F39C12" />
          </linearGradient>
        </defs>
      </svg>
      <div className="rc-level-ring-label" aria-hidden="true">
        <span>Level</span>
        <span>{level}</span>
      </div>
    </div>
  );
};

/** Two-letter initials for an avatar circle. */
const initialsOf = (name: string | null | undefined): string =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

const BADGE_ICONS: Record<string, React.ReactNode> = {
  Sparkles: <Sparkles size={20} />,
  Zap: <Zap size={20} />,
  Tag: <Tag size={20} />,
  ShieldCheck: <ShieldCheck size={20} />,
  Lightbulb: <Lightbulb size={20} />,
  Eye: <Eye size={20} />,
};

/** Fields the server sends beyond the shared types. */
type OverviewData = GamificationOverview & { kudosPoints?: number };
type HallOfFameItem = TrophyHallOfFameItem & { periodStart?: string; periodEnd?: string };

type SectionData<T> = { data: T | null; loading: boolean; error: string | null };
const emptySection = <T,>(): SectionData<T> => ({ data: null, loading: true, error: null });

/** Null-safe percent display — never invent a number. */
const fmtPct = (value: number | null | undefined): string =>
  value === null || value === undefined ? '—' : `${Math.round(value * 10) / 10}%`;

/** The contender metric is what each trophy ranks on: a count of on-time verified actions for the Kaizen Shield, a score percent otherwise. */
const formatContenderMetric = (trophyId: TrophyKey, metric: number | null | undefined): string => {
  if (metric === null || metric === undefined) return '—';
  switch (trophyId) {
    case 'KAIZEN_SHIELD':
      return `${metric} ${metric === 1 ? 'action' : 'actions'} verified on time`;
    case 'GOLDEN_BROOM':
      return `${fmtPct(metric)} 3S Shine average`;
    case 'SAFETY_VANGUARD':
      return `${fmtPct(metric)} safety average`;
    default:
      return `${fmtPct(metric)} average score`;
  }
};

/** A calendar day sent as YYYY-MM-DD, read as a local date (new Date('YYYY-MM-DD') is UTC midnight). */
const parseDay = (ymd: string | null | undefined): Date | null => {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const RecognitionPage: React.FC = () => {
  const { currentTenant, addToast, currentUser, can } = useApp();
  const { settings: recognition, loaded: recognitionLoaded } = useRecognitionSettings();
  const { formatDate, formatDateTime, formatNumber, formatRelative } = useI18n();
  const date = (iso: string | null | undefined) => formatDate(iso) || '—';

  const [activeTab, setActiveTab] = useState('trophies');
  const [badgeFilter, setBadgeFilter] = useState<'ALL' | 'UNLOCKED' | 'IN_PROGRESS'>('ALL');

  // Each section loads and fails on its own, so one failing endpoint never blanks the whole page
  const [overview, setOverview] = useState<SectionData<OverviewData>>(emptySection);
  const [leaderboards, setLeaderboards] = useState<SectionData<AdminGamificationLeaderboards>>(emptySection);
  const [trophies, setTrophies] = useState<SectionData<TrophiesAndAwardsData>>(emptySection);
  const [badges, setBadges] = useState<SectionData<BadgesAndMilestonesData>>(emptySection);
  // 403 PLAN_FEATURE_REQUIRED: recognition (GAMIFICATION) is not included in the organization's plan
  const [planLocked, setPlanLocked] = useState(false);

  // Reference data for the award and kudos forms
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [usersError, setUsersError] = useState<string | null>(null);

  // Modals
  const [awardModalOpen, setAwardModalOpen] = useState(false);
  const [selectedTrophyToAward, setSelectedTrophyToAward] = useState<FloatingTrophy | null>(null);
  const [selectedNewLocationId, setSelectedNewLocationId] = useState('');
  const [trophyCitation, setTrophyCitation] = useState('');
  const [citationError, setCitationError] = useState<string | null>(null);

  const [kudosModalOpen, setKudosModalOpen] = useState(false);
  const [kudosToUserId, setKudosToUserId] = useState('');
  const [kudosCategory, setKudosCategory] = useState<KudosCategory>('5S_EXCELLENCE');
  const [kudosMessage, setKudosMessage] = useState('');
  const [kudosMessageError, setKudosMessageError] = useState<string | null>(null);

  const [selectedCertItem, setSelectedCertItem] = useState<HallOfFameItem | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadSection = useCallback(
    async <T,>(fetcher: () => Promise<T>, set: React.Dispatch<React.SetStateAction<SectionData<T>>>, label: string) => {
      set((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await fetcher();
        set({ data, loading: false, error: null });
      } catch (err) {
        if (isPlanFeatureRequiredError(err)) setPlanLocked(true);
        set((s) => ({ ...s, loading: false, error: getApiErrorMessage(err, `${label} could not be loaded.`) }));
      }
    },
    [],
  );

  const loadOverview = useCallback(() => loadSection<OverviewData>(api.getGamificationOverview, setOverview, 'Your points'), [loadSection]);
  const loadLeaderboards = useCallback(() => loadSection(adminApi.getGamificationLeaderboards, setLeaderboards, 'Leaderboards'), [loadSection]);
  const loadTrophies = useCallback(() => loadSection(api.getGamificationTrophies, setTrophies, 'Trophies and kudos'), [loadSection]);
  const loadBadges = useCallback(() => loadSection(api.getGamificationBadges, setBadges, 'Badges'), [loadSection]);

  const loadReferenceData = useCallback(async () => {
    const [locs, people] = await Promise.allSettled([api.getLocations(), api.getUsers()]);
    if (locs.status === 'fulfilled') {
      // Only ACTIVE areas can receive a trophy
      setLocations((Array.isArray(locs.value) ? locs.value : []).filter((l) => l.status === 'ACTIVE'));
      setLocationsError(null);
    } else {
      setLocationsError(getApiErrorMessage(locs.reason, 'Areas could not be loaded.'));
    }
    if (people.status === 'fulfilled') {
      setUsers(Array.isArray(people.value) ? people.value : []);
      setUsersError(null);
    } else {
      setUsersError(getApiErrorMessage(people.reason, 'Colleagues could not be loaded.'));
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setPlanLocked(false);
    await Promise.all([loadOverview(), loadLeaderboards(), loadTrophies(), loadBadges(), loadReferenceData()]);
  }, [loadOverview, loadLeaderboards, loadTrophies, loadBadges, loadReferenceData]);

  useEffect(() => {
    loadAllData();
  }, [currentTenant, loadAllData]);

  const anyLoading = overview.loading || leaderboards.loading || trophies.loading || badges.loading;
  const kudosPoints = typeof overview.data?.kudosPoints === 'number' ? overview.data.kudosPoints : null;
  const kudosXpLabel = kudosPoints !== null ? ` (+${kudosPoints} XP)` : '';
  const floatingTrophies = trophies.data?.floatingTrophies ?? [];

  // Open the award modal for a trophy, pre-selecting its current front-runner when it is an active area
  const openAwardModal = (trophy: FloatingTrophy) => {
    setSelectedTrophyToAward(trophy);
    const contenderId = trophy.suggestedContender?.locationId;
    if (contenderId && locations.some((l) => l.id === contenderId)) {
      setSelectedNewLocationId(contenderId);
    } else if (!locations.some((l) => l.id === selectedNewLocationId)) {
      setSelectedNewLocationId(locations[0]?.id ?? '');
    }
    setCitationError(null);
    setAwardModalOpen(true);
  };

  const handleAwardTrophySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrophyToAward || actionLoading) return;
    if (!selectedNewLocationId) return;
    const citation = trophyCitation.trim();
    if (!citation) {
      setCitationError('Write a citation for the award.');
      return;
    }
    setActionLoading(true);
    try {
      // The server records the signed-in user as the awarder.
      await api.awardTrophy({ trophyId: selectedTrophyToAward.id, newLocationId: selectedNewLocationId, citation });
      addToast({ type: 'success', title: 'Trophy awarded', message: `${selectedTrophyToAward.title} has been awarded. The previous holder moved to the hall of fame.` });
      setAwardModalOpen(false);
      setSelectedTrophyToAward(null);
      setTrophyCitation('');
      loadTrophies();
      loadLeaderboards();
      loadOverview();
    } catch (err) {
      addToast({ type: 'error', title: 'Award failed', message: getApiErrorMessage(err, 'The trophy could not be awarded.') });
    } finally {
      setActionLoading(false);
    }
  };

  // Recipients: ACTIVE tenant users, excluding the signed-in user (no self-kudos)
  const kudosRecipients = users.filter((u) => u.status === 'ACTIVE' && u.id !== currentUser?.id);

  const openKudosModal = () => {
    if (!kudosRecipients.some((u) => u.id === kudosToUserId)) {
      setKudosToUserId(kudosRecipients[0]?.id ?? '');
    }
    setKudosMessageError(null);
    setKudosModalOpen(true);
  };

  const handleGiveKudosSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actionLoading || !kudosToUserId) return;
    const message = kudosMessage.trim();
    if (!message) {
      setKudosMessageError('Write a short message for your colleague.');
      return;
    }
    setActionLoading(true);
    try {
      // The server records the sender and fixes the XP awarded.
      await api.giveKudos({ toUserId: kudosToUserId, category: kudosCategory, message: message.slice(0, KUDOS_MESSAGE_MAX) });
      const recipient = kudosRecipients.find((u) => u.id === kudosToUserId);
      const recipientName = recipient ? `${recipient.firstName} ${recipient.lastName}`.trim() : 'your colleague';
      addToast({ type: 'success', title: 'Kudos sent', message: `Recognition sent to ${recipientName}.` });
      setKudosModalOpen(false);
      setKudosMessage('');
      loadTrophies();
      loadLeaderboards();
    } catch (err) {
      addToast({ type: 'error', title: 'Kudos not sent', message: getApiErrorMessage(err, 'The recognition could not be sent.') });
    } finally {
      setActionLoading(false);
    }
  };

  const tabs: TabItem[] = [
    { id: 'trophies', label: 'Trophies', icon: <Trophy size={15} />, badge: trophies.data?.floatingTrophies.length },
    { id: 'leaderboards', label: 'Leaderboards', icon: <Medal size={15} /> },
    { id: 'badges', label: 'Badges', icon: <Award size={15} />, badge: badges.data?.unlockedCount },
    { id: 'rules', label: 'Points', icon: <Zap size={15} /> },
    { id: 'kudos', label: 'Kudos', icon: <Heart size={15} />, badge: trophies.data?.kudosFeed.length },
  ];

  const renderContributorCard = (title: string, icon: React.ReactNode, tone: Tone, contributor: TopContributor | null, countLabel: string, emptyText: string) => (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <IconTile tone={tone} size="sm">{icon}</IconTile>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
      </div>
      {contributor ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span className={`rc-avatar rc-tone-${tone}`} aria-hidden="true">{initialsOf(contributor.name)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{contributor.name}</div>
              <div className="rc-muted">{contributor.department || '—'}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }} className={`rc-tone-${tone}`}>
            <div className="rc-accent" style={{ fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{formatNumber(contributor.count)}</div>
            <div className="rc-muted">{countLabel}</div>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>{emptyText}</p>
      )}
    </Card>
  );

  const pageHeader = (
    <PageHeader
      title="Recognition"
      description="Points, trophies, badges and kudos, calculated from recorded 5S activity."
      actions={
        !planLocked ? (
          <>
            {can('SHOPFLOOR_REPORTERS') && (
              <Button variant="secondary" icon={<Heart size={16} />} onClick={openKudosModal}>
                Send kudos{kudosXpLabel}
              </Button>
            )}
            <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => loadAllData()} loading={anyLoading}>
              Refresh
            </Button>
            {can('RECOGNITION_AWARDERS') && floatingTrophies.length > 0 && (
              <Button variant="primary" icon={<Trophy size={16} />} onClick={() => openAwardModal(floatingTrophies[0])}>
                Award trophy
              </Button>
            )}
          </>
        ) : undefined
      }
    />
  );

  if (recognitionLoaded && !recognition.enabled) {
    return (
      <div className="animate-fade-in rc-page">
        <PageHeader title="Recognition" description="Points, trophies, badges and kudos, calculated from recorded 5S activity." />
        <Card>
          <EmptyState
            icon={<Trophy size={28} />}
            title="Recognition is turned off for your organization"
            description="Points, badges, trophies and kudos are not in use. Past awards are kept and reappear if recognition is turned on again."
            action={
              can('ORG_ADMINS') ? (
                <Link to="/settings?section=recognition" className="btn btn-secondary">
                  Open recognition settings
                </Link>
              ) : undefined
            }
          />
        </Card>
      </div>
    );
  }

  if (planLocked) {
    return (
      <div className="animate-fade-in rc-page">
        {pageHeader}
        <PlanUpgradeNotice
          feature="Recognition"
          description="Recognition (XP, badges, leaderboards, floating trophies and kudos) is not included in your organization's current plan."
        />
      </div>
    );
  }

  const filteredBadges =
    badges.data?.badges.filter((b) => (badgeFilter === 'UNLOCKED' ? b.unlocked : badgeFilter === 'IN_PROGRESS' ? !b.unlocked : true)) ?? [];

  const hallPeriod = (h: HallOfFameItem) => (h.periodStart && h.periodEnd ? `${date(h.periodStart)} – ${date(h.periodEnd)}` : h.period);

  return (
    <div className="animate-fade-in rc-page">
      {pageHeader}

      {/* Your level and how this season's XP was earned */}
      <SectionState state={overview} label="your points" onRetry={loadOverview}>
        {(ov) => {
          const stats = ov.userStats;
          const kpis: Array<{ label: string; value: string; hint?: string; icon: React.ReactNode; tone: Tone }> = [
            {
              label: 'Passing audit streak',
              value: stats.passingAuditStreak !== null ? formatNumber(stats.passingAuditStreak) : '—',
              hint: stats.passingAuditStreak !== null ? 'Consecutive passing audits across the areas you own' : 'Own an area to build a passing audit streak',
              icon: <Flame size={18} />,
              tone: 'orange',
            },
            { label: 'Audits conducted', value: formatNumber(stats.kpis.auditsConducted), icon: <ClipboardCheck size={18} />, tone: 'sky' },
            { label: 'Actions closed on time', value: formatNumber(stats.kpis.actionsClosedOnTime), icon: <Zap size={18} />, tone: 'teal' },
            { label: 'Trophies held', value: formatNumber(stats.kpis.floatingTrophiesHeld), icon: <Trophy size={18} />, tone: 'gold' },
            { label: 'Issues reported', value: formatNumber(stats.kpis.observationsReported), icon: <Eye size={18} />, tone: 'violet' },
            { label: 'Red tags raised', value: formatNumber(stats.kpis.redTagsRaised), icon: <Tag size={18} />, tone: 'orange' },
            { label: 'Kudos received', value: formatNumber(stats.kpis.kudosReceived), icon: <Heart size={18} />, tone: 'rose' },
          ];
          const breakdown = stats.pointsBreakdown ?? [];
          const maxPoints = Math.max(1, ...breakdown.map((b) => Math.abs(b.points)));
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <section className="rc-hero" aria-label="Your level and points">
                <LevelRing level={stats.currentLevel.levelNumber} percent={stats.currentLevel.progressPercent} />
                <div style={{ minWidth: 0, position: 'relative', zIndex: 1 }}>
                  <p className="rc-hero-title">{currentUser?.fullName ? `${currentUser.fullName} · your level` : 'Your level'}</p>
                  <h2 className="rc-hero-level">{stats.currentLevel.title}</h2>
                  <div className="rc-hero-progress">
                    <div className="rc-hero-progress-row">
                      {stats.currentLevel.nextLevelTitle ? (
                        <>
                          <span>
                            Next: <strong>{stats.currentLevel.nextLevelTitle}</strong>
                          </span>
                          <span>
                            <strong>{stats.currentLevel.pointsToNextLevel !== null ? `${formatNumber(stats.currentLevel.pointsToNextLevel)} XP` : '—'}</strong> to go
                          </span>
                        </>
                      ) : (
                        <strong>Top level reached</strong>
                      )}
                    </div>
                    <div className="rc-hero-bar" role="progressbar" aria-label="Progress to the next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stats.currentLevel.progressPercent)}>
                      <span style={{ width: `${Math.max(0, Math.min(100, stats.currentLevel.progressPercent))}%` }} />
                    </div>
                  </div>
                </div>
                <div className="rc-hero-xp">
                  <strong>
                    {formatNumber(stats.currentPoints)}
                    <small>XP</small>
                  </strong>
                  <div className="rc-hero-rank">
                    <Crown size={14} aria-hidden="true" />
                    {stats.plantRank !== null && stats.plantRank !== undefined ? (
                      <span>
                        Rank <strong>#{stats.plantRank}</strong> of {formatNumber(stats.totalParticipants)}
                      </span>
                    ) : (
                      <span>Not ranked yet: earn XP this season</span>
                    )}
                  </div>
                </div>
              </section>

              <dl className="rc-kpis">
                {kpis.map((k) => (
                  <div key={k.label} className="rc-kpi" title={k.hint}>
                    <IconTile tone={k.tone} size="sm">{k.icon}</IconTile>
                    <div style={{ display: 'flex', flexDirection: 'column-reverse', minWidth: 0 }}>
                      <dt>{k.label}</dt>
                      <dd>{k.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>

              <Card
                title="How you earned XP this season"
                actions={
                  <Badge variant="neutral" icon={<Calendar size={12} />}>
                    {date(ov.season?.from)} – {date(ov.season?.to)}
                  </Badge>
                }
              >
                {breakdown.length > 0 ? (
                  <ul className="rc-earned">
                    {breakdown.map((item) => {
                      const category = RULE_CATEGORY_OF[item.rule] ?? '';
                      const tone = RULE_CATEGORY_TONES[category] ?? 'sky';
                      return (
                        <li key={item.rule} className={`rc-tone-${tone}`}>
                          <IconTile tone={tone} size="sm">{RULE_CATEGORY_ICONS[category] ?? <Lightbulb size={18} />}</IconTile>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                              {item.label} <span style={{ color: 'var(--text-tertiary)' }}>× {formatNumber(item.count)}</span>
                            </div>
                            <div className="rc-earned-bar" aria-hidden="true">
                              <span style={{ width: `${(Math.abs(item.points) / maxPoints) * 100}%` }} />
                            </div>
                          </div>
                          <strong style={{ color: item.points < 0 ? 'var(--color-danger)' : 'var(--tone)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {item.points > 0 ? '+' : ''}
                            {formatNumber(item.points)} XP
                          </strong>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    No XP earned yet this season. Conduct audits, close corrective actions on time, report issues or raise red tags to earn points.
                  </p>
                )}
                <div className="form-hint" style={{ marginTop: '12px' }}>Points are calculated from recorded 5S activity over a rolling 12-month season.</div>
              </Card>
            </div>
          );
        }}
      </SectionState>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} ariaLabel="Recognition sections" />

      {/* Trophies */}
      {activeTab === 'trophies' && (
        <SectionState state={trophies} label="trophies" onRetry={loadTrophies}>
          {(td) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <p className="rc-intro">
                Floating trophies move between areas based on audit results, on-time corrective actions and safety findings. The front-runner is the area that best meets
                the criteria right now; an awarder decides when to hand a trophy over.
              </p>

              {td.floatingTrophies.length === 0 ? (
                <Card>
                  <EmptyState icon={<Trophy size={28} />} title="No trophies configured" />
                </Card>
              ) : (
                <div className="grid-auto" style={{ '--min': '320px' } as React.CSSProperties}>
                  {td.floatingTrophies.map((tr) => (
                    <article key={tr.id} className="rc-trophy">
                      <div className={`rc-trophy-band tier-${tr.tier.toLowerCase()}`}>
                        <span className="rc-trophy-medal" aria-hidden="true">{TROPHY_ICONS[tr.iconType] ?? <Award size={26} />}</span>
                        <div style={{ minWidth: 0 }}>
                          <h3>{tr.title}</h3>
                          <p>{tr.subtitle}</p>
                          <div className="rc-trophy-tags">
                            <span>{humanize(tr.tier)} tier</span>
                            <span>{humanize(tr.evaluationPeriod)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="rc-trophy-body">
                        <div className={`rc-holder${tr.currentHolder ? '' : ' empty'}`}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <span className="rc-muted" style={{ fontWeight: 600 }}>Current holder</span>
                            {tr.currentHolder && (
                              <span className="rc-chip rc-tone-orange">
                                <Flame size={12} aria-hidden="true" /> Held {plural(tr.currentHolder.retentionStreakDays, 'day', 'days')}
                              </span>
                            )}
                          </div>
                          {tr.currentHolder ? (
                            <>
                              <div className="rc-holder-name">{tr.currentHolder.locationName}</div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }} className="rc-muted">
                                <span>
                                  Owner: <strong style={{ color: 'var(--text-primary)' }}>{tr.currentHolder.teamLead || '—'}</strong>
                                </span>
                                <span>
                                  Score at award: <strong style={{ color: 'var(--text-primary)' }}>{fmtPct(tr.currentHolder.averageScore)}</strong>
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>Since {date(tr.currentHolder.heldSince)}</div>
                            </>
                          ) : (
                            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>Not awarded yet: up for grabs</div>
                          )}
                        </div>

                        <div className="rc-contender rc-tone-violet">
                          <Target size={15} className="rc-accent" style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
                          {tr.suggestedContender ? (
                            <span>
                              Front-runner: <strong style={{ color: 'var(--text-primary)' }}>{tr.suggestedContender.locationName}</strong>
                              {tr.suggestedContender.department ? ` (${tr.suggestedContender.department})` : ''} — {formatContenderMetric(tr.id, tr.suggestedContender.metric)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)' }}>No area currently meets the criteria</span>
                          )}
                        </div>

                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>Criteria</div>
                          <ul className="rc-criteria rc-tone-green">
                            {tr.criteria.map((cr) => (
                              <li key={cr}>
                                <CheckCircle2 size={14} className="rc-accent" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
                                <span>{cr}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="rc-trophy-foot">
                        <span className="rc-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={13} aria-hidden="true" />
                          Next evaluation: <strong style={{ color: 'var(--text-primary)' }}>{parseDay(tr.nextEvaluationDate) ? formatDate(parseDay(tr.nextEvaluationDate)) : '—'}</strong>
                        </span>
                        {can('RECOGNITION_AWARDERS') && (
                          <Button size="sm" variant={tr.currentHolder ? 'secondary' : 'primary'} icon={<Trophy size={13} />} onClick={() => openAwardModal(tr)}>
                            {tr.currentHolder ? 'Hand over' : 'Award'}
                          </Button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <Card noPadding title="Hall of fame" subtitle="Previous trophy holders.">
                <div className="enterprise-table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th>Trophy</th>
                        <th>Area</th>
                        <th>Department</th>
                        <th>Owner</th>
                        <th>Score at award</th>
                        <th>Citation</th>
                        <th style={{ textAlign: 'right' }}>Certificate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {td.hallOfFame.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                            No trophies have changed hands yet.
                          </td>
                        </tr>
                      )}
                      {(td.hallOfFame as HallOfFameItem[]).map((hof) => (
                        <tr key={hof.id}>
                          <td style={{ whiteSpace: 'nowrap' }}>{hallPeriod(hof)}</td>
                          <td>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                              <IconTile tone="gold" size="sm"><Trophy size={15} /></IconTile>
                              {hof.trophyTitle}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600 }}>{hof.winningLocation || '—'}</td>
                          <td>{hof.department ? <Badge variant="neutral">{hof.department}</Badge> : '—'}</td>
                          <td>{hof.teamLead || '—'}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{fmtPct(hof.auditScore)}</td>
                          <td>
                            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, maxWidth: '280px', lineHeight: 1.45 }}>{hof.citation}</p>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <Button size="sm" variant="secondary" icon={<Printer size={13} />} onClick={() => setSelectedCertItem(hof)}>
                              Certificate
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}
        </SectionState>
      )}

      {/* Leaderboards */}
      {activeTab === 'leaderboards' && (
        <SectionState state={leaderboards} label="leaderboards" onRetry={loadLeaderboards}>
          {(lb) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <Calendar size={13} aria-hidden="true" />
                Season: <strong>{date(lb.season?.from)} – {date(lb.season?.to)}</strong>
                <span style={{ color: 'var(--text-tertiary)' }}>(rolling 12 months)</span>
              </div>

              {lb.workstationsLeaderboard.length > 0 && (
                <section aria-label="Top areas" className="rc-podium">
                  {lb.workstationsLeaderboard.slice(0, 3).map((ws) => (
                    <div key={ws.id} className={`rc-podium-step rank-${ws.rank}`}>
                      {ws.rank === 1 && (
                        <Crown size={22} className="rc-tone-gold rc-accent" style={{ position: 'absolute', top: '8px', left: '50%', transform: 'translateX(-50%)' }} aria-hidden="true" />
                      )}
                      <RankMedal rank={ws.rank} size={ws.rank === 1 ? 44 : 38} />
                      <div className="rc-podium-name">{ws.name}</div>
                      <div className="rc-muted">{[ws.department, ws.areaOwner].filter(Boolean).join(' · ') || '—'}</div>
                      <div className="rc-podium-xp">
                        {formatNumber(ws.points)} <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>XP</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                        {ws.overallScore !== null && ws.overallScore !== undefined && <span className="rc-chip rc-tone-sky">Latest {fmtPct(ws.overallScore)}</span>}
                        {ws.trophyBadge && (
                          <span className="rc-chip rc-tone-gold">
                            <Trophy size={11} aria-hidden="true" /> {ws.trophyBadge}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {lb.mostImproved && (
                <div className="rc-improved">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                    <IconTile tone="green" size="lg">
                      <TrendingUp size={24} />
                    </IconTile>
                    <div style={{ minWidth: 0 }}>
                      <span className="rc-chip rc-tone-green">Most improved area</span>
                      <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0 0 0' }}>
                        {lb.mostImproved.areaName}
                        {lb.mostImproved.department ? ` (${lb.mostImproved.department})` : ''}
                      </h3>
                      <p className="rc-muted" style={{ margin: '2px 0 0 0', display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        Previous audit {fmtPct(lb.mostImproved.previousScore)} <ArrowRight size={13} aria-label="to" /> latest audit {fmtPct(lb.mostImproved.currentScore)}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }} className="rc-tone-green">
                    <div className="rc-accent" style={{ fontSize: '24px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>+{Math.round(lb.mostImproved.delta * 10) / 10} points</div>
                    <div className="rc-muted">Score increase</div>
                  </div>
                </div>
              )}

              <div className="grid-auto" style={{ '--min': '260px' } as React.CSSProperties}>
                {renderContributorCard('Best auditor this season', <ClipboardCheck size={16} />, 'sky', lb.bestAuditor, 'audits conducted', 'No audits conducted this season yet.')}
                {renderContributorCard('Top red tag contributor', <Tag size={16} />, 'orange', lb.topRedTagContributor, 'red tags raised', 'No red tags raised this season yet.')}
                <Card>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <IconTile tone="green" size="sm">
                      <CheckCircle2 size={16} />
                    </IconTile>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No overdue actions</h3>
                  </div>
                  {lb.zeroOverdueAreas && lb.zeroOverdueAreas.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {lb.zeroOverdueAreas.map((z) => (
                        <Badge key={z.id} variant="success">
                          {z.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>No area is currently free of overdue corrective actions.</p>
                  )}
                </Card>
              </div>

              <Card noPadding title="Area standings" subtitle="Ranked by season XP from audit results, on-time corrective actions and other recorded 5S activity.">
                <div className="enterprise-table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th style={{ width: '60px' }}>Rank</th>
                        <th>Area</th>
                        <th>Department</th>
                        <th>Owner</th>
                        <th>Latest score</th>
                        <th>Passing streak</th>
                        <th>Trophy</th>
                        <th>Actions on time</th>
                        <th style={{ textAlign: 'right' }}>XP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lb.workstationsLeaderboard.length === 0 && (
                        <tr>
                          <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                            No active areas to rank yet.
                          </td>
                        </tr>
                      )}
                      {lb.workstationsLeaderboard.map((ws) => (
                        <tr key={ws.id}>
                          <td>
                            <RankMedal rank={ws.rank} />
                          </td>
                          <td style={{ minWidth: '190px' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ws.name}</div>
                            {ws.areaCode && <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{ws.areaCode}</div>}
                          </td>
                          <td>{ws.department ? <Badge variant="neutral">{ws.department}</Badge> : '—'}</td>
                          <td>{ws.areaOwner || '—'}</td>
                          <td>
                            {ws.overallScore !== null && ws.overallScore !== undefined ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtPct(ws.overallScore)}</span>
                                <div style={{ width: '60px' }}>
                                  <ProgressBar value={ws.overallScore} color={ws.overallScore >= 95 ? 'success' : 'primary'} ariaLabel={`${ws.name} latest score`} />
                                </div>
                                {ws.trend === 'UP' && <TrendingUp size={13} color="var(--color-success)" aria-label="Improving" />}
                                {ws.trend === 'DOWN' && <TrendingDown size={13} color="var(--color-danger)" aria-label="Declining" />}
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-tertiary)' }}>No audits</span>
                            )}
                          </td>
                          <td className="num" title="Consecutive passing audits">
                            {formatNumber(ws.passingAuditStreak ?? 0)}
                          </td>
                          <td>
                            {ws.trophyBadge ? (
                              <span className="rc-chip rc-tone-gold">
                                <Trophy size={12} aria-hidden="true" /> {ws.trophyBadge}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-tertiary)' }}>—</span>
                            )}
                          </td>
                          <td className="num">{fmtPct(ws.capaClosureRate)}</td>
                          <td className="num" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{formatNumber(ws.points)} XP</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="grid-auto" style={{ '--min': '300px' } as React.CSSProperties}>
                <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}><IconTile tone="teal" size="sm"><Building2 size={16} /></IconTile> Departments</span>}>
                  <ol className="rc-list">
                    {lb.departmentLeaderboard.length === 0 && <li style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No department standings yet.</li>}
                    {lb.departmentLeaderboard.map((dept) => (
                      <li key={dept.department}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          <RankMedal rank={dept.rank} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{dept.department}</div>
                            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                              Audit adherence <strong>{fmtPct(dept.complianceRate)}</strong> · {plural(dept.activeTrophies, 'trophy', 'trophies')}
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmtPct(dept.avgScore)}</div>
                          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{formatNumber(dept.totalPoints)} XP</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Card>

                {!lb.individualLeaderboardHidden && (
                <Card title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}><IconTile tone="violet" size="sm"><Users size={16} /></IconTile> Individuals</span>}>
                  <ol className="rc-list">
                    {lb.individualChampions.length === 0 && <li style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>No one has earned XP this season yet.</li>}
                    {lb.individualChampions.map((ind) => (
                      <li key={ind.userId || ind.name}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          <RankMedal rank={ind.rank} />
                          <span className="rc-avatar rc-tone-violet" aria-hidden="true">{initialsOf(ind.name)}</span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{ind.name}</div>
                            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>{[ind.role, ind.department].filter(Boolean).join(' · ') || '—'}</div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span className="rc-chip rc-tone-violet">{ind.tier}</span>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(ind.points)} XP</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </Card>
                )}
              </div>
            </div>
          )}
        </SectionState>
      )}

      {/* Badges */}
      {activeTab === 'badges' && (
        <SectionState state={badges} label="badges" onRetry={loadBadges}>
          {(bd) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <p className="rc-intro" style={{ flex: '1 1 280px' }}>
                  Badges are earned by conducting audits, closing corrective actions on time, raising red tags, reporting issues, keeping your areas passing and receiving kudos.
                </p>
                <SegmentedFilter<typeof badgeFilter>
                  ariaLabel="Filter badges"
                  value={badgeFilter}
                  onChange={setBadgeFilter}
                  options={[
                    { id: 'ALL', label: `All (${bd.totalBadges})` },
                    { id: 'UNLOCKED', label: `Unlocked (${bd.unlockedCount})` },
                    { id: 'IN_PROGRESS', label: `In progress (${bd.totalBadges - bd.unlockedCount})` },
                  ]}
                />
              </div>

              {filteredBadges.length === 0 ? (
                <Card>
                  <EmptyState icon={<Award size={28} />} title="No badges in this view" />
                </Card>
              ) : (
                <div className="grid-auto" style={{ '--min': '280px' } as React.CSSProperties}>
                  {filteredBadges.map((bg) => {
                    const tone = BADGE_TIER_TONES[bg.tier] ?? 'teal';
                    return (
                      <article key={bg.id} className={`rc-badge-card rc-tone-${tone} ${bg.unlocked ? 'unlocked' : 'locked'}`}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <span style={{ position: 'relative', flexShrink: 0 }}>
                            <span className="rc-badge-medal" aria-hidden="true">{BADGE_ICONS[bg.icon] ?? <Award size={22} />}</span>
                            {!bg.unlocked && (
                              <span className="rc-badge-lock" aria-hidden="true">
                                <Lock size={12} />
                              </span>
                            )}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>{bg.title}</h3>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <span className="rc-chip">{humanize(bg.tier)}</span>
                              {bg.unlocked && (
                                <span className="rc-chip rc-tone-green">
                                  <CheckCircle2 size={11} aria-hidden="true" /> Unlocked
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{bg.description}</p>
                        <div style={{ marginTop: 'auto' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }} className="rc-muted">
                            <span>
                              {formatNumber(bg.progress.current)} / {formatNumber(bg.progress.target)}
                            </span>
                            <span className="rc-accent" style={{ fontWeight: 700 }}>{bg.progress.percent}%</span>
                          </div>
                          <div className="rc-progress" role="progressbar" aria-label={`${bg.title} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={bg.progress.percent}>
                            <span style={{ width: `${Math.max(0, Math.min(100, bg.progress.percent))}%` }} />
                          </div>
                          {bg.unlockedDate && <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Unlocked on {date(bg.unlockedDate)}</div>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </SectionState>
      )}

      {/* Point rules */}
      {activeTab === 'rules' && (
        <SectionState state={overview} label="point rules" onRetry={loadOverview}>
          {(ov) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p className="rc-intro">XP is calculated automatically from recorded 5S activity over a rolling 12-month season.</p>
              {/* Point rules come from the server, grouped by category */}
              {ov.pointRulesQuickGuide && ov.pointRulesQuickGuide.length > 0 ? (
                <div className="grid-auto" style={{ '--min': '300px' } as React.CSSProperties}>
                  {Array.from(new Set(ov.pointRulesQuickGuide.map((r) => r.category))).map((category) => {
                    const tone = RULE_CATEGORY_TONES[category] ?? 'teal';
                    return (
                      <section key={category} className={`rc-rule-card rc-tone-${tone}`}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <IconTile tone={tone} size="sm">{RULE_CATEGORY_ICONS[category] ?? <Lightbulb size={18} />}</IconTile>
                          <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{RULE_CATEGORY_LABELS[category] || humanize(category)}</h3>
                        </div>
                        <ul className="rc-rule-list">
                          {ov.pointRulesQuickGuide
                            .filter((r) => r.category === category)
                            .map((r) => (
                              <li key={`${category}-${r.action}`}>
                                <span>{r.action}</span>
                                <span className={`rc-xp-pill${r.points.trim().startsWith('-') ? ' negative' : ''}`}>{r.points}</span>
                              </li>
                            ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <EmptyState title="No point rules are configured" />
                </Card>
              )}
            </div>
          )}
        </SectionState>
      )}

      {/* Kudos */}
      {activeTab === 'kudos' && (
        <SectionState state={trophies} label="kudos" onRetry={loadTrophies}>
          {(td) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="rc-kudos-cta">
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: '1 1 280px' }}>
                  <IconTile tone="rose" size="lg">
                    <Heart size={24} />
                  </IconTile>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Thank a colleague</h3>
                    <p className="rc-muted" style={{ margin: '2px 0 0' }}>
                      Recognize good 5S work.{kudosPoints !== null ? ` Each kudos gives the recipient ${kudosPoints} XP.` : ''}
                    </p>
                  </div>
                </div>
                {can('SHOPFLOOR_REPORTERS') && (
                  <Button size="sm" variant="primary" icon={<Heart size={14} />} onClick={openKudosModal}>
                    Send kudos{kudosXpLabel}
                  </Button>
                )}
              </div>

              {td.kudosFeed.length === 0 ? (
                <Card>
                  <EmptyState icon={<Heart size={28} />} title="No kudos yet" description="Be the first to recognize a colleague's 5S work." />
                </Card>
              ) : (
                <ul className="rc-kudos">
                  {td.kudosFeed.map((kd) => {
                    const tone = KUDOS_CATEGORY_TONES[kd.category] ?? 'rose';
                    return (
                      <li key={kd.id} className={`rc-kudos-card rc-tone-${tone}`}>
                        <div className="rc-kudos-people">
                          <span className="rc-avatar rc-tone-sky" aria-hidden="true">{initialsOf(kd.fromUser)}</span>
                          <strong>{kd.fromUser}</strong>
                          <ArrowRight size={14} aria-label="recognized" />
                          <span className="rc-avatar rc-tone-rose" aria-hidden="true">{initialsOf(kd.toUser)}</span>
                          <strong>{kd.toUser}</strong>
                        </div>
                        <p className="rc-kudos-quote">“{kd.message}”</p>
                        <div className="rc-kudos-foot">
                          <span className="rc-chip">{KUDOS_CATEGORY_LABELS[kd.category] || humanize(kd.category)}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                            <span className="rc-xp-pill">+{formatNumber(kd.points)} XP</span>
                            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }} title={formatDateTime(kd.createdAt)}>
                              {formatRelative(kd.createdAt)}
                            </span>
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </SectionState>
      )}

      {/* Award / hand over a trophy */}
      <Modal
        isOpen={awardModalOpen && selectedTrophyToAward !== null}
        onClose={() => {
          if (!actionLoading) setAwardModalOpen(false);
        }}
        title={selectedTrophyToAward ? `Award ${selectedTrophyToAward.title}` : 'Award trophy'}
        subtitle="The current holder, if any, moves to the hall of fame."
        maxWidth="580px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button type="button" variant="secondary" onClick={() => setAwardModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button type="submit" form="award-trophy-form" variant="primary" icon={<Trophy size={15} />} loading={actionLoading} disabled={!selectedNewLocationId}>
              Award trophy
            </Button>
          </div>
        }
      >
        {selectedTrophyToAward && (
          <form id="award-trophy-form" onSubmit={handleAwardTrophySubmit} noValidate>
            <FormField
              label="Trophy"
              required
              hint={
                selectedTrophyToAward.suggestedContender
                  ? `Front-runner: ${selectedTrophyToAward.suggestedContender.locationName} (${formatContenderMetric(selectedTrophyToAward.id, selectedTrophyToAward.suggestedContender.metric)})`
                  : 'No area currently meets the criteria for this trophy.'
              }
            >
              {(p) => (
                <select
                  {...p}
                  className="form-select"
                  value={selectedTrophyToAward.id}
                  onChange={(e) => {
                    const tr = floatingTrophies.find((t) => t.id === e.target.value);
                    if (tr) openAwardModal(tr);
                  }}
                >
                  {floatingTrophies.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.title} — {tr.currentHolder ? `held by ${tr.currentHolder.locationName}` : 'not awarded yet'}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField
              label="Winning area"
              required
              error={
                locationsError ? (
                  <>
                    {locationsError}{' '}
                    <Button type="button" size="sm" variant="ghost" onClick={loadReferenceData}>
                      Try again
                    </Button>
                  </>
                ) : undefined
              }
              hint={!locationsError && locations.length === 0 ? 'There are no active areas to award.' : undefined}
            >
              {(p) =>
                locationsError || locations.length === 0 ? null : (
                  <select {...p} className="form-select" value={selectedNewLocationId} onChange={(e) => setSelectedNewLocationId(e.target.value)}>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                        {loc.areaCode ? ` (${loc.areaCode})` : ''}
                        {loc.building ? ` — ${loc.building}` : ''}
                      </option>
                    ))}
                  </select>
                )
              }
            </FormField>

            <FormField label="Citation" required error={citationError} hint={`${trophyCitation.length} / ${CITATION_MAX} characters`} style={{ marginBottom: 0 }}>
              {(p) => (
                <textarea
                  {...p}
                  className="form-textarea"
                  rows={3}
                  placeholder="What did this area do to earn the trophy?"
                  value={trophyCitation}
                  maxLength={CITATION_MAX}
                  onChange={(e) => {
                    setTrophyCitation(e.target.value);
                    if (citationError) setCitationError(null);
                  }}
                />
              )}
            </FormField>
          </form>
        )}
      </Modal>

      {/* Send kudos */}
      <Modal
        isOpen={kudosModalOpen}
        onClose={() => {
          if (!actionLoading) setKudosModalOpen(false);
        }}
        title="Send kudos"
        subtitle={kudosPoints !== null ? `The recipient gets ${kudosPoints} XP.` : undefined}
        maxWidth="560px"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button type="button" variant="secondary" onClick={() => setKudosModalOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button type="submit" form="give-kudos-form" variant="primary" icon={<Send size={15} />} loading={actionLoading} disabled={!kudosToUserId}>
              Send kudos
            </Button>
          </div>
        }
      >
        <form id="give-kudos-form" onSubmit={handleGiveKudosSubmit} noValidate>
          <FormField
            label="Colleague"
            required
            error={
              usersError ? (
                <>
                  {usersError}{' '}
                  <Button type="button" size="sm" variant="ghost" onClick={loadReferenceData}>
                    Try again
                  </Button>
                </>
              ) : undefined
            }
            hint={!usersError && kudosRecipients.length === 0 ? 'There are no other active colleagues to recognize.' : undefined}
          >
            {(p) =>
              usersError || kudosRecipients.length === 0 ? null : (
                <select {...p} className="form-select" value={kudosToUserId} onChange={(e) => setKudosToUserId(e.target.value)}>
                  {kudosRecipients.map((u) => (
                    <option key={u.id} value={u.id}>
                      {`${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email}
                      {u.jobTitle || u.department ? ` (${[u.jobTitle, u.department].filter(Boolean).join(', ')})` : ''}
                    </option>
                  ))}
                </select>
              )
            }
          </FormField>

          <FormField label="Category" required>
            {(p) => (
              <select {...p} className="form-select" value={kudosCategory} onChange={(e) => setKudosCategory(e.target.value as KudosCategory)}>
                {(Object.keys(KUDOS_CATEGORY_LABELS) as KudosCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {KUDOS_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="Message" required error={kudosMessageError} hint={`${kudosMessage.length} / ${KUDOS_MESSAGE_MAX} characters`} style={{ marginBottom: 0 }}>
            {(p) => (
              <textarea
                {...p}
                className="form-textarea"
                rows={3}
                placeholder="What did your colleague do?"
                value={kudosMessage}
                maxLength={KUDOS_MESSAGE_MAX}
                onChange={(e) => {
                  setKudosMessage(e.target.value);
                  if (kudosMessageError) setKudosMessageError(null);
                }}
              />
            )}
          </FormField>
        </form>
      </Modal>

      {/* Printable hall-of-fame certificate: a paper sheet, so white with dark text in both themes */}
      <Modal
        isOpen={selectedCertItem !== null}
        onClose={() => setSelectedCertItem(null)}
        title="Award certificate"
        maxWidth="720px"
        footer={
          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <Button variant="secondary" onClick={() => setSelectedCertItem(null)}>
              Close
            </Button>
            <Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()}>
              Print / save PDF
            </Button>
          </div>
        }
      >
        {selectedCertItem && (
          <div
            id="printable-certificate-card"
            className="printable-trophy-cert"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: '#FFFFFF',
              color: '#1D2733',
              border: '8px double #D97706',
              borderRadius: 'var(--radius-lg)',
              padding: 'clamp(20px, 5vw, 36px) clamp(16px, 5vw, 40px)',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }} aria-hidden="true">
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#D97706', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trophy size={30} />
              </div>
            </div>

            {currentTenant?.logoUrl ? (
              <img src={currentTenant.logoUrl} alt={currentTenant.name} style={{ height: '40px', maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto 6px auto' }} />
            ) : currentTenant?.name ? (
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#B45309' }}>{currentTenant.name}</div>
            ) : null}

            <h2 style={{ fontSize: 'clamp(18px, 5vw, 24px)', fontWeight: 700, color: '#1D2733', margin: '8px 0 2px 0' }}>Certificate of 5S excellence</h2>
            <div style={{ fontSize: '13px', color: '#475569', fontStyle: 'italic', marginBottom: '16px' }}>Presented to the team of</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#004C8F', marginBottom: '4px', overflowWrap: 'anywhere' }}>{selectedCertItem.winningLocation}</div>
            {selectedCertItem.department && <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '16px' }}>{selectedCertItem.department}</div>}
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#B45309', marginBottom: '8px' }}>
              {selectedCertItem.trophyTitle} · {hallPeriod(selectedCertItem)}
            </div>
            {selectedCertItem.citation && (
              <p style={{ fontSize: '12.5px', color: '#475569', maxWidth: '520px', margin: '0 auto 24px auto', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{selectedCertItem.citation}</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '16px', borderTop: '1px solid #E2E8F0', paddingTop: '20px', fontSize: '12px' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#1D2733' }}>{selectedCertItem.teamLead || '—'}</div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>Area owner</div>
              </div>
              <div>
                {/* Signature line for whoever presents the award */}
                <div style={{ minWidth: '140px', borderBottom: '1px solid #94A3B8', height: '18px' }} />
                <div style={{ fontSize: '11px', color: '#64748B' }}>Authorized signatory</div>
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#1D2733' }}>{date(selectedCertItem.awardedDate)}</div>
                <div style={{ fontSize: '11px', color: '#64748B' }}>Date awarded</div>
              </div>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};
