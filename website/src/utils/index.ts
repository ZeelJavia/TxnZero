// ============================================
// DEVICE UTILITIES
// ============================================

export const getDeviceId = (): string => {
  let deviceId = localStorage.getItem('deviceId');
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    localStorage.setItem('deviceId', deviceId);
  }
  return deviceId;
};

export const getDeviceInfo = () => {
  const userAgent = navigator.userAgent;
  let modelName = 'Unknown Device';
  let osVersion = 'Unknown OS';

  // Detect OS
  if (/Windows/.test(userAgent)) {
    osVersion = 'Windows ' + (/Windows NT (\d+\.\d+)/.exec(userAgent)?.[1] || '');
  } else if (/Mac OS X/.test(userAgent)) {
    osVersion = 'macOS ' + (/Mac OS X (\d+[._]\d+)/.exec(userAgent)?.[1]?.replace('_', '.') || '');
  } else if (/Android/.test(userAgent)) {
    osVersion = 'Android ' + (/Android (\d+\.?\d*)/.exec(userAgent)?.[1] || '');
  } else if (/iPhone|iPad/.test(userAgent)) {
    osVersion = 'iOS ' + (/OS (\d+[._]\d+)/.exec(userAgent)?.[1]?.replace('_', '.') || '');
  } else if (/Linux/.test(userAgent)) {
    osVersion = 'Linux';
  }

  // Detect Browser/Device
  if (/Chrome/.test(userAgent) && !/Edge|Edg/.test(userAgent)) {
    modelName = 'Chrome Browser';
  } else if (/Safari/.test(userAgent) && !/Chrome/.test(userAgent)) {
    modelName = 'Safari Browser';
  } else if (/Firefox/.test(userAgent)) {
    modelName = 'Firefox Browser';
  } else if (/Edge|Edg/.test(userAgent)) {
    modelName = 'Edge Browser';
  }

  return { modelName, osVersion, userAgent };
};

// ============================================
// FORMAT UTILITIES
// ============================================

export const formatCurrency = (amount: number, currency: string = 'INR'): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
};

export const formatPhoneNumber = (phone: string): string => {
  // Format: +91 98765 43210
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
};

export const maskPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length >= 10) {
    return `******${cleaned.slice(-4)}`;
  }
  return phone;
};

export const maskVpa = (vpa: string): string => {
  if (!vpa) return '';
  const [name, handle] = vpa.split('@');
  if (name.length <= 2) return vpa;
  return `${name[0]}***${name[name.length - 1]}@${handle}`;
};

export const maskAccountNumber = (account: string): string => {
  if (!account || account.length < 4) return account;
  return `XXXX XXXX ${account.slice(-4)}`;
};

export const formatDate = (date: string | Date): string => {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
};

export const formatRelativeTime = (date: string | Date): string => {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
};

// ============================================
// VALIDATION UTILITIES
// ============================================

export const validatePhoneNumber = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return /^[6-9]\d{9}$/.test(cleaned) || /^91[6-9]\d{9}$/.test(cleaned);
};

export const validateVpa = (vpa: string): boolean => {
  // VPA format: username@handle (e.g., alice@l0)
  return /^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(vpa);
};

export const validateMpin = (mpin: string): boolean => {
  return /^\d{4,6}$/.test(mpin);
};

export const validateAmount = (amount: number): { valid: boolean; message?: string } => {
  if (amount <= 0) {
    return { valid: false, message: 'Amount must be greater than 0' };
  }
  if (amount > 100000) {
    return { valid: false, message: 'Amount cannot exceed ₹1,00,000' };
  }
  return { valid: true };
};

// ============================================
// GEOLOCATION UTILITIES
// ============================================

export const getGeolocation = (): Promise<{ lat: number; long: number } | null> => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          long: position.coords.longitude,
        });
      },
      () => {
        resolve(null);
      },
      { timeout: 5000, maximumAge: 300000 }
    );
  });
};

// ============================================
// MISC UTILITIES
// ============================================

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const generateTransactionRef = (): string => {
  return `TXN_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

export const cn = (...classes: (string | boolean | undefined | null)[]): string => {
  return classes.filter(Boolean).join(' ');
};
