import { useEffect, useRef, useCallback, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, X, AlertCircle, RotateCcw } from 'lucide-react';
import { useAuthStore, useAccountStore } from '../store';

// WebSocket URL - use relative path to go through Vite proxy (handles HTTP/HTTPS)
const getWsUrl = () => {
  // Use relative path so Vite proxy handles the connection
  // This works for both HTTP and HTTPS since the proxy handles it
  return `${window.location.origin}/ws/notifications`;
};

export interface PaymentNotificationEvent {
  eventType: 'PAYMENT_RECEIVED' | 'PAYMENT_SENT' | 'PAYMENT_FAILED' | 'PAYMENT_REVERSED';
  transactionId: string;
  receiverVpa: string;
  senderVpa?: string;
  senderName?: string;
  amount?: number;
  newBalance?: number;
  timestamp: string;
  message: string;
}

// Custom notification component matching app UI
interface NotificationToastProps {
  t: { id: string; visible: boolean };
  type: 'received' | 'sent' | 'failed' | 'reversed';
  amount?: number;
  from?: string;
  message: string;
}

const NotificationToast = ({ t, type, amount, from, message }: NotificationToastProps) => {
  const config = {
    received: {
      icon: ArrowDownLeft,
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400',
      title: 'Payment Received',
      amountColor: 'text-emerald-400',
      amountPrefix: '+',
    },
    sent: {
      icon: ArrowUpRight,
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-400',
      title: 'Payment Sent',
      amountColor: 'text-blue-400',
      amountPrefix: '-',
    },
    failed: {
      icon: AlertCircle,
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-400',
      title: 'Payment Failed',
      amountColor: 'text-red-400',
      amountPrefix: '',
    },
    reversed: {
      icon: RotateCcw,
      iconBg: 'bg-amber-500/20',
      iconColor: 'text-amber-400',
      title: 'Payment Reversed',
      amountColor: 'text-amber-400',
      amountPrefix: '',
    },
  };

  const { icon: Icon, iconBg, iconColor, title, amountColor, amountPrefix } = config[type];

  return (
    <AnimatePresence>
      {t.visible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="max-w-sm w-full bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="p-4">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-6 h-6 ${iconColor}`} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
                  {title}
                </p>
                {amount !== undefined && (
                  <p className={`text-xl font-bold ${amountColor} mt-0.5`}>
                    {amountPrefix}₹{amount.toLocaleString('en-IN')}
                  </p>
                )}
                <p className="text-sm text-[var(--text-secondary)] mt-1 truncate">
                  {from ? `from ${from}` : message}
                </p>
              </div>

              {/* Close button */}
              <button
                onClick={() => toast.dismiss(t.id)}
                className="p-1.5 rounded-lg hover:bg-[var(--interactive-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Bottom accent line */}
          <div className={`h-1 ${type === 'received' ? 'bg-emerald-500' : type === 'sent' ? 'bg-blue-500' : type === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Hook for real-time payment notifications via WebSocket.
 * Connects when user is authenticated and has a VPA.
 * Automatically reconnects on disconnect.
 */
export function usePaymentNotifications() {
  const clientRef = useRef<Client | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptionRef = useRef<any>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectingRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const { user, isAuthenticated } = useAuthStore();
  const { setBalance, primaryVpa } = useAccountStore();
  
  // Try to get VPA from user object first, then fall back to primaryVpa from account store
  const vpa = user?.vpa || primaryVpa;
  
  // Store setBalance in a ref so it doesn't cause reconnection
  const setBalanceRef = useRef(setBalance);
  setBalanceRef.current = setBalance;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNotification = useCallback((message: any) => {
    try {
      const event: PaymentNotificationEvent = JSON.parse(message.body);
      console.log('📬 Received payment notification:', event);

      // Show custom toast based on event type
      switch (event.eventType) {
        case 'PAYMENT_RECEIVED':
          toast.custom(
            (t) => (
              <NotificationToast
                t={t}
                type="received"
                amount={event.amount}
                from={event.senderVpa}
                message={event.message}
              />
            ),
            { duration: 5000 }
          );
          // Update balance only if we have a valid number
          if (typeof event.newBalance === 'number' && !isNaN(event.newBalance)) {
            setBalanceRef.current(event.newBalance);
          }
          // Trigger dashboard refresh for updated data
          window.dispatchEvent(new CustomEvent('refresh-dashboard'));
          break;

        case 'PAYMENT_SENT':
          toast.custom(
            (t) => (
              <NotificationToast
                t={t}
                type="sent"
                amount={event.amount}
                message={event.message}
              />
            ),
            { duration: 4000 }
          );
          if (typeof event.newBalance === 'number' && !isNaN(event.newBalance)) {
            setBalanceRef.current(event.newBalance);
          }
          // Trigger dashboard refresh for updated data
          window.dispatchEvent(new CustomEvent('refresh-dashboard'));
          break;

        case 'PAYMENT_FAILED':
          toast.custom(
            (t) => (
              <NotificationToast
                t={t}
                type="failed"
                message={event.message}
              />
            ),
            { duration: 5000 }
          );
          break;

        case 'PAYMENT_REVERSED':
          toast.custom(
            (t) => (
              <NotificationToast
                t={t}
                type="reversed"
                amount={event.amount}
                message={event.message}
              />
            ),
            { duration: 5000 }
          );
          // Trigger dashboard refresh for updated data
          window.dispatchEvent(new CustomEvent('refresh-dashboard'));
          break;
      }

      // Dispatch custom event for components that want to handle notifications
      window.dispatchEvent(new CustomEvent('payment-notification', { detail: event }));

    } catch (error) {
      console.error('Failed to parse notification:', error);
    }
  }, []); // No dependencies - uses ref for setBalance

  // Connect when authenticated with VPA
  useEffect(() => {
    // Early exit if not ready to connect
    if (!isAuthenticated || !vpa) {
      console.log('⏸️ WebSocket: Not connecting - no VPA or not authenticated', { isAuthenticated, vpa });
      return;
    }

    // Prevent double connection
    if (isConnectingRef.current || clientRef.current?.connected) {
      console.log('⚡ WebSocket: Already connected or connecting');
      return;
    }

    isConnectingRef.current = true;
    console.log('🔌 WebSocket: Connecting...');

    const wsUrl = getWsUrl();
    console.log('🔌 WebSocket URL:', wsUrl);

    const client = new Client({
      webSocketFactory: () => new SockJS(wsUrl),
      
      // Longer delays to avoid spamming when backend is down
      reconnectDelay: 10000,  // 10 seconds between reconnect attempts
      heartbeatIncoming: 20000,
      heartbeatOutgoing: 20000,
      connectionTimeout: 10000,  // 10 second connection timeout

      onConnect: () => {
        console.log('✅ WebSocket: Connected successfully');
        isConnectingRef.current = false;
        setIsConnected(true);
        
        // Subscribe to user-specific notifications based on VPA
        const topic = `/topic/notifications/${vpa}`;
        console.log('📡 WebSocket: Subscribing to', topic);
        
        subscriptionRef.current = client.subscribe(topic, handleNotification);
      },

      onDisconnect: () => {
        console.log('🔌 WebSocket: Disconnected');
        isConnectingRef.current = false;
        setIsConnected(false);
      },

      onStompError: (frame) => {
        console.error('❌ WebSocket STOMP Error:', frame.headers['message']);
        isConnectingRef.current = false;
      },

      onWebSocketError: (event) => {
        console.error('❌ WebSocket Error:', event);
        isConnectingRef.current = false;
      },
    });

    clientRef.current = client;
    client.activate();

    // Cleanup on unmount or when dependencies change
    return () => {
      console.log('🔌 WebSocket: Cleaning up...');
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      if (subscriptionRef.current) {
        try {
          subscriptionRef.current.unsubscribe();
        } catch (e) {
          // Ignore errors during cleanup
        }
        subscriptionRef.current = null;
      }

      if (clientRef.current) {
        try {
          clientRef.current.deactivate();
        } catch (e) {
          // Ignore errors during cleanup
        }
        clientRef.current = null;
      }

      isConnectingRef.current = false;
      setIsConnected(false);
    };
  }, [isAuthenticated, vpa]); // Only reconnect when auth or VPA changes

  const reconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.deactivate();
      clientRef.current = null;
    }
    isConnectingRef.current = false;
    // The useEffect will reconnect automatically
  }, []);

  return {
    isConnected,
    reconnect,
  };
}
