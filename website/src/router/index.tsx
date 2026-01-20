import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from '../components/layout';
import {
  AuthPage,
  OnboardingPage,
  DashboardPage,
  SendMoneyPage,
  TransactionsPage,
  ProfilePage,
  QRCodePage,
} from '../pages';

// ============================================
// PROTECTED ROUTE COMPONENT
// ============================================

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const isAuthenticated = localStorage.getItem('auth-storage');
  
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  // Parse and check auth state
  try {
    const authData = JSON.parse(isAuthenticated);
    if (!authData.state?.isAuthenticated) {
      return <Navigate to="/auth" replace />;
    }
  } catch {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

// ============================================
// PUBLIC ROUTE COMPONENT
// ============================================

interface PublicRouteProps {
  children: React.ReactNode;
}

const PublicRoute = ({ children }: PublicRouteProps) => {
  const isAuthenticated = localStorage.getItem('auth-storage');
  
  if (isAuthenticated) {
    try {
      const authData = JSON.parse(isAuthenticated);
      if (authData.state?.isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
      }
    } catch {
      // Invalid data, continue to public route
    }
  }

  return <>{children}</>;
};

// ============================================
// ROUTER CONFIGURATION
// ============================================

export const router = createBrowserRouter([
  // Public Routes
  {
    path: '/auth',
    element: (
      <PublicRoute>
        <AuthPage />
      </PublicRoute>
    ),
  },

  // Onboarding (requires auth but not full setup)
  {
    path: '/onboarding',
    element: (
      <ProtectedRoute>
        <OnboardingPage />
      </ProtectedRoute>
    ),
  },

  // Protected Routes with Layout
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <Layout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'transactions',
        element: <TransactionsPage />,
      },
      {
        path: 'profile',
        element: <ProfilePage />,
      },
    ],
  },

  // Full-page protected routes (without layout)
  {
    path: '/send',
    element: (
      <ProtectedRoute>
        <SendMoneyPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/qr',
    element: (
      <ProtectedRoute>
        <QRCodePage />
      </ProtectedRoute>
    ),
  },

  // Catch-all redirect
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
]);

export default router;
