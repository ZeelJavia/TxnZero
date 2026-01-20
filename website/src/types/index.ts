// ============================================
// LEDGERZERO TYPE DEFINITIONS
// ============================================

// Re-export from store for convenience
export type {
  User,
  UserDevice,
  LinkedAccount,
  Transaction,
} from '../store';

// Auth Types
export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AuthState {
  user: User | null;
  devices: UserDevice[];
  isAuthenticated: boolean;
  isLoading: boolean;
}

export type AuthStep = 'phone' | 'otp' | 'register' | 'login';

// Transaction Types
export type TransactionStatus = 
  | 'PENDING' 
  | 'SUCCESS' 
  | 'FAILED' 
  | 'BLOCKED_FRAUD' 
  | 'DEEMED_APPROVED' 
  | 'REVERSED';

// From store - importing for type augmentation
import type { User, UserDevice } from '../store';

export interface PaymentRequest {
  payerVpa: string;
  payeeVpa: string;
  amount: number;
  mpin: string;
  deviceId: string;
  description?: string;
  geoLat?: number;
  geoLong?: number;
}

export interface TransactionResponse {
  txnId: string;
  transactionId: string;  // Alias for txnId
  status: TransactionStatus;
  message: string;
  amount?: number;
  timestamp?: string;
  riskScore?: number;
}

// Bank Types
export interface Bank {
  bankHandle: string;
  bankName: string;
  logo?: string;
}

// Bank handle to display name mapping
export const BANK_NAMES: Record<string, string> = {
  'axis': 'Axis Bank',
  'sbi': 'State Bank of India',
  'hdfc': 'HDFC Bank',
  'icici': 'ICICI Bank',
  'kotak': 'Kotak Mahindra Bank',
  'pnb': 'Punjab National Bank',
  'bob': 'Bank of Baroda',
  'canara': 'Canara Bank',
  'union': 'Union Bank of India',
  'idbi': 'IDBI Bank',
};

// Get display name for bank handle
export const getBankDisplayName = (handle: string): string => {
  return BANK_NAMES[handle.toLowerCase()] || handle.toUpperCase() + ' Bank';
};

// API Response Types
export interface ApiResponse<T = unknown> {
  message: string;
  statusCode: number;
  error: string | null;
  data: T | null;
}

// OTP Types
export interface OtpState {
  phoneNumber: string;
  otpSent: boolean;
  expiresAt: number;
  attempts: number;
}

// Form Types
export interface LoginForm {
  phoneNumber: string;
  password: string;
}

export interface RegisterForm {
  phoneNumber: string;
  fullName: string;
  password: string;
  confirmPassword: string;
}

export interface SendMoneyForm {
  receiverVpa: string;
  amount: string;
  description?: string;
  mpin: string;
}

// Utility Types
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}
