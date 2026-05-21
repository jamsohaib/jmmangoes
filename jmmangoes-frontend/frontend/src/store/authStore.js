// src/store/authStore.js
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const initialState = {
  user: null,
};

const useAuthStore = create(
  persist(
    (set) => ({
      ...initialState,
      setUser: (userData) => set({ user: userData }),
      clearUser: () => set(initialState),
    }),
    {
      name: 'auth-storage',
    }
  )
);

export default useAuthStore;
