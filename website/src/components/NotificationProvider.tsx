import { usePaymentNotifications } from '../hooks/usePaymentNotifications';

/**
 * Provider component that initializes WebSocket connection for real-time notifications.
 * Should be placed inside the router context to access auth state.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  // Initialize WebSocket connection for payment notifications
  // This hook handles connecting/disconnecting based on auth state
  usePaymentNotifications();

  return <>{children}</>;
}
