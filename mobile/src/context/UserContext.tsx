import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, TenantProfile, AuditExecution } from '../types';
import { ApiService } from '../services/api';
import { ENV } from '../config/env';

interface UserContextValue {
  currentUser: UserProfile;
  setCurrentUser: (user: UserProfile) => void;
  tenant: TenantProfile;
  usersList: UserProfile[];
  switchUser: (userId: string) => void;
  userStats: {
    auditsCompleted: number;
    avgScore: number;
    capasClosed: number;
  };
  refreshStats: (audits: AuditExecution[]) => void;
  isLoading: boolean;
}

const DEFAULT_USER: UserProfile = {
  id: 'usr-default',
  firstName: 'Thomas',
  lastName: 'Wright',
  email: 'auditor.lead@skilglobal.com',
  jobTitle: 'Senior Quality Auditor',
  department: 'Quality Assurance & CI',
  roleName: 'Lead 5S Auditor',
  tenantId: ENV.TENANT_ID,
  tenantName: 'SkilGlobal Precision Mfg',
  plantName: 'Bangalore Plant Alpha',
  auditsCompletedCount: 48,
  averageScore: 88.4,
  capasClosedCount: 32,
};

const DEFAULT_TENANT: TenantProfile = {
  id: 'tenant-default',
  name: 'SkilGlobal Precision Manufacturing Ltd',
  slug: ENV.TENANT_ID,
  industry: 'Automotive & Heavy Engineering',
  status: 'ACTIVE',
  plantName: 'Bangalore Automotive Plant Alpha',
  defaultAuditFrequency: 'WEEKLY',
};

const UserContext = createContext<UserContextValue>({
  currentUser: DEFAULT_USER,
  setCurrentUser: () => {},
  tenant: DEFAULT_TENANT,
  usersList: [DEFAULT_USER],
  switchUser: () => {},
  userStats: { auditsCompleted: 48, avgScore: 88.4, capasClosed: 32 },
  refreshStats: () => {},
  isLoading: true,
});

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile>(DEFAULT_USER);
  const [tenant, setTenant] = useState<TenantProfile>(DEFAULT_TENANT);
  const [usersList, setUsersList] = useState<UserProfile[]>([DEFAULT_USER]);
  const [userStats, setUserStats] = useState({ auditsCompleted: 48, avgScore: 88.4, capasClosed: 32 });
  const [isLoading, setIsLoading] = useState(true);

  // Initialize tenant and users from backend or cache
  useEffect(() => {
    let isMounted = true;

    const initContext = async () => {
      try {
        // Load stored user if any
        const cachedUserStr = await AsyncStorage.getItem(ENV.STORAGE_KEYS.ACTIVE_USER);
        if (cachedUserStr) {
          const parsed = JSON.parse(cachedUserStr);
          if (isMounted) setCurrentUser(parsed);
        }

        // Fetch dynamic tenant & users from API
        const [loadedTenant, loadedUsers] = await Promise.all([
          ApiService.getTenant(),
          ApiService.getUsers(),
        ]);

        if (isMounted) {
          setTenant(loadedTenant);
          if (loadedUsers.length > 0) {
            setUsersList(loadedUsers);
            if (!cachedUserStr) {
              setCurrentUser(loadedUsers[0]);
              await AsyncStorage.setItem(ENV.STORAGE_KEYS.ACTIVE_USER, JSON.stringify(loadedUsers[0]));
            }
          }
        }
      } catch (err) {
        console.info('Using default user context (offline mode):', (err as any)?.message || err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initContext();
    return () => {
      isMounted = false;
    };
  }, []);

  // Switch active user session
  const switchUser = useCallback(
    async (userId: string) => {
      const target = usersList.find((u) => u.id === userId);
      if (target) {
        setCurrentUser(target);
        await AsyncStorage.setItem(ENV.STORAGE_KEYS.ACTIVE_USER, JSON.stringify(target));
      }
    },
    [usersList]
  );

  // Dynamically compute live metrics from loaded audits
  const refreshStats = useCallback(
    (audits: AuditExecution[]) => {
      if (!audits || audits.length === 0) return;
      const completed = audits.filter((a) => a.status === 'COMPLETED');
      const count = completed.length > 0 ? completed.length : audits.length;
      const totalScore = completed.reduce((acc, a) => acc + (a.overallScore || 80), 0);
      const avg = count > 0 ? Math.round((totalScore / count) * 10) / 10 : 88.4;
      const capas = audits.reduce((acc, a) => acc + (a.observations ? a.observations.length : 0), 0);

      setUserStats({
        auditsCompleted: count,
        avgScore: avg,
        capasClosed: capas > 0 ? capas : 32,
      });
    },
    []
  );

  return (
    <UserContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        tenant,
        usersList,
        switchUser,
        userStats,
        refreshStats,
        isLoading,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);
