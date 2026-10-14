import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import {
  GamificationOverview,
  GamificationLeaderboards,
  TrophiesAndAwardsData,
  BadgesAndMilestonesData,
  FloatingTrophy,
  TrophyHallOfFameItem,
  KudosItem,
  AchievementBadge,
  Location,
} from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Tabs, TabItem } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { ProgressBar } from '../../components/ui/ProgressBar';
import {
  Trophy,
  Award,
  Medal,
  Flame,
  Sparkles,
  Zap,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Star,
  Users,
  Send,
  Printer,
  ChevronRight,
  Info,
  Clock,
  ThumbsUp,
  Lightbulb,
  Eye,
  Tag,
  RefreshCw,
  Share2,
  Crown,
  Heart,
  Plus,
  HelpCircle,
  Building,
  Target,
  ArrowRight,
  Check,
  Calendar,
  AlertCircle,
  Sparkle,
} from 'lucide-react';

export const RecognitionPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTenant, addToast, currentUser } = useApp();

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('trophies');
  const [badgeFilter, setBadgeFilter] = useState<'ALL' | 'UNLOCKED' | 'IN_PROGRESS'>('ALL');

  // Data states
  const [overview, setOverview] = useState<GamificationOverview | null>(null);
  const [leaderboards, setLeaderboards] = useState<GamificationLeaderboards | null>(null);
  const [trophiesData, setTrophiesData] = useState<TrophiesAndAwardsData | null>(null);
  const [badgesData, setBadgesData] = useState<BadgesAndMilestonesData | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);

  // Modals
  const [awardModalOpen, setAwardModalOpen] = useState(false);
  const [selectedTrophyToAward, setSelectedTrophyToAward] = useState<FloatingTrophy | null>(null);
  const [selectedNewLocationId, setSelectedNewLocationId] = useState('');
  const [trophyCitation, setTrophyCitation] = useState('');

  const [kudosModalOpen, setKudosModalOpen] = useState(false);
  const [kudosToUser, setKudosToUser] = useState('Rajesh Sharma (CNC Area Owner)');
  const [kudosCategory, setKudosCategory] = useState('KAIZEN_INNOVATION');
  const [kudosMessage, setKudosMessage] = useState('');

  const [certModalOpen, setCertModalOpen] = useState(false);
  const [selectedCertItem, setSelectedCertItem] = useState<TrophyHallOfFameItem | null>(null);

  const [actionLoading, setActionLoading] = useState(false);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [ovData, leadData, troData, bgData, locs] = await Promise.all([
        api.getGamificationOverview().catch(() => null),
        api.getGamificationLeaderboards().catch(() => null),
        api.getGamificationTrophies().catch(() => null),
        api.getGamificationBadges().catch(() => null),
        api.getLocations().catch(() => []),
      ]);

      if (ovData) setOverview(ovData);
      if (leadData) setLeaderboards(leadData);
      if (troData) setTrophiesData(troData);
      if (bgData) setBadgesData(bgData);
      setLocations(locs);

      if (locs.length > 0) {
        if (!selectedNewLocationId || !locs.some((l: Location) => l.id === selectedNewLocationId)) {
          setSelectedNewLocationId(locs[0].id);
        }
      } else {
        setSelectedNewLocationId('loc-1');
      }
    } catch (err) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'Error Loading Gamification',
        message: 'Could not fetch 5S leaderboards and trophy data.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [currentTenant]);

  // Handle Award Trophy submit
  const handleAwardTrophySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrophyToAward) return;
    const targetLocId = selectedNewLocationId || (locations.length > 0 ? locations[0].id : 'loc-1');

    setActionLoading(true);
    try {
      const awardedByName = currentUser
        ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.fullName || currentUser.email
        : '5S Steering Committee';

      await api.awardTrophy({
        trophyId: selectedTrophyToAward.id,
        newLocationId: targetLocId,
        citation: trophyCitation || 'Recognized for top 5S workplace performance and sustained visual order.',
        awardedBy: awardedByName,
      });

      addToast({
        type: 'success',
        title: 'Trophy Transferred & Awarded!',
        message: `'${selectedTrophyToAward.title}' successfully awarded. Hall of Fame updated.`,
      });

      setAwardModalOpen(false);
      setSelectedTrophyToAward(null);
      setTrophyCitation('');
      await loadAllData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Award Failed',
        message: err?.response?.data?.message || 'Could not award trophy.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Give Kudos submit
  const handleGiveKudosSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kudosMessage.trim()) {
      addToast({
        type: 'warning',
        title: 'Message Required',
        message: 'Please provide an appreciation message for the recipient.',
      });
      return;
    }

    setActionLoading(true);
    try {
      const senderName = currentUser
        ? `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.fullName || currentUser.email
        : '5S Team Member';

      await api.giveKudos({
        toUser: kudosToUser,
        category: kudosCategory,
        message: kudosMessage,
        points: 25,
        fromUser: senderName,
      });

      addToast({
        type: 'success',
        title: 'Kudos Sent!',
        message: `Awarded +25 XP appreciation points to ${kudosToUser}.`,
      });

      setKudosModalOpen(false);
      setKudosMessage('');
      await loadAllData();
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Kudos Failed',
        message: err?.response?.data?.message || 'Could not send recognition.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const tabs: TabItem[] = [
    { id: 'trophies', label: 'Floating Trophies & Best Teams', icon: <Trophy size={15} />, badge: trophiesData?.floatingTrophies.length },
    { id: 'leaderboards', label: 'Multi-Tier Leaderboards', icon: <Medal size={15} /> },
    { id: 'badges', label: 'Badges & Milestones', icon: <Award size={15} />, badge: badgesData?.unlockedCount },
    { id: 'rules', label: 'Point Economy & Rules', icon: <Zap size={15} /> },
    { id: 'kudos', label: 'Recognition & Kudos Wall', icon: <Heart size={15} />, badge: trophiesData?.kudosFeed.length },
  ];

  const getTrophyIcon = (type: string) => {
    switch (type) {
      case 'BROOM':
        return <Sparkles size={24} color="#D97706" />;
      case 'CUP':
        return <Trophy size={24} color="#7C3AED" />;
      case 'SHIELD':
        return <ShieldCheck size={24} color="#2563EB" />;
      case 'STAR':
        return <Star size={24} color="#10B981" />;
      default:
        return <Award size={24} color="#D97706" />;
    }
  };

  const getTrophyGradient = (tier: string) => {
    switch (tier) {
      case 'GOLD':
        return 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.04) 100%)';
      case 'PLATINUM':
        return 'linear-gradient(135deg, rgba(139, 92, 246, 0.12) 0%, rgba(109, 40, 217, 0.04) 100%)';
      case 'SILVER':
        return 'linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(37, 99, 235, 0.04) 100%)';
      case 'BRONZE':
        return 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(5, 150, 105, 0.04) 100%)';
      default:
        return 'var(--bg-surface)';
    }
  };

  const getTrophyBorder = (tier: string) => {
    switch (tier) {
      case 'GOLD':
        return 'rgba(245, 158, 11, 0.35)';
      case 'PLATINUM':
        return 'rgba(139, 92, 246, 0.35)';
      case 'SILVER':
        return 'rgba(59, 130, 246, 0.35)';
      case 'BRONZE':
        return 'rgba(16, 185, 129, 0.35)';
      default:
        return 'var(--border-subtle)';
    }
  };

  const getBadgeIconComponent = (iconName: string) => {
    switch (iconName) {
      case 'Sparkles':
        return <Sparkles size={20} />;
      case 'Zap':
        return <Zap size={20} />;
      case 'Tag':
        return <Tag size={20} />;
      case 'ShieldCheck':
        return <ShieldCheck size={20} />;
      case 'Lightbulb':
        return <Lightbulb size={20} />;
      case 'Eye':
        return <Eye size={20} />;
      default:
        return <Award size={20} />;
    }
  };

  const filteredBadges = badgesData?.badges.filter((b) => {
    if (badgeFilter === 'UNLOCKED') return b.unlocked;
    if (badgeFilter === 'IN_PROGRESS') return !b.unlocked;
    return true;
  }) || [];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <Badge variant="warning" icon={<Crown size={12} />}>
              5S Culture & Gamification
            </Badge>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Points, Floating Trophies, Best-Team Awards & Peer Recognition
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.02em' }}>
            5S Recognition & Engagement Hub
          </h1>
        </div>

        <div className="page-header-actions">
          <Button
            variant="secondary"
            icon={<Heart size={15} color="#ec4899" />}
            onClick={() => setKudosModalOpen(true)}
            style={{ borderColor: 'rgba(236, 72, 153, 0.3)', background: 'rgba(236, 72, 153, 0.05)', color: '#db2777' }}
          >
            Send Kudos (+25 XP)
          </Button>
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} />}
            onClick={() => loadAllData()}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            icon={<Trophy size={16} />}
            onClick={() => {
              if (trophiesData?.floatingTrophies.length) {
                setSelectedTrophyToAward(trophiesData.floatingTrophies[0]);
                setAwardModalOpen(true);
              }
            }}
          >
            Award Trophy
          </Button>
        </div>
      </div>

      {/* Gamification Summary Stats (User Level + Active Monthly Challenge) */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(320px, 1.8fr)', gap: '16px' }}>
          {/* Card 1: User's 5S Mastery Tier */}
          <div
            className="card"
            style={{
              padding: '18px 20px',
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.06) 0%, rgba(139, 92, 246, 0.08) 100%)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-primary)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '18px',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  L{overview.userStats.currentLevel.levelNumber}
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    YOUR 5S MASTERY TIER
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {overview.userStats.currentLevel.title}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--color-primary)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                  {overview.userStats.currentPoints.toLocaleString()} <span style={{ fontSize: '13px', fontWeight: 700 }}>XP</span>
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '3px' }}>
                  Rank <strong>#{overview.userStats.plantRank}</strong> of {overview.userStats.totalParticipants} in Plant
                </div>
              </div>
            </div>

            {/* Progress Bar to next level */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                <span>Progress to <strong>{overview.userStats.currentLevel.nextLevelTitle}</strong></span>
                <span><strong>{overview.userStats.currentLevel.pointsToNextLevel} XP</strong> needed</span>
              </div>
              <ProgressBar value={overview.userStats.currentLevel.progressPercent} color="primary" />
            </div>

            {/* Quick KPI stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '10px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#f59e0b' }}>🔥 {overview.userStats.cleanStreakDays}d</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>Clean Streak</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-success)' }}>{overview.userStats.kpis.capasClearedUnder24h}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>&lt;24h CAPAs</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-primary)' }}>{overview.userStats.kpis.auditsPassedAbove90}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>≥90% Audits</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-purple)' }}>{overview.userStats.kpis.floatingTrophiesHeld}</div>
                <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)' }}>Trophies Held</div>
              </div>
            </div>
          </div>

          {/* Card 2: Active Monthly Challenge Sprint */}
          <div
            className="card"
            style={{
              padding: '18px 20px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.07) 0%, rgba(217, 119, 6, 0.03) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Badge variant="warning" icon={<Clock size={12} />}>
                    Active Monthly Sprint
                  </Badge>
                  <span style={{ fontSize: '12px', color: '#b45309', fontWeight: 600 }}>
                    Ends {overview.activeChallenge.deadline}
                  </span>
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '4px 0' }}>
                  {overview.activeChallenge.title}
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  {overview.activeChallenge.description}
                </p>
              </div>

              <div
                style={{
                  background: '#FFFFFF',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  textAlign: 'center',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.15)',
                  flexShrink: 0,
                }}
              >
                <div style={{ fontSize: '11px', color: '#b45309', fontWeight: 700 }}>REWARD</div>
                <div style={{ fontSize: '17px', fontWeight: 900, color: '#d97706' }}>
                  +{overview.activeChallenge.bonusPoints} XP
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                  + {overview.activeChallenge.rewardBadge}
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: 'var(--text-secondary)', marginBottom: '5px' }}>
                <span>Sprint Goal Completion</span>
                <span><strong>{overview.activeChallenge.currentProgressPercent}%</strong> Achieved</span>
              </div>
              <ProgressBar value={overview.activeChallenge.currentProgressPercent} color="warning" />
            </div>
          </div>
        </div>
      )}

      {/* Main Navigation Tabs */}
      <Card noPadding>
        <div style={{ padding: '0 20px', background: 'var(--bg-surface)' }}>
          <Tabs tabs={tabs} activeTab={activeTab} onChange={(tabId) => setActiveTab(tabId)} />
        </div>
      </Card>

      {/* ========================================================================= */}
      {/* TAB 1: FLOATING TROPHIES & BEST TEAMS */}
      {/* ========================================================================= */}
      {activeTab === 'trophies' && trophiesData && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Section banner */}
          <div className="section-intro-banner">
            <div className="section-intro-content">
              <div className="section-intro-icon">
                <Trophy size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px 0' }}>
                  Floating Trophies & Monthly Best-Team Awards
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Prestigious floating awards pass between workstations based on continuous audit performance, rapid CAPA closure, and zero safety defects. Winners receive shopfloor recognition, Kaizen budget perks, and Hall of Fame immortality.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                size="sm"
                variant="primary"
                icon={<Trophy size={14} />}
                onClick={() => {
                  if (trophiesData.floatingTrophies.length) {
                    setSelectedTrophyToAward(trophiesData.floatingTrophies[0]);
                    setAwardModalOpen(true);
                  }
                }}
              >
                Award / Transfer Trophy
              </Button>
            </div>
          </div>

          {/* Grid of Active Floating Trophies */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '16px' }}>
            {trophiesData.floatingTrophies.map((tr) => (
              <div
                key={tr.id}
                className="card"
                style={{
                  background: getTrophyGradient(tr.tier),
                  border: `1px solid ${getTrophyBorder(tr.tier)}`,
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: 'var(--radius-md)',
                        background: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      }}
                    >
                      {getTrophyIcon(tr.iconType)}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <Badge variant="neutral">{tr.evaluationPeriod}</Badge>
                      <Badge variant={tr.tier === 'GOLD' || tr.tier === 'PLATINUM' ? 'warning' : 'info'}>
                        {tr.tier} TIER
                      </Badge>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 3px 0' }}>
                    {tr.title}
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    {tr.subtitle}
                  </div>

                  {/* Current Holder Box */}
                  <div
                    style={{
                      background: '#FFFFFF',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '12px 14px',
                      marginBottom: '14px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                        CURRENT HOLDER
                      </span>
                      <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>
                        🔥 {tr.currentHolder.retentionStreakDays} Days Retained
                      </span>
                    </div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {tr.currentHolder.locationName}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      <span>Lead: <strong>{tr.currentHolder.teamLead}</strong></span>
                      <span>Score: <strong style={{ color: 'var(--color-primary)' }}>{tr.currentHolder.averageScore}%</strong></span>
                    </div>
                  </div>

                  {/* Criteria list */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                      RETENTION CRITERIA
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {tr.criteria.map((cr, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                          <CheckCircle2 size={13} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
                          <span>{cr}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '12px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                    Next Evaluation: <strong>{tr.nextEvaluationDate}</strong>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Crown size={13} />}
                    onClick={() => {
                      setSelectedTrophyToAward(tr);
                      setAwardModalOpen(true);
                    }}
                  >
                    Transfer Award
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Trophy Hall of Fame */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  🏆 Trophy Hall of Fame & Past Champions
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Permanent honor roll commemorating top-performing workstation teams and kaizen turnaround leaders.
                </p>
              </div>
            </div>

            <Card noPadding>
              <div className="enterprise-table-container">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>Award Period</th>
                      <th>Trophy</th>
                      <th>Winning Workstation</th>
                      <th>Department</th>
                      <th>Team Lead & Members</th>
                      <th>Audit Score</th>
                      <th>Citation</th>
                      <th style={{ textAlign: 'right' }}>Certificate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trophiesData.hallOfFame.map((hof) => (
                      <tr key={hof.id}>
                        <td>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '12.5px' }}>
                            {hof.period}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Trophy size={14} color="#d97706" />
                            <span style={{ fontWeight: 600, fontSize: '12.5px' }}>{hof.trophyTitle}</span>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{hof.winningLocation}</span>
                        </td>
                        <td>
                          <Badge variant="neutral">{hof.department}</Badge>
                        </td>
                        <td>
                          <div style={{ fontSize: '12.5px' }}>
                            <strong>{hof.teamLead}</strong>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                              {hof.teamMembers.join(', ')}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 800, color: 'var(--color-success)', fontSize: '13px' }}>
                            {hof.auditScore}%
                          </span>
                        </td>
                        <td>
                          <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: 0, maxWidth: '280px', lineHeight: 1.35 }}>
                            "{hof.citation}"
                          </p>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<Printer size={13} />}
                            onClick={() => {
                              setSelectedCertItem(hof);
                              setCertModalOpen(true);
                            }}
                          >
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MULTI-TIER LEADERBOARDS */}
      {/* ========================================================================= */}
      {activeTab === 'leaderboards' && leaderboards && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Most Improved Banner */}
          {leaderboards.mostImproved && (
            <div
              className="card"
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(5, 150, 105, 0.03) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-success-bg)',
                    color: 'var(--color-success)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <TrendingUp size={24} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <Badge variant="success">MOST IMPROVED WORKSTATION OF THE MONTH</Badge>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-success)' }}>
                      {leaderboards.mostImproved.deltaPercent} Score Jump
                    </span>
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    {leaderboards.mostImproved.areaName} ({leaderboards.mostImproved.department})
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                    {leaderboards.mostImproved.keyAchievement} — Baseline: {leaderboards.mostImproved.previousScore}% ➔ Current: {leaderboards.mostImproved.currentScore}%
                  </p>
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--color-success)' }}>
                  +{leaderboards.mostImproved.turnaroundBonusPoints} XP
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Turnaround Bonus</div>
              </div>
            </div>
          )}

          {/* Workstations Leaderboard Table */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Workstation & Area 5S Standings
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Rankings dynamically weighted by audit compliance score, CAPA turnaround speed, and flawless clean streak.
                </p>
              </div>
            </div>

            <Card noPadding>
              <div className="enterprise-table-container">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Rank</th>
                      <th>Workstation / Line</th>
                      <th>Department</th>
                      <th>Area Owner</th>
                      <th>5S Audit Score</th>
                      <th>Clean Streak</th>
                      <th>Active Trophy</th>
                      <th>CAPA Closure</th>
                      <th style={{ textAlign: 'right' }}>Total Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboards.workstationsLeaderboard.map((ws) => (
                      <tr key={ws.id}>
                        <td>
                          {ws.rank === 1 ? (
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#F59E0B', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px' }}>
                              1
                            </div>
                          ) : ws.rank === 2 ? (
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#94A3B8', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px' }}>
                              2
                            </div>
                          ) : ws.rank === 3 ? (
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#B45309', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '13px' }}>
                              3
                            </div>
                          ) : (
                            <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: '13px', marginLeft: '8px' }}>
                              #{ws.rank}
                            </span>
                          )}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px' }}>{ws.name}</div>
                          <span className="code-tag" style={{ fontSize: '10px', marginTop: '2px' }}>{ws.areaCode}</span>
                        </td>
                        <td>
                          <Badge variant="neutral">{ws.department}</Badge>
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, fontSize: '12.5px' }}>{ws.areaOwner}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 800, color: ws.overallScore >= 95 ? 'var(--color-success)' : 'var(--color-primary)', fontSize: '13px' }}>
                              {ws.overallScore}%
                            </span>
                            <div style={{ width: '60px' }}>
                              <ProgressBar value={ws.overallScore} color={ws.overallScore >= 95 ? 'success' : 'primary'} />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: '12.5px' }}>
                            🔥 {ws.streakDays}d
                          </span>
                        </td>
                        <td>
                          {ws.trophyBadge ? (
                            <Badge variant="warning" icon={<Trophy size={11} />}>
                              {ws.trophyBadge}
                            </Badge>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span style={{ fontWeight: 600, color: 'var(--color-success)', fontSize: '12px' }}>{ws.capaClosureRate}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 900, color: 'var(--color-primary)', fontSize: '14px' }}>
                            {ws.points.toLocaleString()} XP
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Department Leaderboard & Individual Champions side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) minmax(300px, 1fr)', gap: '16px' }}>
            {/* Department Standings */}
            <Card>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px 0' }}>
                🏢 Department 5S League
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {leaderboards.departmentLeaderboard.map((dept) => (
                  <div
                    key={dept.department}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--text-primary)' }}>
                        #{dept.rank} {dept.department}
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        Compliance: <strong>{dept.complianceRate}</strong> • Trophies: <strong>{dept.activeTrophies}</strong>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--color-primary)' }}>
                        {dept.avgScore}%
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                        {dept.totalPoints.toLocaleString()} XP
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Individual Champions */}
            <Card>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px 0' }}>
                🌟 Top 5S Champions (Individuals)
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {leaderboards.individualChampions.map((ind) => (
                  <div
                    key={ind.name}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-subtle)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: ind.rank === 1 ? '#F59E0B' : 'var(--color-primary-light)',
                          color: ind.rank === 1 ? '#FFFFFF' : 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '12px',
                        }}
                      >
                        #{ind.rank}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{ind.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {ind.role} ({ind.department})
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Badge variant="purple">{ind.tier}</Badge>
                      <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--color-primary)', marginTop: '2px' }}>
                        {ind.points.toLocaleString()} XP
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: BADGES & MILESTONES */}
      {/* ========================================================================= */}
      {activeTab === 'badges' && badgesData && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section banner */}
          <div className="section-intro-banner">
            <div className="section-intro-content">
              <div className="section-intro-icon">
                <Award size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px 0' }}>
                  5S Milestone Badges & Continuous Habit Progress
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Earn achievement badges across 6 pillars by maintaining clean streaks, speeding up CAPA resolutions, eliminating red tags, and submitting creative poka-yoke visual standards.
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-surface-subtle)', padding: '3px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => setBadgeFilter('ALL')}
                  style={{
                    border: 'none',
                    background: badgeFilter === 'ALL' ? 'var(--color-primary)' : 'transparent',
                    color: badgeFilter === 'ALL' ? '#FFFFFF' : 'var(--text-secondary)',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  All ({badgesData.totalBadges})
                </button>
                <button
                  onClick={() => setBadgeFilter('UNLOCKED')}
                  style={{
                    border: 'none',
                    background: badgeFilter === 'UNLOCKED' ? 'var(--color-primary)' : 'transparent',
                    color: badgeFilter === 'UNLOCKED' ? '#FFFFFF' : 'var(--text-secondary)',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Unlocked ({badgesData.unlockedCount})
                </button>
                <button
                  onClick={() => setBadgeFilter('IN_PROGRESS')}
                  style={{
                    border: 'none',
                    background: badgeFilter === 'IN_PROGRESS' ? 'var(--color-primary)' : 'transparent',
                    color: badgeFilter === 'IN_PROGRESS' ? '#FFFFFF' : 'var(--text-secondary)',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  In Progress ({badgesData.totalBadges - badgesData.unlockedCount})
                </button>
              </div>
            </div>
          </div>

          {/* Grid of Badges */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {filteredBadges.map((bg) => (
              <div
                key={bg.id}
                className="card"
                style={{
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  opacity: bg.unlocked ? 1 : 0.85,
                  background: bg.unlocked ? 'var(--bg-surface)' : 'var(--bg-surface-subtle)',
                  border: bg.unlocked ? '1px solid rgba(16, 185, 129, 0.4)' : '1px dashed var(--border-subtle)',
                  boxShadow: bg.unlocked ? '0 2px 8px rgba(16, 185, 129, 0.08)' : 'none',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: 'var(--radius-md)',
                        background: bg.unlocked ? 'var(--color-success-bg)' : 'var(--bg-surface)',
                        color: bg.unlocked ? 'var(--color-success)' : 'var(--text-tertiary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {getBadgeIconComponent(bg.icon)}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <Badge variant={bg.tier === 'LEGENDARY' ? 'warning' : bg.tier === 'EPIC' ? 'purple' : 'info'}>
                        {bg.tier}
                      </Badge>
                      {bg.unlocked && <Badge variant="success">UNLOCKED</Badge>}
                    </div>
                  </div>

                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>
                    {bg.title}
                  </h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                    {bg.description}
                  </p>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    <span>Progress: {bg.progress.current} / {bg.progress.target}</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>+{bg.xpReward} XP</span>
                  </div>
                  <ProgressBar value={bg.progress.percent} color={bg.unlocked ? 'success' : 'primary'} />
                  {bg.unlockedDate && (
                    <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                      Unlocked on {bg.unlockedDate}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: POINT ECONOMY & RULES */}
      {/* ========================================================================= */}
      {activeTab === 'rules' && overview && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section banner */}
          <div className="section-intro-banner">
            <div className="section-intro-content">
              <div className="section-intro-icon">
                <Zap size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px 0' }}>
                  5S Point Economy & Behavioral Incentives Framework
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Engineered to reward daily sustaining discipline, quick turnaround on corrective actions, and proactive safety improvements rather than static inspection checklists.
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <CheckCircle2 size={18} color="var(--color-primary)" />
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Audit Execution & High Scores
                </h3>
              </div>
              <ul style={{ paddingLeft: '16px', margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li><strong>+100 XP:</strong> Achieving overall score ≥ 90% in scheduled routine audit.</li>
                <li><strong>+250 XP:</strong> Perfect 100% Score across all 6S pillars in an audit round.</li>
                <li><strong>+30 XP:</strong> Auditor completing scheduled audit on time with photo evidence.</li>
                <li><strong>+20 XP:</strong> Fast Area Owner acknowledgement within 2 hours of audit submission.</li>
              </ul>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Zap size={18} color="#d97706" />
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Rapid CAPA Resolution & 5-Why
                </h3>
              </div>
              <ul style={{ paddingLeft: '16px', margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li><strong>+50 XP:</strong> Closing CAPA ticket with verified photo proof under 24 hours.</li>
                <li><strong>+25 XP:</strong> Closing CAPA ticket within 48 hours.</li>
                <li><strong>+30 XP:</strong> Root cause 5-Why analysis fully filled and approved by auditor.</li>
                <li><strong style={{ color: '#ef4444' }}>-15 XP:</strong> Deduction for overdue CAPA exceeding SLA timeline.</li>
              </ul>
            </Card>

            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Lightbulb size={18} color="#8b5cf6" />
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                  Daily Habits & Kaizen Ideas
                </h3>
              </div>
              <ul style={{ paddingLeft: '16px', margin: 0, fontSize: '12.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li><strong>+10 XP / day:</strong> Completing daily Kamishibai 2-minute visual sweep.</li>
                <li><strong>+75 XP:</strong> Maintaining zero red-tag holding backlog for 7 consecutive days.</li>
                <li><strong>+40 XP:</strong> Submitting accepted visual standard improvement / poka-yoke idea.</li>
                <li><strong>+300 XP:</strong> Milestone bonus for achieving a 30-day flawless clean streak.</li>
              </ul>
            </Card>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: RECOGNITION & KUDOS WALL */}
      {/* ========================================================================= */}
      {activeTab === 'kudos' && trophiesData && (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Section banner */}
          <div className="section-intro-banner">
            <div className="section-intro-content">
              <div className="section-intro-icon">
                <Heart size={22} color="#ec4899" />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px 0' }}>
                  Peer Recognition & Kaizen Kudos Wall
                </h3>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Celebrate colleagues who take initiative, clean up abnormalities, share shadow board innovations, and support cross-functional audit rotations. Sending kudos awards +25 XP to the recipient!
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                size="sm"
                variant="primary"
                icon={<Heart size={14} />}
                onClick={() => setKudosModalOpen(true)}
              >
                Send Kudos (+25 XP)
              </Button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {trophiesData.kudosFeed.map((kd) => (
              <div
                key={kd.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: '14px',
                  borderLeft: '4px solid #ec4899',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      background: 'rgba(236, 72, 153, 0.12)',
                      color: '#db2777',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Heart size={20} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{kd.fromUser}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>recognized</span>
                      <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--color-primary)' }}>{kd.toUser}</span>
                      <Badge variant="purple">{kd.category.replace('_', ' ')}</Badge>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                      "{kd.message}"
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#db2777' }}>+{kd.points} XP</span>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{kd.timestamp}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: AWARD / TRANSFER TROPHY */}
      {/* ========================================================================= */}
      {awardModalOpen && selectedTrophyToAward && (
        <Modal
          isOpen={awardModalOpen}
          onClose={() => setAwardModalOpen(false)}
          title={`Award Floating Trophy: ${selectedTrophyToAward.title}`}
          maxWidth="580px"
        >
          <form onSubmit={handleAwardTrophySubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '12px', background: 'var(--bg-surface-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Awarding this trophy transfers the active floating badge to the winning workstation and archives the previous holder in the <strong>Hall of Fame</strong>.
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Select Floating Trophy *
              </label>
              <select
                className="form-select"
                value={selectedTrophyToAward.id}
                onChange={(e) => {
                  const tr = trophiesData?.floatingTrophies.find((t) => t.id === e.target.value);
                  if (tr) setSelectedTrophyToAward(tr);
                }}
              >
                {trophiesData?.floatingTrophies.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {tr.title} ({tr.tier} Tier) — Currently at {tr.currentHolder.locationName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Select Winning Workstation / Area *
              </label>
              <select
                className="form-select"
                value={selectedNewLocationId}
                onChange={(e) => setSelectedNewLocationId(e.target.value)}
                required
              >
                {locations.length > 0 ? (
                  locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.areaCode}) — {loc.building || 'Plant'}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="loc-1">Heavy CNC Milling Cell 01 (LOC-BLR-MACH-CNC01)</option>
                    <option value="loc-2">High-Precision 5-Axis Milling 02 (LOC-BLR-MACH-CNC02)</option>
                    <option value="loc-3">Surface Mount Technology SMT Line 01 (LOC-BLR-ASSY-SMT01)</option>
                    <option value="loc-5">Raw Material High-Bay Pallet Racks (LOC-BLR-LOG-WH01)</option>
                    <option value="loc-7">Metrology & CMM Quality Inspection Lab (LOC-BLR-QC-LAB01)</option>
                  </>
                )}
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Commendation & Citation Notes *
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Describe the exceptional 5S cleanliness, Kaizen implementation, or audit streak that won this award..."
                value={trophyCitation}
                onChange={(e) => setTrophyCitation(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <Button type="button" variant="secondary" onClick={() => setAwardModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon={<Trophy size={15} />} loading={actionLoading}>
                Confirm & Award Trophy
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: SEND KUDOS */}
      {/* ========================================================================= */}
      {kudosModalOpen && (
        <Modal
          isOpen={kudosModalOpen}
          onClose={() => setKudosModalOpen(false)}
          title="Send Peer Recognition & +25 XP Kudos"
          maxWidth="560px"
        >
          <form onSubmit={handleGiveKudosSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Recipient Colleague / Team *
              </label>
              <input
                type="text"
                className="form-input"
                list="kudos-recipients-list"
                value={kudosToUser}
                onChange={(e) => setKudosToUser(e.target.value)}
                placeholder="Type or select colleague name..."
                required
              />
              <datalist id="kudos-recipients-list">
                <option value="Deepa Krishnan (Assembly Lead)" />
                <option value="Ramesh Kumar (SMT Area Owner)" />
                <option value="Rajesh Sharma (CNC Area Owner)" />
                <option value="Priya Sharma (Quality Lead)" />
                <option value="Amit Patel (Warehouse Supervisor)" />
                <option value="Vikram Singh (CNC Specialist)" />
                <option value="Thomas Wright (5S Auditor)" />
                <option value="Sunil Verma (Logistics Lead)" />
              </datalist>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Recognition Category *
              </label>
              <select
                className="form-select"
                value={kudosCategory}
                onChange={(e) => setKudosCategory(e.target.value)}
              >
                <option value="KAIZEN_INNOVATION">Kaizen Innovation & Poka-Yoke</option>
                <option value="CLEAN_STREAK">Immaculate 3S Cleanliness Streak</option>
                <option value="RAPID_CAPA">Lightning Rapid CAPA Resolution</option>
                <option value="SAFETY_LEADERSHIP">Safety & Hazard Elimination</option>
                <option value="AUDIT_SUPPORT">Outstanding Audit Coaching</option>
              </select>
            </div>

            <div>
              <label className="form-label" style={{ fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                Appreciation Message *
              </label>
              <textarea
                className="form-textarea"
                rows={3}
                placeholder="Write a warm note of appreciation for your teammate's 5S contribution..."
                value={kudosMessage}
                onChange={(e) => setKudosMessage(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
              <Button type="button" variant="secondary" onClick={() => setKudosModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" icon={<Send size={15} />} loading={actionLoading}>
                Send Recognition & +25 XP
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: PRINTABLE 5S BEST TEAM CERTIFICATE */}
      {/* ========================================================================= */}
      {certModalOpen && selectedCertItem && (
        <Modal
          isOpen={certModalOpen}
          onClose={() => setCertModalOpen(false)}
          title="5S Best Team Award Certificate"
          maxWidth="720px"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
            {/* Certificate Canvas Box */}
            <div
              id="printable-certificate-card"
              className="printable-trophy-cert"
              style={{
                width: '100%',
                background: '#FFFFFF',
                border: '8px double #d97706',
                borderRadius: 'var(--radius-lg)',
                padding: '36px 40px',
                textAlign: 'center',
                boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)',
                  }}
                >
                  <Trophy size={32} />
                </div>
              </div>

              <div style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                SKILGLOBAL OPERATIONAL EXCELLENCE AWARDS
              </div>

              <h2 style={{ fontSize: '24px', fontWeight: 900, color: '#1e293b', margin: '8px 0 2px 0' }}>
                CERTIFICATE OF 5S EXCELLENCE
              </h2>

              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '16px' }}>
                This is proudly presented to the workstation team of
              </div>

              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--color-primary)', textDecoration: 'underline', textUnderlineOffset: '4px', marginBottom: '4px' }}>
                {selectedCertItem.winningLocation}
              </div>

              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Department of {selectedCertItem.department}
              </div>

              <div style={{ fontSize: '14px', fontWeight: 700, color: '#b45309', marginBottom: '8px' }}>
                FOR WINNING: {selectedCertItem.trophyTitle.toUpperCase()} ({selectedCertItem.period})
              </div>

              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', maxWidth: '520px', margin: '0 auto 24px auto', lineHeight: 1.5 }}>
                "{selectedCertItem.citation}"
              </p>

              {/* Signatures & date */}
              <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px', fontSize: '12px' }}>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{selectedCertItem.teamLead}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Area Owner / Team Lead</div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Priya Sharma</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>5S Plant Steering Committee</div>
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{selectedCertItem.awardedDate}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Date of Conferral</div>
                </div>
              </div>
            </div>

            {/* Modal actions */}
            <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%' }}>
              <Button variant="secondary" onClick={() => setCertModalOpen(false)}>
                Close
              </Button>
              <Button variant="primary" icon={<Printer size={15} />} onClick={() => window.print()}>
                Print / Save PDF Certificate
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
