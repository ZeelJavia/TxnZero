import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  History,
  QrCode,
  User,
  Bell,
  Settings,
  LogOut,
  Menu,
  X,
  Wallet,
  Shield,
  Sun,
  Moon,
  ChevronDown,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { cn } from '../../utils';
import { useAuthStore } from '../../store';
import { useTheme } from '../../context';

// ============================================
// THEME TOGGLE COMPONENT
// ============================================

const ThemeToggle = () => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover)] transition-colors touch-target"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isDark ? (
          <motion.div
            key="moon"
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: 90, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Moon size={20} />
          </motion.div>
        ) : (
          <motion.div
            key="sun"
            initial={{ rotate: 90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            exit={{ rotate: -90, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <Sun size={20} />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
};

// ============================================
// MAIN LAYOUT
// ============================================

export const Layout = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  
  // WebSocket is now initialized in ProtectedRoute to stay connected across all pages

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    clearAuth();
    navigate('/auth');
  };

  const showComingSoon = () => {
    toast('Coming Soon!', {
      icon: '🚀',
      style: {
        background: 'var(--card-bg)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-subtle)',
      },
    });
  };

  const navItems = [
    { icon: Home, label: 'Home', path: '/dashboard' },
    { icon: History, label: 'History', path: '/transactions' },
    { icon: QrCode, label: 'Scan & Pay', path: '/scan' },
    { icon: Wallet, label: 'Bank', path: '/bank' },
    { icon: User, label: 'Profile', path: '/profile' },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Background Gradient Effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[80%] rounded-full bg-[var(--color-primary-500)]/5 blur-3xl" />
        <div className="absolute -bottom-[40%] -left-[20%] w-[80%] h-[80%] rounded-full bg-[var(--color-accent-500)]/5 blur-3xl" />
      </div>

      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 z-40">
        <div className="bg-[var(--nav-bg)] backdrop-blur-xl border-b border-[var(--nav-border)]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <Link to="/dashboard" className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--color-primary-500)] to-[var(--color-accent-500)] flex items-center justify-center shadow-lg shadow-[var(--color-primary-500)]/20">
                  <span className="text-lg font-bold text-white">L0</span>
                </div>
                <span className="text-xl font-bold gradient-text hidden sm:block">
                  LedgerZero
                </span>
              </Link>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200',
                      location.pathname === item.path
                        ? 'bg-gradient-to-r from-[var(--color-primary-500)]/15 to-[var(--color-accent-500)]/10 text-[var(--color-primary-500)] shadow-sm'
                        : 'text-[var(--text-tertiary)] hover:text-[var(--color-primary-500)] hover:bg-[var(--interactive-hover)]'
                    )}
                  >
                    <item.icon size={18} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                ))}
              </nav>

              {/* Right Section */}
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Theme Toggle */}
                <ThemeToggle />

                {/* Notifications */}
                <button 
                  onClick={showComingSoon}
                  className="relative p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover)] transition-colors touch-target"
                >
                  <Bell size={20} />
                  <span className="absolute top-1 right-1 w-2 h-2 bg-[var(--color-error-500)] rounded-full" />
                </button>

                {/* User Menu (Desktop) */}
                <div className="hidden md:block relative" ref={userMenuRef}>
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[var(--interactive-hover)] transition-colors"
                  >
                    <div className="text-right">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{user?.fullName || 'User'}</p>
                      <p className="text-xs text-[var(--text-muted)]">{user?.vpa || 'No VPA'}</p>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-primary-500)] to-[var(--color-accent-500)] flex items-center justify-center text-white font-bold shadow-lg shadow-[var(--color-primary-500)]/20">
                      {user?.fullName?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <ChevronDown size={16} className={cn(
                      "text-[var(--text-muted)] transition-transform",
                      isUserMenuOpen && "rotate-180"
                    )} />
                  </button>
                  
                  {/* Desktop User Dropdown */}
                  <AnimatePresence>
                    {isUserMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 mt-2 w-56 rounded-xl bg-[var(--card-bg)] border border-[var(--card-border)] shadow-2xl overflow-hidden"
                      >
                        <div className="p-2">
                          <Link
                            to="/profile"
                            onClick={() => setIsUserMenuOpen(false)}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover)] transition-colors"
                          >
                            <User size={18} />
                            <span className="text-sm font-medium">Profile</span>
                          </Link>
                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              showComingSoon();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover)] transition-colors"
                          >
                            <Settings size={18} />
                            <span className="text-sm font-medium">Settings</span>
                          </button>
                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              showComingSoon();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover)] transition-colors"
                          >
                            <Shield size={18} />
                            <span className="text-sm font-medium">Security</span>
                          </button>
                        </div>
                        <div className="border-t border-[var(--border-subtle)]">
                          <button
                            onClick={() => {
                              setIsUserMenuOpen(false);
                              handleLogout();
                            }}
                            className="w-full flex items-center gap-3 px-5 py-3 text-[var(--color-error-400)] hover:bg-[var(--color-error-500)]/10 transition-colors"
                          >
                            <LogOut size={18} />
                            <span className="text-sm font-medium">Logout</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Mobile Menu Button */}
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="md:hidden p-2 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover)] transition-colors touch-target"
                >
                  {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-16 left-0 right-0 z-30 bg-[var(--nav-bg)] backdrop-blur-xl border-b border-[var(--nav-border)] md:hidden"
          >
            <nav className="p-4 space-y-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200',
                    location.pathname === item.path
                      ? 'bg-[var(--color-primary-500)]/15 text-[var(--color-primary-400)]'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover)]'
                  )}
                >
                  <item.icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </Link>
              ))}
              <hr className="border-[var(--border-subtle)] my-2" />
              <Link
                to="/settings"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--interactive-hover)] transition-colors"
              >
                <Settings size={20} />
                <span className="font-medium">Settings</span>
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[var(--color-error-400)] hover:bg-[var(--color-error-500)]/10 transition-colors"
              >
                <LogOut size={20} />
                <span className="font-medium">Logout</span>
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="relative pt-20 pb-24 md:pb-8 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden safe-bottom">
        <div className="bg-[var(--nav-bg)] backdrop-blur-xl border-t border-[var(--nav-border)] px-2 py-2 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)]">
          <div className="flex items-center justify-around">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-200 touch-target',
                  location.pathname === item.path
                    ? 'text-[var(--color-primary-500)] bg-[var(--color-primary-500)]/10'
                    : 'text-[var(--text-muted)] hover:text-[var(--color-primary-500)]'
                )}
              >
                <item.icon size={22} />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Security Badge */}
      <div className="fixed bottom-24 md:bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 glass rounded-full text-xs text-[var(--text-tertiary)]">
        <Shield size={14} className="text-[var(--color-success-400)]" />
        <span>256-bit Encrypted</span>
      </div>
    </div>
  );
};
