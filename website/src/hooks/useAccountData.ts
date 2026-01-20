import { useCallback, useEffect, useRef, useState } from 'react';
import { accountApi, extractError, type LinkedAccountData, type TransactionHistoryItem } from '../services/api';
import { useAccountStore, useTransactionStore, useAuthStore, type LinkedAccount, type Transaction } from '../store';
import { toast } from 'react-hot-toast';

/**
 * Hook to fetch and manage linked bank accounts.
 * Fetches accounts from Gateway → Switch → Bank chain.
 */
export const useLinkedAccounts = () => {
  const linkedAccounts = useAccountStore((state) => state.linkedAccounts);
  const user = useAuthStore((state) => state.user);
  const defaultVpa = useAccountStore((state) => state.defaultVpa);
  const [isLoading, setIsLoading] = useState(false);
  const lastFetchedVpa = useRef<string | null>(null);
  
  // Use either user.vpa or defaultVpa (set during onboarding)
  const currentVpa = user?.vpa || defaultVpa;
  
  const fetchLinkedAccounts = useCallback(async () => {
    const currentUser = useAuthStore.getState().user;
    if (!currentUser) return;
    
    setIsLoading(true);
    try {
      const response = await accountApi.getLinkedAccounts();
      
      if (response.data.statusCode === 200 && response.data.data) {
        const accounts: LinkedAccount[] = response.data.data.accounts.map((acc: LinkedAccountData) => ({
          vpa: acc.vpa,
          bankHandle: acc.bankHandle,
          bankName: acc.bankName,
          maskedAccountNumber: acc.maskedAccountNumber,
          isPrimary: acc.isPrimary,
        }));
        
        // Use getState() to avoid dependency on setters
        const store = useAccountStore.getState();
        store.setLinkedAccounts(accounts);
        
        // Set primary VPA and balance from first account
        const primary = accounts.find(a => a.isPrimary) || accounts[0];
        if (primary) {
          store.setPrimaryVpa(primary.vpa);
          // Get balance from linked account data
          const primaryData = response.data.data.accounts.find((a: LinkedAccountData) => a.vpa === primary.vpa);
          if (primaryData?.balance !== undefined) {
            store.setBalance(primaryData.balance);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch linked accounts:', error);
      toast.error(extractError(error));
    } finally {
      setIsLoading(false);
    }
  }, []); // No dependencies - uses getState() internally

  // Fetch when VPA changes (new user or after onboarding)
  useEffect(() => {
    if (currentVpa && currentVpa !== lastFetchedVpa.current) {
      lastFetchedVpa.current = currentVpa;
      fetchLinkedAccounts();
    }
  }, [currentVpa, fetchLinkedAccounts]);

  return {
    linkedAccounts,
    fetchLinkedAccounts,
    isLoadingAccounts: isLoading,
    hasAccounts: linkedAccounts.length > 0,
  };
};

/**
 * Hook to fetch account balance.
 */
export const useBalance = () => {
  const balance = useAccountStore((state) => state.balance);
  const user = useAuthStore((state) => state.user);
  const defaultVpa = useAccountStore((state) => state.defaultVpa);
  const [isLoading, setIsLoading] = useState(false);
  const lastFetchedVpa = useRef<string | null>(null);

  // Use either user.vpa or defaultVpa (set during onboarding)
  const currentVpa = user?.vpa || defaultVpa;

  const fetchBalance = useCallback(async () => {
    const currentUser = useAuthStore.getState().user;
    const vpa = currentUser?.vpa || useAccountStore.getState().defaultVpa;
    if (!vpa) return;
    
    setIsLoading(true);
    try {
      const response = await accountApi.getBalance();
      
      if (response.data.statusCode === 200 && response.data.data) {
        useAccountStore.getState().setBalance(response.data.data.balance);
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    } finally {
      setIsLoading(false);
    }
  }, []); // No dependencies - uses getState() internally

  // Fetch when VPA changes (new user or after onboarding)
  useEffect(() => {
    if (currentVpa && currentVpa !== lastFetchedVpa.current) {
      lastFetchedVpa.current = currentVpa;
      fetchBalance();
    }
  }, [currentVpa, fetchBalance]);

  return {
    balance,
    fetchBalance,
    isLoadingBalance: isLoading,
    formattedBalance: balance !== null 
      ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(balance)
      : '₹---.--',
  };
};

/**
 * Hook to fetch transaction history.
 */
export const useTransactionHistory = () => {
  const transactions = useTransactionStore((state) => state.transactions);
  const isLoading = useTransactionStore((state) => state.isLoading);
  const hasMore = useTransactionStore((state) => state.hasMore);
  const user = useAuthStore((state) => state.user);
  const defaultVpa = useAccountStore((state) => state.defaultVpa);
  const lastFetchedVpa = useRef<string | null>(null);
  const currentPage = useRef(0);

  // Use either user.vpa or defaultVpa (set during onboarding)
  const currentVpa = user?.vpa || defaultVpa;

  const fetchTransactions = useCallback(async (reset = false) => {
    const currentUser = useAuthStore.getState().user;
    const vpa = currentUser?.vpa || useAccountStore.getState().defaultVpa;
    if (!vpa) return;
    
    const store = useTransactionStore.getState();
    store.setLoading(true);
    
    try {
      const pageToFetch = reset ? 0 : currentPage.current;
      const response = await accountApi.getTransactionHistory(pageToFetch, 20);
      
      if (response.data.statusCode === 200 && response.data.data) {
        const txnData = response.data.data;
        
        // Map API response to Transaction type
        const mappedTxns: Transaction[] = txnData.transactions.map((t: TransactionHistoryItem) => ({
          transactionId: t.transactionId,
          // For DEBIT: user is sender, counterparty is receiver
          // For CREDIT: counterparty is sender, user is receiver
          senderVpa: t.direction === 'DEBIT' ? vpa : t.counterpartyVpa,
          receiverVpa: t.direction === 'DEBIT' ? t.counterpartyVpa : vpa,
          amount: t.amount,
          status: 'SUCCESS' as const, // History only shows completed
          timestamp: t.timestamp,
          riskScore: t.riskScore,
          direction: t.direction as 'CREDIT' | 'DEBIT',  // Store the direction directly
          counterpartyVpa: t.counterpartyVpa,
        }));
        
        if (reset) {
          store.setTransactions(mappedTxns);
          currentPage.current = 1;
        } else {
          store.appendTransactions(mappedTxns);
          currentPage.current += 1;
        }
        
        store.setHasMore(txnData.hasMore);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      toast.error(extractError(error));
    } finally {
      useTransactionStore.getState().setLoading(false);
    }
  }, []); // No dependencies - uses getState() internally

  const loadMore = useCallback(() => {
    const store = useTransactionStore.getState();
    if (!store.isLoading && store.hasMore) {
      fetchTransactions(false);
    }
  }, [fetchTransactions]);

  const refresh = useCallback(() => {
    currentPage.current = 0;
    fetchTransactions(true);
  }, [fetchTransactions]);

  // Fetch when VPA changes (new user or after onboarding)
  useEffect(() => {
    if (currentVpa && currentVpa !== lastFetchedVpa.current) {
      lastFetchedVpa.current = currentVpa;
      currentPage.current = 0;
      fetchTransactions(true);
    }
  }, [currentVpa, fetchTransactions]);

  return {
    transactions,
    isLoading,
    hasMore,
    fetchTransactions: refresh,
    loadMore,
    refresh,
  };
};

/**
 * Combined hook to fetch all account data at once.
 * Useful for dashboard initialization.
 */
export const useAccountData = () => {
  const { linkedAccounts, fetchLinkedAccounts, isLoadingAccounts, hasAccounts } = useLinkedAccounts();
  const { balance, fetchBalance, isLoadingBalance, formattedBalance } = useBalance();
  const { transactions, isLoading: isLoadingTransactions, hasMore, loadMore, refresh } = useTransactionHistory();

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchLinkedAccounts(),
      fetchBalance(),
      refresh(),
    ]);
  }, [fetchLinkedAccounts, fetchBalance, refresh]);

  return {
    linkedAccounts,
    fetchLinkedAccounts,
    isLoadingAccounts,
    hasAccounts,
    balance,
    fetchBalance,
    isLoadingBalance,
    formattedBalance,
    transactions,
    isLoadingTransactions,
    hasMore,
    loadMoreTransactions: loadMore,
    refreshAll,
  };
};
