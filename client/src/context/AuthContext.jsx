import { createContext, useContext, useEffect, useState } from "react";
import { apiRequest } from "../api/client.js";
import { createRealtimeSocket } from "../realtime/socket.js";

const AuthContext = createContext(null);
const STORAGE_KEY = "tenant-lms-session";

const readSession = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const initialSession = readSession();
  const [session, setSession] = useState(initialSession);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(Boolean(initialSession?.token));

  const refreshSession = async (token = session?.token) => {
    if (!token) {
      return null;
    }

    const result = await apiRequest("/auth/me", { token });
    const nextSession = {
      ...(readSession() ?? session ?? {}),
      token,
      company: result.company,
      user: result.user
    };

    setSession(nextSession);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
    return nextSession;
  };

  useEffect(() => {
    if (!session?.token) {
      setLoading(false);
      return;
    }

    refreshSession(session.token)
      .catch(() => {
        localStorage.removeItem(STORAGE_KEY);
        setSession(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!session?.token) {
      setSocket((currentSocket) => {
        currentSocket?.disconnect();
        return null;
      });
      return undefined;
    }

    const nextSocket = createRealtimeSocket(session.token);
    setSocket(nextSocket);

    return () => {
      nextSocket.disconnect();
      setSocket((currentSocket) => (currentSocket === nextSocket ? null : currentSocket));
    };
  }, [session?.token]);

  const saveSession = (payload) => {
    setSession(payload);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  };

  const login = async (credentials) => {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: credentials
    });
    saveSession(result);
    return result;
  };

  const registerCompany = async (payload) => {
    const result = await apiRequest("/auth/register-company", {
      method: "POST",
      body: payload
    });
    saveSession(result);
    return result;
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  };

  const value = {
    token: session?.token ?? null,
    user: session?.user ?? null,
    company: session?.company ?? null,
    socket,
    isAuthenticated: Boolean(session?.token),
    loading,
    login,
    registerCompany,
    logout,
    refreshSession,
    hasPermission: (permission) =>
      Boolean(session?.user?.role?.permissions?.[permission])
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
