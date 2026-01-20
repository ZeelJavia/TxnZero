import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface User {
  userId: number;
  phoneNumber: string;
  fullName: string;
  vpa: string | null;
  kycStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

export interface UserDevice {
  deviceId: string;
  modelName: string;
  osVersion: string;
  isTrusted: boolean;
  lastLoginIp: string;
}

export interface LinkedAccount {
  vpa: string;
  bankHandle: string;
  bankName: string;
  maskedAccountNumber: string;
  isPrimary: boolean;
}

export interface Transaction {
  transactionId: string;
  senderVpa: string;
  receiverVpa: string;
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'BLOCKED_FRAUD' | 'DEEMED_APPROVED' | 'REVERSED';
  timestamp: string;
  description?: string;
  senderName?: string;
  receiverName?: string;
  riskScore?: number;
  direction?: 'CREDIT' | 'DEBIT';  // Added for easier income/spent calculation
  counterpartyVpa?: string;  // The other party in the transaction
}

// ============================================
// AUTH STORE - Optimized with selective persistence
// ============================================

interface AuthStore {
  user: User | null;
  devices: UserDevice[];
  isAuthenticated: boolean;
  isLoading: boolean;
  
  // Actions
  setUser: (user: User | null) => void;
  updateUser: (updates: Partial<User>) => void;
  setDevices: (devices: UserDevice[]) => void;
  setAuthenticated: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  logout: () => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      devices: [],
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      
      updateUser: (updates) => {
        const currentUser = get().user;
        if (currentUser) {
          set({ user: { ...currentUser, ...updates } });
        }
      },
      
      setDevices: (devices) => set({ devices }),
      setAuthenticated: (value) => set({ isAuthenticated: value }),
      setLoading: (value) => set({ isLoading: value }),
      
      logout: () => set({ 
        user: null, 
        devices: [], 
        isAuthenticated: false 
      }),
      
      clearAuth: () => {
        set({ user: null, devices: [], isAuthenticated: false });
        // Also clear account store
        useAccountStore.getState().clearAccount();
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      // Only persist essential auth data
      partialize: (state) => ({ 
        user: state.user,
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
);

// ============================================
// ACCOUNT STORE - Bank accounts & VPAs
// ============================================

interface AccountStore {
  linkedAccounts: LinkedAccount[];
  banks: string[];
  primaryVpa: string | null;
  defaultVpa: string | null;
  balance: number | null;
  selectedBankHandle: string | null;
  
  // Actions
  setLinkedAccounts: (accounts: LinkedAccount[]) => void;
  addLinkedAccount: (account: LinkedAccount) => void;
  removeLinkedAccount: (vpa: string) => void;
  setBanks: (banks: string[]) => void;
  setPrimaryVpa: (vpa: string) => void;
  setDefaultVpa: (vpa: string) => void;
  setBalance: (balance: number) => void;
  setSelectedBankHandle: (handle: string | null) => void;
  clearAccount: () => void;
}

export const useAccountStore = create<AccountStore>()(
  persist(
    (set) => ({
      linkedAccounts: [],
      banks: [],
      primaryVpa: null,
      defaultVpa: null,
      balance: null,
      selectedBankHandle: null,

      setLinkedAccounts: (accounts) => set({ linkedAccounts: accounts }),
      
      addLinkedAccount: (account) => 
        set((state) => ({ 
          linkedAccounts: [...state.linkedAccounts, account],
          // Auto-set as primary if first account
          primaryVpa: state.linkedAccounts.length === 0 ? account.vpa : state.primaryVpa,
          defaultVpa: state.linkedAccounts.length === 0 ? account.vpa : state.defaultVpa,
        })),
        
      removeLinkedAccount: (vpa) =>
        set((state) => ({
          linkedAccounts: state.linkedAccounts.filter(a => a.vpa !== vpa),
          primaryVpa: state.primaryVpa === vpa ? null : state.primaryVpa,
          defaultVpa: state.defaultVpa === vpa ? null : state.defaultVpa,
        })),
        
      setBanks: (banks) => set({ banks }),
      setPrimaryVpa: (vpa) => set({ primaryVpa: vpa }),
      setDefaultVpa: (vpa) => set({ defaultVpa: vpa, primaryVpa: vpa }),
      setBalance: (balance) => set({ balance }),
      setSelectedBankHandle: (handle) => set({ selectedBankHandle: handle }),
      
      clearAccount: () => set({
        linkedAccounts: [],
        banks: [],
        primaryVpa: null,
        defaultVpa: null,
        balance: null,
        selectedBankHandle: null,
      }),
    }),
    {
      name: 'ledger-account',
      storage: createJSONStorage(() => localStorage),
      // Persist account data for quick loads
      partialize: (state) => ({
        linkedAccounts: state.linkedAccounts,
        primaryVpa: state.primaryVpa,
        defaultVpa: state.defaultVpa,
      }),
    }
  )
);

// ============================================
// TRANSACTION STORE - With pagination support
// ============================================

interface TransactionStore {
  transactions: Transaction[];
  isLoading: boolean;
  hasMore: boolean;
  page: number;
  
  // Actions
  setTransactions: (transactions: Transaction[]) => void;
  addTransaction: (transaction: Transaction) => void;
  appendTransactions: (transactions: Transaction[]) => void;
  updateTransactionStatus: (txnId: string, status: Transaction['status']) => void;
  setLoading: (loading: boolean) => void;
  setHasMore: (hasMore: boolean) => void;
  nextPage: () => void;
  resetPagination: () => void;
  clearTransactions: () => void;
}

export const useTransactionStore = create<TransactionStore>()((set) => ({
  transactions: [],
  isLoading: false,
  hasMore: true,
  page: 1,

  setTransactions: (transactions) => set({ transactions }),
  
  addTransaction: (transaction) =>
    set((state) => ({
      transactions: [transaction, ...state.transactions],
    })),
    
  appendTransactions: (transactions) =>
    set((state) => ({
      transactions: [...state.transactions, ...transactions],
    })),
    
  updateTransactionStatus: (txnId, status) =>
    set((state) => ({
      transactions: state.transactions.map((t) =>
        t.transactionId === txnId ? { ...t, status } : t
      ),
    })),
    
  setLoading: (isLoading) => set({ isLoading }),
  setHasMore: (hasMore) => set({ hasMore }),
  nextPage: () => set((state) => ({ page: state.page + 1 })),
  resetPagination: () => set({ page: 1, hasMore: true }),
  clearTransactions: () => set({ transactions: [], page: 1, hasMore: true }),
}));

// ============================================
// UI STORE - For global UI state
// ============================================

interface UIStore {
  isOnboarding: boolean;
  onboardingStep: 'welcome' | 'select-bank' | 'bank-otp' | 'set-mpin' | 'success';
  showPaymentModal: boolean;
  paymentData: {
    receiverVpa: string;
    amount: number;
    description?: string;
  } | null;
  
  // Actions
  setOnboarding: (value: boolean) => void;
  setOnboardingStep: (step: UIStore['onboardingStep']) => void;
  openPaymentModal: (data: UIStore['paymentData']) => void;
  closePaymentModal: () => void;
}

export const useUIStore = create<UIStore>()((set) => ({
  isOnboarding: false,
  onboardingStep: 'welcome',
  showPaymentModal: false,
  paymentData: null,

  setOnboarding: (isOnboarding) => set({ isOnboarding }),
  setOnboardingStep: (onboardingStep) => set({ onboardingStep }),
  openPaymentModal: (paymentData) => set({ showPaymentModal: true, paymentData }),
  closePaymentModal: () => set({ showPaymentModal: false, paymentData: null }),
}));

// ============================================
// SELECTORS - Memoized derived state
// ============================================

export const selectUserVpa = () => useAuthStore.getState().user?.vpa;
export const selectDefaultVpa = () => useAccountStore.getState().defaultVpa;
export const selectIsAuthenticated = () => useAuthStore.getState().isAuthenticated;
export const selectLinkedAccounts = () => useAccountStore.getState().linkedAccounts;
