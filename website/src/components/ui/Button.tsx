import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils';

// ============================================
// BUTTON COMPONENT
// ============================================

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-gradient-to-r from-[var(--color-primary-500)] to-[var(--color-accent-500)]
    hover:from-[var(--color-primary-400)] hover:to-[var(--color-accent-400)]
    text-white shadow-lg shadow-[var(--color-primary-500)]/25
    hover:shadow-[var(--color-primary-500)]/40
    active:scale-[0.98]
  `,
  secondary: `
    bg-[var(--button-secondary-bg)] 
    hover:bg-[var(--bg-hover)]
    text-[var(--text-primary)] 
    border border-[var(--button-secondary-border)]
    hover:border-[var(--border-strong)]
  `,
  ghost: `
    bg-transparent 
    hover:bg-[var(--interactive-hover)]
    text-[var(--text-secondary)] 
    hover:text-[var(--text-primary)]
  `,
  outline: `
    bg-transparent
    text-[var(--color-primary-500)]
    border border-[var(--color-primary-500)]
    hover:bg-[var(--color-primary-500)]/10
  `,
  danger: `
    bg-gradient-to-r from-[var(--color-error-500)] to-[var(--color-error-600)]
    hover:from-[var(--color-error-400)] hover:to-[var(--color-error-500)]
    text-white shadow-lg shadow-[var(--color-error-500)]/25
  `,
  success: `
    bg-gradient-to-r from-[var(--color-success-500)] to-[var(--color-success-600)]
    hover:from-[var(--color-success-400)] hover:to-[var(--color-success-500)]
    text-white shadow-lg shadow-[var(--color-success-500)]/25
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-base rounded-xl gap-2',
  xl: 'px-8 py-4 text-lg rounded-2xl gap-3',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      onClick,
      type = 'button',
    },
    ref
  ) => {
    return (
      <motion.button
        ref={ref}
        whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
        whileHover={{ scale: disabled || isLoading ? 1 : 1.01 }}
        disabled={disabled || isLoading}
        onClick={onClick}
        type={type}
        className={cn(
          'relative inline-flex items-center justify-center font-semibold',
          'transition-all duration-200 ease-out touch-target',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-500)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-primary)]',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className
        )}
      >
        {isLoading && (
          <Loader2 className="absolute left-1/2 -translate-x-1/2 w-5 h-5 animate-spin" />
        )}
        <span
          className={cn(
            'inline-flex items-center',
            sizeStyles[size].includes('gap-') ? '' : 'gap-2',
            isLoading && 'opacity-0'
          )}
        >
          {leftIcon}
          {children}
          {rightIcon}
        </span>
      </motion.button>
    );
  }
);

Button.displayName = 'Button';
