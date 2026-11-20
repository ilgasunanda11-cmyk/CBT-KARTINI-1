import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../services/api';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  needsInitialSetup: boolean;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [needsInitialSetup, setNeedsInitialSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const [meRes, setupRes] = await Promise.all([
        apiRequest<{ user: User | null }>('/api/auth/me'),
        apiRequest<{ needsInitialSetup: boolean }>('/api/auth/setup-status'),
      ]);
      setUser(meRes.user);
      setNeedsInitialSetup(setupRes.needsInitialSetup);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, needsInitialSetup, loading, refreshAuth, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
