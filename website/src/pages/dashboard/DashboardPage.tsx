import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Send,
  QrCode,
  History,
  Plus,
  Bell,
  Settings,
  ChevronRight,
  Wallet,
  CreditCard,
  Building2,
  RefreshCw,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Card, TransactionCard, Skeleton } from '../../components/ui';
import { useAuthStore, useAccountStore, useTransactionStore } from '../../store';
import { useAccountData } from '../../hooks';
import { formatCurrency } from '../../utils';


// Bank name mapping
const BANK_NAMES: Record<string, string> = {
  'SBI': 'State Bank of India',
  'AXIS': 'Axis Bank',
  'HDFC': 'HDFC Bank',
  'ICICI': 'ICICI Bank',
  'PNB': 'Punjab National Bank',
  'BOB': 'Bank of Baroda',
  'KOTAK': 'Kotak Mahindra Bank',
};

// ============================================
// DASHBOARD PAGE
// ============================================

export const DashboardPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { defaultVpa, linkedAccounts, balance } = useAccountStore();
  const { transactions } = useTransactionStore();

  // Use the new account data hook for fetching real data
  // The hook handles automatic fetching on mount
  const { 
    formattedBalance,
    isLoadingAccounts,
    isLoadingBalance,
    refreshAll,
  } = useAccountData();

  const [isBalanceVisible, setIsBalanceVisible] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const isLoading = isLoadingAccounts || isLoadingBalance;

  // Listen for refresh events from real-time notifications
  const handleDashboardRefresh = useCallback(() => {
    console.log('🔄 Refreshing dashboard data after notification...');
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    window.addEventListener('refresh-dashboard', handleDashboardRefresh);
    return () => {
      window.removeEventListener('refresh-dashboard', handleDashboardRefresh);
    };
  }, [handleDashboardRefresh]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setIsRefreshing(false);
    }
  };

  const quickActions = [
    { icon: Send, label: 'Send', onClick: () => navigate('/send'), gradient: 'from-primary-500 to-primary-600' },
    { icon: QrCode, label: 'Scan', onClick: () => navigate('/qr'), gradient: 'from-accent-500 to-accent-600' },
    { icon: History, label: 'History', onClick: () => navigate('/transactions'), gradient: 'from-emerald-500 to-emerald-600' },
    { icon: Plus, label: 'Add Bank', onClick: () => navigate('/link-bank'), gradient: 'from-amber-500 to-amber-600' },
  ];

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[var(--text-muted)] text-sm"
          >
            Good {getGreeting()},
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-2xl font-bold text-[var(--text-primary)]"
          >
            {user?.fullName?.split(' ')[0] || 'User'}
          </motion.h1>
        </div>

        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-10 h-10 rounded-xl bg-[var(--surface-glass)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors relative"
          >
            <Bell size={20} />
            <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[var(--color-error-500)]" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-xl bg-[var(--surface-glass)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <Settings size={20} />
          </motion.button>
        </div>
      </header>

      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="overflow-hidden relative">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary-500)]/10 via-transparent to-[var(--color-accent-500)]/10 pointer-events-none" />
          
          <div className="relative z-10 p-5 space-y-4">
            {/* Balance Row */}
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-[var(--text-muted)]" />
                  <span className="text-sm text-[var(--text-muted)]">Total Balance</span>
                </div>
                
                <div className="flex items-center gap-3">
                  {isLoading ? (
                    <Skeleton className="h-10 w-40" />
                  ) : (
                    <motion.h2
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-4xl font-bold text-[var(--text-primary)]"
                    >
                      {isBalanceVisible ? (balance !== null ? formatCurrency(balance) : formattedBalance) : '₹ •••••'}
                    </motion.h2>
                  )}
                  
                  <button
                    onClick={() => setIsBalanceVisible(!isBalanceVisible)}
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    {isBalanceVisible ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <button 
                onClick={handleRefresh}
                disabled={isRefreshing}
                className={`p-2 rounded-lg bg-[var(--surface-glass)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
              >
                <RefreshCw size={18} />
              </button>
            </div>

            {/* UPI ID */}
            <div className="flex items-center gap-3 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex-1">
                <p className="text-xs text-[var(--text-muted)] mb-1">UPI ID</p>
                <p className="text-[var(--text-primary)] font-medium">
                  {defaultVpa || 'Not set up'}
                </p>
              </div>
              <CreditCard className="w-8 h-8 text-[var(--color-primary-500)]" />
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-4 gap-3"
      >
        {quickActions.map((action, idx) => (
          <motion.button
            key={action.label}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + idx * 0.05 }}
            onClick={action.onClick}
            className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-[var(--surface-glass)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] hover:shadow-md transition-all group"
          >
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-lg`}>
              <action.icon className="w-6 h-6 text-white" />
            </div>
            <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
              {action.label}
            </span>
          </motion.button>
        ))}
      </motion.div>

      {/* Stats Row */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="grid grid-cols-2 gap-3"
      >
      </motion.div>

      {/* Linked Banks */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Linked Banks</h3>
          <button
            onClick={() => navigate('/link-bank')}
            className="text-sm text-[var(--color-primary-500)] hover:underline flex items-center gap-1"
          >
            Add Bank <ChevronRight size={16} />
          </button>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {isLoading ? (
            <>
              <Skeleton className="min-w-[200px] h-24 rounded-2xl" />
              <Skeleton className="min-w-[200px] h-24 rounded-2xl" />
            </>
          ) : linkedAccounts.length > 0 ? (
            <>
              {linkedAccounts.map((account) => (
                <Card key={account.vpa} className="min-w-[200px] p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--text-primary)]">
                      {BANK_NAMES[account.bankHandle] || account.bankHandle}
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">{account.maskedAccountNumber || account.vpa}</p>
                  </div>
                </Card>
              ))}
              <button
                onClick={() => navigate('/onboarding')}
                className="min-w-[140px] p-4 rounded-2xl border-2 border-dashed border-[var(--border-default)] flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--color-primary-500)] transition-colors"
              >
                <Plus size={24} />
                <span className="text-sm">Add Bank</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/onboarding')}
              className="w-full p-6 rounded-2xl border-2 border-dashed border-[var(--border-default)] flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--color-primary-500)] transition-colors"
            >
              <Building2 size={32} />
              <span className="font-medium">Link Your First Bank Account</span>
              <span className="text-sm">Start sending and receiving money</span>
            </button>
          )}
        </div>
      </motion.div>

      {/* Recent Transactions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Recent Transactions</h3>
          <button
            onClick={() => navigate('/transactions')}
            className="text-sm text-[var(--color-primary-500)] hover:underline flex items-center gap-1"
          >
            See All <ChevronRight size={16} />
          </button>
        </div>

        <Card className="divide-y divide-[var(--border-subtle)]">
          {isLoading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="w-12 h-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : transactions.length > 0 ? (
            transactions.slice(0, 5).map((txn) => (
              <TransactionCard
                key={txn.transactionId}
                transaction={txn}
                currentUserVpa={defaultVpa || ''}
                onClick={() => navigate(`/transactions/${txn.transactionId}`)}
              />
            ))
          ) : (
            <div className="p-8 text-center">
              <History className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
              <p className="text-[var(--text-secondary)]">No transactions yet</p>
              <p className="text-sm text-[var(--text-muted)]">Start by sending or receiving money</p>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
};

// Helper function
const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

export default DashboardPage;
