import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  Calendar,
  ChevronDown,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { Card, Input, TransactionCard, Skeleton } from '../../components/ui';
import { useTransactionStore, useAccountStore, useAuthStore } from '../../store';
import { useTransactionHistory } from '../../hooks';
import { formatCurrency, cn } from '../../utils';
import type { Transaction, TransactionStatus } from '../../types';

// ============================================
// TRANSACTIONS PAGE
// ============================================

type FilterType = 'all' | 'sent' | 'received' | 'pending' | 'failed';
type DateFilter = 'all' | 'today' | 'week' | 'month';

export const TransactionsPage = () => {
  const navigate = useNavigate();
  const { transactions, isLoading, hasMore, loadMore, refresh } = useTransactionHistory();
  const { user } = useAuthStore();
  const userVpa = user?.vpa;

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  };

  // Filter transactions
  const filteredTransactions = transactions.filter((txn) => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        txn.receiverName?.toLowerCase().includes(query) ||
        txn.senderName?.toLowerCase().includes(query) ||
        txn.receiverVpa.toLowerCase().includes(query) ||
        txn.senderVpa.toLowerCase().includes(query) ||
        txn.counterpartyVpa?.toLowerCase().includes(query) ||
        txn.description?.toLowerCase().includes(query) ||
        txn.transactionId.toLowerCase().includes(query);
      if (!matchesSearch) return false;
    }

    // Type filter - use direction field
    if (filterType === 'sent' && txn.direction !== 'DEBIT') return false;
    if (filterType === 'received' && txn.direction !== 'CREDIT') return false;
    if (filterType === 'pending' && txn.status !== 'PENDING') return false;
    if (filterType === 'failed' && txn.status !== 'FAILED') return false;

    // Date filter
    const txnDate = new Date(txn.timestamp);
    const now = new Date();
    if (dateFilter === 'today') {
      if (txnDate.toDateString() !== now.toDateString()) return false;
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (txnDate < weekAgo) return false;
    } else if (dateFilter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (txnDate < monthAgo) return false;
    }

    return true;
  });

  // Group transactions by date
  const groupedTransactions = filteredTransactions.reduce(
    (groups, txn) => {
      const date = new Date(txn.timestamp).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(txn);
      return groups;
    },
    {} as Record<string, Transaction[]>
  );

  // Calculate summary stats using direction field
  const stats = {
    totalSent: transactions
      .filter((t) => t.direction === 'DEBIT' && t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.amount, 0),
    totalReceived: transactions
      .filter((t) => t.direction === 'CREDIT' && t.status === 'SUCCESS')
      .reduce((sum, t) => sum + t.amount, 0),
    pendingCount: transactions.filter((t) => t.status === 'PENDING').length,
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-white flex-1">Transactions</h1>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
              showFilters
                ? 'bg-primary-500 text-white'
                : 'bg-slate-800/80 text-slate-400 hover:text-white'
            )}
          >
            <Filter size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500/50"
            />
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-4 space-y-3 border-t border-slate-800/50 pt-4"
          >
            {/* Type Filters */}
            <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
              {[
                { value: 'all', label: 'All' },
                { value: 'sent', label: 'Sent', icon: ArrowUpRight },
                { value: 'received', label: 'Received', icon: ArrowDownLeft },
                { value: 'pending', label: 'Pending', icon: Clock },
                { value: 'failed', label: 'Failed', icon: XCircle },
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setFilterType(filter.value as FilterType)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex items-center gap-2 transition-all',
                    filterType === filter.value
                      ? 'bg-primary-500 text-white'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  )}
                >
                  {filter.icon && <filter.icon size={16} />}
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Date Filters */}
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All Time' },
                { value: 'today', label: 'Today' },
                { value: 'week', label: 'This Week' },
                { value: 'month', label: 'This Month' },
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setDateFilter(filter.value as DateFilter)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    dateFilter === filter.value
                      ? 'bg-accent-500/20 text-accent-400 border border-accent-500/30'
                      : 'bg-slate-800/50 text-slate-500 hover:text-white'
                  )}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </header>

      {/* Content */}
      <div className="p-4 space-y-6 max-w-2xl mx-auto">
        {/* Stats Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4 text-center">
            <ArrowUpRight className="w-5 h-5 text-danger-400 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Sent</p>
            <p className="text-lg font-semibold text-white">
              {isLoading ? <Skeleton className="h-6 w-16 mx-auto" /> : formatCurrency(stats.totalSent)}
            </p>
          </Card>
          <Card className="p-4 text-center">
            <ArrowDownLeft className="w-5 h-5 text-success-400 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Received</p>
            <p className="text-lg font-semibold text-white">
              {isLoading ? <Skeleton className="h-6 w-16 mx-auto" /> : formatCurrency(stats.totalReceived)}
            </p>
          </Card>
          <Card className="p-4 text-center">
            <Clock className="w-5 h-5 text-warning-400 mx-auto mb-2" />
            <p className="text-xs text-slate-500">Pending</p>
            <p className="text-lg font-semibold text-white">
              {isLoading ? <Skeleton className="h-6 w-8 mx-auto" /> : stats.pendingCount}
            </p>
          </Card>
        </div>

        {/* Transaction List */}
        {isLoading ? (
          <Card className="divide-y divide-slate-800/50">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="p-4 flex items-center gap-4">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </Card>
        ) : filteredTransactions.length === 0 ? (
          <Card className="p-12 text-center">
            <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No transactions found</h3>
            <p className="text-slate-400">
              {searchQuery
                ? 'Try adjusting your search or filters'
                : 'Your transactions will appear here'}
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedTransactions).map(([date, txns]) => (
              <div key={date}>
                <h3 className="text-sm font-medium text-slate-400 mb-3 px-1">{date}</h3>
                <Card className="divide-y divide-slate-800/50">
                  {txns.map((txn) => (
                    <TransactionCard
                      key={txn.transactionId}
                      transaction={txn}
                      currentUserVpa={userVpa || ''}
                      onClick={() => navigate(`/transactions/${txn.transactionId}`)}
                    />
                  ))}
                </Card>
              </div>
            ))}
            
            {/* Load More Button */}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-white hover:border-primary-500/50 transition-all disabled:opacity-50"
              >
                {isLoading ? 'Loading...' : 'Load More Transactions'}
              </button>
            )}
          </div>
        )}
        
        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="fixed bottom-20 right-4 w-12 h-12 rounded-full bg-primary-500 text-white shadow-lg flex items-center justify-center hover:bg-primary-600 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  );
};

export default TransactionsPage;
