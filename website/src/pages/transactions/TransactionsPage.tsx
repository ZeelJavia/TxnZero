import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  XCircle,
  Clock,
  RefreshCw,
  Network,
  List,
} from 'lucide-react';
import { Card, TransactionCard, Skeleton, NetworkGraph } from '../../components/ui';
import type { RawTransaction } from '../../components/ui/NetworkGraph';
import { useAuthStore } from '../../store';
import { useTransactionHistory } from '../../hooks';
import { formatCurrency, cn } from '../../utils';
import { api } from '../../services/api';
import type { Transaction } from '../../types';

// ============================================
// TRANSACTIONS PAGE
// ============================================

type FilterType = 'all' | 'sent' | 'received' | 'pending' | 'failed';
type DateFilter = 'all' | 'today' | 'week' | 'month';
type TabType = 'transactions' | 'network';

export const TransactionsPage = () => {
  const navigate = useNavigate();
  const { transactions, isLoading, hasMore, loadMore, refresh } = useTransactionHistory();
  const { user } = useAuthStore();
  const userVpa = user?.vpa;

  const [activeTab, setActiveTab] = useState<TabType>('transactions');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Network graph state
  const [graphTransactions, setGraphTransactions] = useState<RawTransaction[]>([]);
  const [isGraphLoading, setIsGraphLoading] = useState(false);

  // Fetch graph data when tab changes to network
  useEffect(() => {
    if (activeTab === 'network') {
      fetchGraphData();
    }
  }, [activeTab]);

  const fetchGraphData = async () => {
    setIsGraphLoading(true);
    try {
      const response = await api.get('/api/account/transactions-graph');
      if (response.data?.data?.transactions) {
        setGraphTransactions(response.data.data.transactions);
      }
    } catch (error) {
      console.error('Failed to fetch transaction graph:', error);
    } finally {
      setIsGraphLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    if (activeTab === 'network') {
      await fetchGraphData();
    } else {
      await refresh();
    }
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
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--nav-bg)] backdrop-blur-xl border-b border-[var(--nav-border)]">
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            title="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)] flex-1">Transactions</h1>
          {activeTab === 'transactions' && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'w-10 h-10 rounded-xl flex items-center justify-center transition-colors',
                showFilters
                  ? 'bg-[var(--color-primary-500)] text-white'
                  : 'bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
              title="Toggle filters"
            >
              <Filter size={20} />
            </button>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="px-4 pb-3">
          <div className="flex gap-2 p-1 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)]">
            <button
              onClick={() => setActiveTab('transactions')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                activeTab === 'transactions'
                  ? 'bg-[var(--color-primary-500)] text-white shadow-lg shadow-[var(--color-primary-500)]/20'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              <List size={16} />
              <span>Transactions</span>
            </button>
            <button
              onClick={() => setActiveTab('network')}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all',
                activeTab === 'network'
                  ? 'bg-[var(--color-primary-500)] text-white shadow-lg shadow-[var(--color-primary-500)]/20'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
              )}
            >
              <Network size={16} />
              <span>My Network</span>
            </button>
          </div>
        </div>

        {/* Search - Only show for transactions tab */}
        {activeTab === 'transactions' && (
          <div className="px-4 pb-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
              <input
                type="text"
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--color-primary-500)]/50"
              />
            </div>
          </div>
        )}

        {/* Filters - Only show for transactions tab */}
        {activeTab === 'transactions' && showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-4 space-y-3 border-t border-[var(--border-subtle)] pt-4"
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
                      ? 'bg-[var(--color-primary-500)] text-white'
                      : 'bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
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
                      ? 'bg-[var(--color-accent-500)]/20 text-[var(--color-accent-400)] border border-[var(--color-accent-500)]/30'
                      : 'bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
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
        {activeTab === 'transactions' ? (
          <>
            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-4 text-center">
                <ArrowUpRight className="w-5 h-5 text-[var(--color-error-400)] mx-auto mb-2" />
                <p className="text-xs text-[var(--text-muted)]">Sent</p>
                <p className="text-lg font-semibold text-[var(--text-primary)]">
                  {isLoading ? <Skeleton className="h-6 w-16 mx-auto" /> : formatCurrency(stats.totalSent)}
                </p>
              </Card>
              <Card className="p-4 text-center">
                <ArrowDownLeft className="w-5 h-5 text-[var(--color-success-400)] mx-auto mb-2" />
                <p className="text-xs text-[var(--text-muted)]">Received</p>
                <p className="text-lg font-semibold text-[var(--text-primary)]">
                  {isLoading ? <Skeleton className="h-6 w-16 mx-auto" /> : formatCurrency(stats.totalReceived)}
                </p>
              </Card>
              <Card className="p-4 text-center">
                <Clock className="w-5 h-5 text-[var(--color-warning-400)] mx-auto mb-2" />
                <p className="text-xs text-[var(--text-muted)]">Pending</p>
                <p className="text-lg font-semibold text-[var(--text-primary)]">
                  {isLoading ? <Skeleton className="h-6 w-8 mx-auto" /> : stats.pendingCount}
                </p>
              </Card>
            </div>

            {/* Transaction List */}
            {isLoading ? (
              <Card className="divide-y divide-[var(--border-subtle)]">
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
                <Search className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No transactions found</h3>
                <p className="text-[var(--text-tertiary)]">
                  {searchQuery
                    ? 'Try adjusting your search or filters'
                    : 'Your transactions will appear here'}
                </p>
              </Card>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedTransactions).map(([date, txns]) => (
                  <div key={date}>
                    <h3 className="text-sm font-medium text-[var(--text-tertiary)] mb-3 px-1">{date}</h3>
                    <Card className="divide-y divide-[var(--border-subtle)]">
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
                    className="w-full py-3 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:border-[var(--color-primary-500)]/50 transition-all disabled:opacity-50"
                  >
                    {isLoading ? 'Loading...' : 'Load More Transactions'}
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          /* Network Graph Tab */
          <div className="space-y-4">
            {/* Network Info Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">Transaction Network</h2>
                <p className="text-sm text-[var(--text-tertiary)]">
                  Visualize your transaction connections
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="px-3 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)]">
                  <span className="text-[var(--text-tertiary)]">Transactions: </span>
                  <span className="text-[var(--text-primary)] font-medium">{graphTransactions.length}</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-[var(--card-bg)] border border-[var(--card-border)]">
                  <span className="text-[var(--text-tertiary)]">Contacts: </span>
                  <span className="text-[var(--text-primary)] font-medium">
                    {new Set(graphTransactions.map(t => t.counterpartyVpa)).size}
                  </span>
                </div>
              </div>
            </div>

            {/* Network Graph */}
            <NetworkGraph
              transactions={graphTransactions}
              isLoading={isGraphLoading}
              onRefresh={fetchGraphData}
              currentUserVpa={userVpa || undefined}
            />

            {/* Graph Tips */}
            <Card className="p-4">
              <h4 className="text-sm font-medium text-[var(--text-primary)] mb-2">Tips</h4>
              <ul className="text-xs text-[var(--text-tertiary)] space-y-1">
                <li>• Drag nodes to rearrange the graph</li>
                <li>• Scroll to zoom in/out</li>
                <li>• Click on a node to see details</li>
                <li>• Use controls on the right to zoom and reset</li>
              </ul>
            </Card>
          </div>
        )}

        {/* Refresh Button - Only show for transactions tab */}
        {activeTab === 'transactions' && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="fixed bottom-20 right-4 w-12 h-12 rounded-full bg-[var(--color-primary-500)] text-white shadow-lg flex items-center justify-center hover:bg-[var(--color-primary-600)] transition-colors disabled:opacity-50"
            title="Refresh transactions"
          >
            <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
    </div>
  );
};

export default TransactionsPage;
