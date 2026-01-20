import { motion } from 'framer-motion';
import { cn } from '../../utils';

// ============================================
// CARD COMPONENT
// ============================================

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'glass' | 'gradient';
  hoverable?: boolean;
  onClick?: () => void;
}

export const Card = ({
  children,
  className,
  variant = 'default',
  hoverable = false,
  onClick,
}: CardProps) => {
  const variants = {
    default: 'bg-[var(--card-bg)] border border-[var(--card-border)] shadow-[var(--shadow-sm)]',
    glass: 'glass',
    gradient: 'gradient-border',
  };

  return (
    <motion.div
      whileHover={hoverable ? { y: -4, scale: 1.01 } : undefined}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      onClick={onClick}
      className={cn(
        'rounded-2xl p-6',
        variants[variant],
        hoverable && 'cursor-pointer transition-shadow hover:shadow-[var(--shadow-lg)]',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </motion.div>
  );
};

// ============================================
// STAT CARD COMPONENT
// ============================================

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export const StatCard = ({
  title,
  value,
  subtitle,
  icon,
  trend,
  className,
}: StatCardProps) => {
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[var(--color-primary-500)]/10 to-[var(--color-accent-500)]/10 blur-3xl" />
      
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-sm text-[var(--text-muted)] mb-1">{title}</p>
          <h3 className="text-2xl font-bold text-[var(--text-primary)]">{value}</h3>
          {subtitle && (
            <p className="text-sm text-[var(--text-muted)] mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className={cn(
              'inline-flex items-center gap-1 mt-2 text-sm font-medium',
              trend.isPositive ? 'text-[var(--color-success-500)]' : 'text-[var(--color-error-500)]'
            )}>
              <span>{trend.isPositive ? '↑' : '↓'}</span>
              <span>{Math.abs(trend.value)}%</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="p-3 bg-gradient-to-br from-[var(--color-primary-500)]/20 to-[var(--color-accent-500)]/20 rounded-xl">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

// ============================================
// TRANSACTION CARD COMPONENT
// ============================================

import type { Transaction, TransactionStatus } from '../../types';

interface TransactionCardProps {
  transaction: Transaction;
  currentUserVpa: string;
  onClick?: () => void;
}

export const TransactionCard = ({
  transaction,
  currentUserVpa,
  onClick,
}: TransactionCardProps) => {
  // Use direction field if available, otherwise fall back to comparing VPAs
  const isSent = transaction.direction 
    ? transaction.direction === 'DEBIT' 
    : transaction.senderVpa === currentUserVpa;
  
  // Use counterpartyVpa if available, otherwise derive from sender/receiver
  const counterparty = transaction.counterpartyVpa || (isSent ? transaction.receiverVpa : transaction.senderVpa);
  const name = isSent 
    ? (transaction.receiverName || counterparty) 
    : (transaction.senderName || counterparty);
  const vpa = counterparty;
  const amount = transaction.amount;
  const status = transaction.status;
  const date = new Date(transaction.timestamp).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

  const statusColors: Record<TransactionStatus, string> = {
    SUCCESS: 'text-[var(--color-success-500)]',
    FAILED: 'text-[var(--color-error-500)]',
    PENDING: 'text-[var(--color-warning-500)]',
    BLOCKED_FRAUD: 'text-[var(--color-error-500)]',
    DEEMED_APPROVED: 'text-[var(--color-success-500)]',
    REVERSED: 'text-[var(--color-warning-500)]',
  };

  return (
    <motion.div
      whileHover={{ x: 4 }}
      onClick={onClick}
      className={cn(
        'flex items-center justify-between p-4 rounded-xl',
        'bg-[var(--surface-glass)] hover:bg-[var(--bg-hover)] border border-[var(--border-subtle)]',
        'transition-colors cursor-pointer'
      )}
    >
      <div className="flex items-center gap-4">
        {/* Avatar */}
        <div className={cn(
          'w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold',
          isSent 
            ? 'bg-[var(--color-error-500)]/20 text-[var(--color-error-500)]' 
            : 'bg-[var(--color-success-500)]/20 text-[var(--color-success-500)]'
        )}>
          {name[0]?.toUpperCase() || '?'}
        </div>
        
        {/* Details */}
        <div>
          <p className="font-medium text-[var(--text-primary)]">{name}</p>
          <p className="text-sm text-[var(--text-muted)]">{vpa}</p>
        </div>
      </div>

      {/* Amount & Status */}
      <div className="text-right">
        <p className={cn(
          'font-bold text-lg',
          isSent ? 'text-[var(--color-error-500)]' : 'text-[var(--color-success-500)]'
        )}>
          {isSent ? '-' : '+'}₹{amount.toLocaleString('en-IN')}
        </p>
        <p className={cn('text-xs', statusColors[status])}>{status}</p>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">{date}</p>
      </div>
    </motion.div>
  );
};

// ============================================
// BANK CARD COMPONENT
// ============================================

interface BankCardProps {
  bankName: string;
  accountNumber: string;
  vpa: string;
  isPrimary?: boolean;
  onClick?: () => void;
}

export const BankCard = ({
  bankName,
  accountNumber,
  vpa,
  isPrimary = false,
  onClick,
}: BankCardProps) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'relative p-5 rounded-2xl cursor-pointer overflow-hidden',
        'bg-gradient-to-br from-[var(--color-primary-600)] to-[var(--color-primary-500)]',
        'border border-[var(--color-primary-400)]/30',
        isPrimary && 'ring-2 ring-[var(--color-accent-500)]/50'
      )}
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-4 right-4 w-24 h-24 border-2 border-white rounded-full" />
        <div className="absolute top-8 right-8 w-16 h-16 border-2 border-white rounded-full" />
      </div>

      {/* Primary Badge */}
      {isPrimary && (
        <div className="absolute top-3 right-3 px-2 py-0.5 bg-white/20 text-white text-xs font-medium rounded-full">
          Primary
        </div>
      )}

      {/* Content */}
      <div className="relative">
        <p className="text-xs text-white/70 uppercase tracking-wider">{bankName}</p>
        <p className="text-lg font-mono text-white mt-2">{accountNumber}</p>
        <p className="text-sm text-white/80 mt-3">{vpa}</p>
      </div>
    </motion.div>
  );
};

// ============================================
// QUICK ACTION CARD
// ============================================

interface QuickActionProps {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  onClick: () => void;
  color?: 'primary' | 'accent' | 'success' | 'warning';
}

export const QuickAction = ({
  icon,
  label,
  sublabel,
  onClick,
  color = 'primary',
}: QuickActionProps) => {
  const colors = {
    primary: 'from-[var(--color-primary-500)]/20 to-[var(--color-primary-600)]/20 text-[var(--color-primary-500)]',
    accent: 'from-[var(--color-accent-500)]/20 to-[var(--color-accent-600)]/20 text-[var(--color-accent-500)]',
    success: 'from-[var(--color-success-500)]/20 to-[var(--color-success-600)]/20 text-[var(--color-success-500)]',
    warning: 'from-[var(--color-warning-500)]/20 to-[var(--color-warning-600)]/20 text-[var(--color-warning-500)]',
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className="flex flex-col items-center gap-2 p-4"
    >
      <div className={cn(
        'w-14 h-14 rounded-2xl flex items-center justify-center',
        'bg-gradient-to-br',
        colors[color]
      )}>
        {icon}
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        {sublabel && (
          <p className="text-xs text-[var(--text-muted)]">{sublabel}</p>
        )}
      </div>
    </motion.button>
  );
};
