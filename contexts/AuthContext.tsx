import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { setAuthTokenGetter, setBaseUrl } from '@workspace/api-client-react';

// The generated API client already includes /api from the OpenAPI server URL.
// Only override the base when an explicit deployment URL is supplied.
const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
if (configuredApiBase) setBaseUrl(configuredApiBase.replace(/\/$/, ''));

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  branch?: string | null;
  phone?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    const stored = localStorage.getItem('token');
    if (!stored) return null;
    try {
      // Validate JWT structure: must have exactly 3 dot-separated parts
      const parts = stored.split('.');
      if (parts.length !== 3) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        return null;
      }
      return stored;
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      return null;
    }
  });

  // Verify token freshness on app init by calling /api/auth/me
  useEffect(() => {
    if (!token) return;
    const verifyToken = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
          credentials: 'include',
        });
        if (response.status === 401 || response.status === 403) {
          // Token is invalid or expired
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
          setAuthTokenGetter(null);
        }
      } catch (err) {
        // Network error during verification; don't clear token yet
      }
    };
    verifyToken();
  }, []);

  // Keep the generated client's authorization source synchronized across
  // page reloads and login/logout transitions.
  useEffect(() => {
    setAuthTokenGetter(token ? () => token : null);
  }, [token]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    setAuthTokenGetter(() => newToken);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setAuthTokenGetter(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

