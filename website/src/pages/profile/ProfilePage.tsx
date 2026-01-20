import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  User,
  Phone,
  Mail,
  CreditCard,
  Shield,
  LogOut,
  ChevronRight,
  Moon,
  Bell,
  Lock,
  HelpCircle,
  FileText,
  Settings,
  Smartphone,
  Building2,
  Copy,
  CheckCircle2,
  Edit,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, Button, ConfirmDialog } from '../../components/ui';
import { useAuthStore, useAccountStore } from '../../store';
import { authApi } from '../../services/api';
import { cn } from '../../utils';

// ============================================
// PROFILE PAGE
// ============================================

export const ProfilePage = () => {
  const navigate = useNavigate();
  const { user, setUser, setAuthenticated, clearAuth } = useAuthStore();
  const { defaultVpa, linkedAccounts } = useAccountStore();

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [copiedVpa, setCopiedVpa] = useState(false);

  // Copy VPA to clipboard
  const handleCopyVpa = () => {
    if (defaultVpa) {
      navigator.clipboard.writeText(defaultVpa);
      setCopiedVpa(true);
      toast.success('UPI ID copied!');
      setTimeout(() => setCopiedVpa(false), 2000);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await authApi.logout();
    } catch (error) {
      // Logout even if API fails
    } finally {
      clearAuth();
      navigate('/auth', { replace: true });
    }
  };

  const menuSections = [
    {
      title: 'Account',
      items: [
        {
          icon: CreditCard,
          label: 'Linked Banks',
          value: `${linkedAccounts?.length || 0} accounts`,
          onClick: () => navigate('/link-bank'),
        },
        {
          icon: Shield,
          label: 'Security',
          value: 'PIN, Password',
          onClick: () => navigate('/settings/security'),
        },
        {
          icon: Smartphone,
          label: 'Devices',
          value: 'Manage devices',
          onClick: () => navigate('/settings/devices'),
        },
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          icon: Bell,
          label: 'Notifications',
          value: 'Enabled',
          onClick: () => navigate('/settings/notifications'),
        },
        {
          icon: Moon,
          label: 'Appearance',
          value: 'Dark mode',
          onClick: () => {},
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          icon: HelpCircle,
          label: 'Help & Support',
          onClick: () => {},
        },
        {
          icon: FileText,
          label: 'Terms & Conditions',
          onClick: () => {},
        },
        {
          icon: Lock,
          label: 'Privacy Policy',
          onClick: () => {},
        },
      ],
    },
  ];

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
          <h1 className="text-lg font-semibold text-white">Profile</h1>
        </div>
      </header>

      {/* Content */}
      <div className="p-4 space-y-6 max-w-lg mx-auto pb-24">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="overflow-hidden">
            {/* Background */}
            <div className="h-20 bg-gradient-to-r from-primary-500/30 to-accent-500/30" />

            {/* Avatar & Info */}
            <div className="px-6 pb-6 -mt-10">
              <div className="flex items-end gap-4">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-2xl font-bold ring-4 ring-slate-900">
                  {user?.fullName?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div className="flex-1 pb-1">
                  <h2 className="text-xl font-bold text-white">{user?.fullName || 'User'}</h2>
                  <p className="text-sm text-slate-400 flex items-center gap-1">
                    <Phone size={14} />
                    +91 {user?.phoneNumber || '••••••••••'}
                  </p>
                </div>
                <button
                  className="p-2 rounded-lg bg-slate-800/50 text-slate-400 hover:text-white transition-colors"
                >
                  <Edit size={18} />
                </button>
              </div>

              {/* UPI ID */}
              <div className="mt-6 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Your UPI ID</p>
                    <p className="text-white font-medium">{defaultVpa || 'Not set up'}</p>
                  </div>
                  {defaultVpa && (
                    <button
                      onClick={handleCopyVpa}
                      className={cn(
                        'p-2 rounded-lg transition-all',
                        copiedVpa
                          ? 'bg-success-500/20 text-success-400'
                          : 'bg-slate-700/50 text-slate-400 hover:text-white'
                      )}
                    >
                      {copiedVpa ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Menu Sections */}
        {menuSections.map((section, sectionIdx) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + sectionIdx * 0.05 }}
          >
            <h3 className="text-sm font-medium text-slate-400 mb-3 px-1">
              {section.title}
            </h3>
            <Card className="divide-y divide-slate-800/50">
              {section.items.map((item) => (
                <button
                  key={item.label}
                  onClick={item.onClick}
                  className="w-full p-4 flex items-center gap-4 hover:bg-slate-800/30 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center text-slate-400">
                    <item.icon size={20} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-white font-medium">{item.label}</p>
                    {item.value && (
                      <p className="text-sm text-slate-500">{item.value}</p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-500" />
                </button>
              ))}
            </Card>
          </motion.div>
        ))}

        {/* Logout Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full p-4 rounded-2xl bg-danger-500/10 border border-danger-500/20 flex items-center justify-center gap-3 text-danger-400 hover:bg-danger-500/20 transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </motion.div>

        {/* App Version */}
        <p className="text-center text-xs text-slate-600">
          LedgerZero v1.0.0
        </p>
      </div>

      {/* Logout Confirmation */}
      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Logout"
        message="Are you sure you want to logout? You'll need to login again to access your account."
        confirmText="Logout"
        confirmVariant="danger"
        isLoading={isLoggingOut}
      />
    </div>
  );
};

export default ProfilePage;
