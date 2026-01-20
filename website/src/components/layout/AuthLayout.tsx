import { motion } from 'framer-motion';
import { Shield, Lock } from 'lucide-react';

// ============================================
// AUTH LAYOUT
// ============================================

interface AuthLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export const AuthLayout = ({ children, title, subtitle }: AuthLayoutProps) => {
  return (
    <div className="min-h-screen mesh-gradient flex flex-col">
      {/* Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            x: [0, 100, 0],
            y: [0, -50, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            x: [0, -100, 0],
            y: [0, 50, 0],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl"
        />
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-6">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 text-center"
        >
          <div className="inline-flex items-center gap-3 mb-4">
            <motion.div
              whileHover={{ rotate: 10 }}
              className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25"
            >
              <span className="text-2xl font-bold text-white">L0</span>
            </motion.div>
          </div>
          <h1 className="text-3xl font-bold gradient-text">LedgerZero</h1>
          <p className="text-slate-500 mt-1">Secure UPI Payments</p>
        </motion.div>

        {/* Title */}
        {title && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-center mb-8"
          >
            <h2 className="text-2xl font-semibold text-white">{title}</h2>
            {subtitle && (
              <p className="text-slate-400 mt-2">{subtitle}</p>
            )}
          </motion.div>
        )}

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-md"
        >
          <div className="glass rounded-3xl p-8 shadow-2xl shadow-black/20">
            {children}
          </div>
        </motion.div>

        {/* Trust Badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 flex items-center gap-6 text-slate-500"
        >
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-success-500" />
            <span className="text-xs">Bank-grade Security</span>
          </div>
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-primary-500" />
            <span className="text-xs">End-to-End Encrypted</span>
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="relative py-4 text-center text-xs text-slate-600">
        <p>© 2026 LedgerZero. All rights reserved.</p>
      </footer>
    </div>
  );
};
