import { forwardRef, type InputHTMLAttributes, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '../../utils';

// ============================================
// INPUT COMPONENT
// ============================================

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, leftIcon, rightIcon, type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            type={isPassword && showPassword ? 'text' : type}
            className={cn(
              'w-full bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl',
              'px-4 py-3 text-[var(--text-primary)] placeholder-[var(--text-muted)]',
              'focus:outline-none focus:border-[var(--input-border-focus)] focus:ring-2 focus:ring-[var(--color-primary-500)]/20',
              'hover:border-[var(--input-border-hover)]',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              Boolean(leftIcon) && 'pl-12',
              Boolean(rightIcon || isPassword) && 'pr-12',
              error && 'border-[var(--color-error-500)] focus:border-[var(--color-error-500)] focus:ring-[var(--color-error-500)]/20',
              className
            )}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors touch-target"
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          )}
          {rightIcon && !isPassword && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-2 text-sm text-[var(--color-error-400)]">{error}</p>
        )}
        {hint && !error && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">{hint}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

// ============================================
// OTP INPUT COMPONENT
// ============================================

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}

export const OtpInput = ({
  length = 6,
  value,
  onChange,
  error,
  disabled = false,
}: OtpInputProps) => {
  const handleChange = (index: number, digit: string) => {
    if (!/^\d*$/.test(digit)) return;
    
    const newValue = value.split('');
    newValue[index] = digit;
    const joined = newValue.join('').slice(0, length);
    onChange(joined);

    // Auto-focus next input
    if (digit && index < length - 1) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      prevInput?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted);
  };

  return (
    <div>
      <div className="flex gap-2 sm:gap-3 justify-center">
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            id={`otp-${index}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value[index] || ''}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            disabled={disabled}
            className={cn(
              'w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold',
              'bg-[var(--input-bg)] border border-[var(--input-border)] rounded-xl',
              'text-[var(--text-primary)] placeholder-[var(--text-muted)]',
              'focus:outline-none focus:border-[var(--color-primary-500)] focus:ring-2 focus:ring-[var(--color-primary-500)]/20',
              'hover:border-[var(--input-border-hover)]',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error && 'border-[var(--color-error-500)]'
            )}
          />
        ))}
      </div>
      {error && (
        <p className="mt-3 text-sm text-[var(--color-error-400)] text-center">{error}</p>
      )}
    </div>
  );
};

// ============================================
// MPIN INPUT COMPONENT
// ============================================

interface MpinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  label?: string;
}

export const MpinInput = ({
  length = 4,
  value,
  onChange,
  error,
  disabled = false,
  label = 'Enter MPIN',
}: MpinInputProps) => {
  const handleChange = (index: number, digit: string) => {
    if (!/^\d*$/.test(digit)) return;

    const newValue = value.split('');
    newValue[index] = digit;
    const joined = newValue.join('').slice(0, length);
    onChange(joined);

    // Auto-focus next input
    if (digit && index < length - 1) {
      const nextInput = document.getElementById(`mpin-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      const prevInput = document.getElementById(`mpin-${index - 1}`);
      prevInput?.focus();
    }
  };

  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-3 text-center">
          {label}
        </label>
      )}
      <div className="flex gap-3 sm:gap-4 justify-center">
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            id={`mpin-${index}`}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={value[index] || ''}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            disabled={disabled}
            className={cn(
              'w-12 h-14 sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-bold',
              'bg-[var(--input-bg)] border-2 border-[var(--input-border)] rounded-2xl',
              'text-[var(--text-primary)]',
              'focus:outline-none focus:border-[var(--color-primary-500)] focus:ring-4 focus:ring-[var(--color-primary-500)]/20',
              'hover:border-[var(--input-border-hover)]',
              'transition-all duration-200',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error && 'border-[var(--color-error-500)] focus:border-[var(--color-error-500)]'
            )}
          />
        ))}
      </div>
      {error && (
        <p className="mt-3 text-sm text-[var(--color-error-400)] text-center">{error}</p>
      )}
    </div>
  );
};
