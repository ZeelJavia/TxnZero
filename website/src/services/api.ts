import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ApiResponse<T = Record<string, unknown>> {
  message: string;
  statusCode: number;
  error: string | null;
  data: T | null;
}

// ============================================
// API CLIENT CONFIGURATION
// ============================================

// In development, use empty string to leverage Vite's proxy
// In production, use the actual API URL
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Create axios instance with optimized defaults
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000, // 15s timeout for payment flows
  withCredentials: true, // Important for JWT cookies
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request queue for preventing duplicate requests
const pendingRequests = new Map<string, AbortController>();

const getRequestKey = (config: InternalAxiosRequestConfig): string => {
  return `${config.method}-${config.url}-${JSON.stringify(config.data || {})}`;
};

// Request Interceptor - Optimized
api.interceptors.request.use(
  (config) => {
    // Add device ID header
    const deviceId = localStorage.getItem('deviceId');
    if (deviceId) {
      config.headers['X-Device-Id'] = deviceId;
    }

    // Cancel duplicate requests (except for POST payments)
    if (config.method !== 'post' || !config.url?.includes('/payments')) {
      const requestKey = getRequestKey(config);
      
      // Cancel previous identical request
      if (pendingRequests.has(requestKey)) {
        pendingRequests.get(requestKey)?.abort();
      }

      // Create new abort controller
      const controller = new AbortController();
      config.signal = controller.signal;
      pendingRequests.set(requestKey, controller);
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor - Optimized error handling
api.interceptors.response.use(
  (response) => {
    // Remove from pending requests
    const requestKey = getRequestKey(response.config);
    pendingRequests.delete(requestKey);
    return response;
  },
  (error: AxiosError<ApiResponse>) => {
    // Remove from pending requests
    if (error.config) {
      const requestKey = getRequestKey(error.config);
      pendingRequests.delete(requestKey);
    }

    // Don't treat cancelled requests as errors
    if (axios.isCancel(error)) {
      return Promise.reject({ cancelled: true });
    }

    // Handle specific HTTP errors
    const status = error.response?.status;
    
    if (status === 401) {
      // Clear auth and redirect to login
      localStorage.removeItem('auth-storage');
      localStorage.removeItem('ledger-account');
      window.location.href = '/auth';
    }

    if (status === 403) {
      console.error('Access forbidden - Device may be blocked');
    }

    if (status === 429) {
      console.error('Rate limited - Too many requests');
    }

    // Network error
    if (!error.response) {
      console.error('Network error - Please check your connection');
    }

    return Promise.reject(error);
  }
);

// ============================================
// DEVICE UTILITIES
// ============================================

export const getDeviceId = (): string => {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = `web_${crypto.randomUUID()}`;
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
};

export const getDeviceInfo = () => ({
  deviceId: getDeviceId(),
  modelName: navigator.userAgent.includes('Windows') ? 'Windows PC' : 
             navigator.userAgent.includes('Mac') ? 'Mac' : 'Web Browser',
  osVersion: navigator.platform,
  lastLoginIp: '', // Will be detected by backend
});

// ============================================
// AUTH API
// ============================================

export const authApi = {
  // Send OTP to phone number
  sendOtp: (phoneNumber: string) =>
    api.post<ApiResponse>('/api/auth/send-otp', { phoneNumber }),

  // Verify OTP
  verifyOtp: (phoneNumber: string, otp: string) =>
    api.post<ApiResponse>('/api/auth/check-otp', { phoneNumber, otp }),

  // Register new user
  register: (data: {
    phoneNumber: string;
    password: string;
    fullName: string;
    deviceId: string;
    lastLoginIp: string;
    modelName: string;
    osVersion: string;
  }) => api.post<ApiResponse>('/api/auth/register', data),

  // Login existing user
  login: (phoneNumber: string, password: string, deviceId: string) =>
    api.post<ApiResponse>('/api/auth/login', { phoneNumber, password, deviceId }),

  // Logout
  logout: () => api.post<ApiResponse>('/api/auth/logout'),

  // Change device
  changeDevice: (data: {
    phoneNumber: string;
    otp: string;
    deviceId: string;
    lastLoginIp: string;
    modelName: string;
    osVersion: string;
  }) => api.post<ApiResponse>('/api/auth/change-device', data),
};

// ============================================
// ACCOUNT/BANK API
// ============================================

export const accountApi = {
  // Get list of supported banks
  getBanks: () => 
    api.get<ApiResponse<{ banks: string[] }>>('/api/account/banks'),

  // Send OTP for bank linking (phone from JWT)
  sendBankOtp: (bankHandle: string) =>
    api.post<ApiResponse>('/api/account/bank/otp', { bankHandle }),

  // Verify bank OTP and generate VPA
  generateVpa: (bankHandle: string, otp: string) =>
    api.post<ApiResponse<{ vpa: string }>>('/api/account/bank/vpa-generate', { 
      bankHandle, 
      otp 
    }),

  // Set MPIN for the account
  setMpin: (pin: string, bankHandle: string) =>
    api.post<ApiResponse>('/api/account/bank/set-mpin', { pin, bankHandle }),

  // Get all linked bank accounts with balances
  // Flow: Frontend → Gateway → Switch → Bank
  getLinkedAccounts: () =>
    api.get<ApiResponse<LinkedAccountsResponse>>('/api/account/linked'),

  // Get balance for user's primary VPA
  getBalance: () =>
    api.get<ApiResponse<BalanceData>>('/api/account/balance'),

  // Get transaction history (paginated)
  getTransactionHistory: (page = 0, limit = 20) =>
    api.get<ApiResponse<TransactionHistoryResponse>>(`/api/account/transactions?page=${page}&limit=${limit}`),
};

// Response types for new endpoints
export interface LinkedAccountData {
  vpa: string;
  bankHandle: string;
  bankName: string;
  maskedAccountNumber: string;
  balance: number;
  isPrimary: boolean;
}

export interface LinkedAccountsResponse {
  accounts: LinkedAccountData[];
  totalAccounts: number;
}

export interface BalanceData {
  vpa: string;
  balance: number;
  bankHandle: string;
  bankName: string;
  maskedAccountNumber: string;
}

export interface TransactionHistoryItem {
  transactionId: string;
  amount: number;
  direction: 'DEBIT' | 'CREDIT';
  counterpartyVpa: string;
  balanceAfter: number;
  riskScore: number;
  timestamp: string;
}

export interface TransactionHistoryResponse {
  transactions: TransactionHistoryItem[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

// ============================================
// PAYMENT API - Optimized for low latency
// ============================================

export interface PaymentInitiateRequest {
  payerVpa: string;
  payeeVpa: string;
  amount: number;
  mpin: string;
  deviceId: string;
  ipAddress?: string;
  geoLat?: number;
  geoLong?: number;
  wifiSsid?: string;
  userAgent?: string;
}

export interface TransactionResponseData {
  txnId: string;
  status: string;
  message: string;
  riskScore?: number;
}

export const paymentApi = {
  // Initiate payment - Critical path, no caching/deduplication
  initiatePayment: (data: PaymentInitiateRequest) => 
    api.post<TransactionResponseData>('/api/payments/initiate', {
      ...data,
      userAgent: data.userAgent || navigator.userAgent,
    }),

  // Get transaction status
  getStatus: (txnId: string) =>
    api.get<ApiResponse>(`/api/payments/status/${txnId}`),
};

// ============================================
// USER API
// ============================================

export const userApi = {
  // Get user profile (from JWT token)
  getProfile: () => 
    api.get<ApiResponse>('/api/users/profile'),

  // Get user devices
  getDevices: (userId: number) =>
    api.get<ApiResponse>(`/api/users/${userId}/devices`),

  // Add new device
  addDevice: (data: {
    userId: number;
    deviceId: string;
    modelName: string;
    osVersion: string;
    loginIp: string;
  }) => api.post<ApiResponse>('/api/users/add-device', data),
};

// ============================================
// API HELPERS
// ============================================

// Type-safe response extractor
export const extractData = <T>(response: { data: ApiResponse<T> }): T | null => {
  return response.data.data;
};

// Error message extractor
export const extractError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || 
           error.response?.data?.error || 
           error.message || 
           'An unexpected error occurred';
  }
  return 'An unexpected error occurred';
};

export default api;
