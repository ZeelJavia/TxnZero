import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { router } from './router';
import { ThemeProvider } from './context';
import './index.css';

// ============================================
// QUERY CLIENT CONFIGURATION
// ============================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

// ============================================
// TOAST STYLES (THEME AWARE)
// ============================================

const toastOptions = {
  duration: 3000,
  style: {
    background: 'var(--surface-2)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: '12px',
    backdropFilter: 'blur(12px)',
    padding: '12px 16px',
    fontSize: '14px',
    fontWeight: '500',
  },
  success: {
    iconTheme: {
      primary: 'var(--color-success-500)',
      secondary: 'var(--text-inverse)',
    },
    style: {
      borderColor: 'rgba(16, 185, 129, 0.3)',
    },
  },
  error: {
    iconTheme: {
      primary: 'var(--color-error-500)',
      secondary: 'var(--text-inverse)',
    },
    style: {
      borderColor: 'rgba(244, 63, 94, 0.3)',
    },
  },
};

// ============================================
// APP COMPONENT
// ============================================

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster position="top-right" toastOptions={toastOptions} />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
