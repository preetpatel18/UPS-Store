import type { Role } from "../data/operations";

export type SessionUser = {
  id: string;
  name: string;
  username?: string;
  email: string;
  role: Role;
  store?: string;
  storeName?: string;
  department?: string;
  status?: string;
  profilePicture?: string;
  notificationPreferences?: {
    inApp: boolean;
    messages: boolean;
    requests: boolean;
    operations: boolean;
    security: boolean;
  };
};

export type Session = {
  user: SessionUser;
  token: string;
};

const SESSION_KEY = "storeops_session";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as Session) : null;
    if (!session?.token || !session?.user?.role) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export async function apiFetch<T>(path: string, options: RequestInit = {}) {
  const session = getSession();
  const isLoginRequest = path === "/auth/login";
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new Error("API server is unavailable. Start the backend and verify MongoDB Atlas Network Access.");
  }

  const text = response.status === 204 ? "" : await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    if (response.status === 401) {
      if (isLoginRequest) {
        throw new Error(data?.message ?? "Invalid username/email or password.");
      }
      clearSession();
      if (window.location.pathname !== "/auth") {
        window.location.assign("/auth");
      }
      throw new Error("Your session expired. Please sign in again.");
    }
    throw new Error(data?.message ?? "API server is unavailable. Start the backend and verify MongoDB Atlas Network Access.");
  }
  if (response.status !== 204 && !text) {
    throw new Error("The API server returned an empty response.");
  }

  return data as T;
}
