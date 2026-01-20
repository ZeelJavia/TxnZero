import { motion } from 'framer-motion';
import { cn } from '../../utils';

// ============================================
// LOADING SPINNER
// ============================================

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const Spinner = ({ size = 'md', className }: SpinnerProps) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div
      className={cn(
        'rounded-full border-primary-500/30 border-t-primary-500 animate-spin',
        sizeClasses[size],
        className
      )}
    />
  );
};

// ============================================
// SKELETON LOADER
// ============================================

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
}

export const Skeleton = ({
  className,
  variant = 'text',
  width,
  height,
}: SkeletonProps) => {
  const variants = {
    text: 'rounded-md h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-xl',
  };

  return (
    <div
      className={cn(
        'bg-slate-800 shimmer',
        variants[variant],
        className
      )}
      style={{ width, height }}
    />
  );
};

// ============================================
// PAGE LOADER
// ============================================

export const PageLoader = () => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        {/* Logo Animation */}
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [1, 0.8, 1],
          }}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center"
        >
          <span className="text-2xl font-bold text-white">L0</span>
        </motion.div>

        {/* Loading Text */}
        <div className="flex items-center gap-2">
          <span className="text-slate-400">Loading</span>
          <motion.span
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-slate-400"
          >
            ...
          </motion.span>
        </div>
      </motion.div>
    </div>
  );
};

// ============================================
// TRANSACTION PROCESSING LOADER
// ============================================

interface ProcessingLoaderProps {
  message?: string;
  subMessage?: string;
}

export const ProcessingLoader = ({
  message = 'Processing Payment',
  subMessage = 'Please wait...',
}: ProcessingLoaderProps) => {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Animated Circles */}
      <div className="relative w-24 h-24">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0 border-4 border-transparent border-t-primary-500 rounded-full"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-2 border-4 border-transparent border-t-accent-500 rounded-full"
        />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-4 border-4 border-transparent border-t-success-500 rounded-full"
        />
        
        {/* Center Icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center"
          >
            <span className="text-primary-400 font-bold">₹</span>
          </motion.div>
        </div>
      </div>

      {/* Text */}
      <motion.p
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="mt-6 text-lg font-medium text-white"
      >
        {message}
      </motion.p>
      <p className="mt-2 text-sm text-slate-500">{subMessage}</p>
    </div>
  );
};

// ============================================
// PULSE DOTS LOADER
// ============================================

export const PulseDots = () => {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{
            scale: [1, 1.5, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
          }}
          className="w-2 h-2 bg-primary-500 rounded-full"
        />
      ))}
    </div>
  );
};
