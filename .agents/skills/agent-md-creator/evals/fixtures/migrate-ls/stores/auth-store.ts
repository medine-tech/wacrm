import { create } from 'zustand';

interface AuthState {
  user: User | null;
  token: string | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  login: async (credentials) => {
    const response = await api.post('/auth/login', credentials);
    set({ user: response.user, token: response.token });
  },
  logout: () => set({ user: null, token: null }),
  isAuthenticated: () => get().token !== null,
}));
