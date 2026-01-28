import { useEffect, useRef, useCallback, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, X, AlertCircle, RotateCcw } from 'lucide-react';
import { useAuthStore, useAccountStore } from '../store';

// WebSocket URL configuration
// In development: uses Vite proxy (relative path)
// In production: uses VITE_WS_URL or falls back to same origin
const getWsUrl = () => {
  // If VITE_WS_URL is set (production), use it
  const wsUrl = import.meta.env.VITE_WS_URL;
  if (wsUrl) {
    return wsUrl;
  }
  // Otherwise use relative path (development with Vite proxy)
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

// Custom notification component matching app UI with glassmorphism
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
      iconBg: 'bg-emerald-500/30',
      iconColor: 'text-emerald-400',
      glowColor: 'shadow-emerald-500/20',
      borderColor: 'border-emerald-500/30',
      accentGradient: 'from-emerald-500 to-emerald-600',
      title: 'Payment Received',
      amountColor: 'text-emerald-400',
      amountPrefix: '+',
    },
    sent: {
      icon: ArrowUpRight,
      iconBg: 'bg-blue-500/30',
      iconColor: 'text-blue-400',
      glowColor: 'shadow-blue-500/20',
      borderColor: 'border-blue-500/30',
      accentGradient: 'from-blue-500 to-blue-600',
      title: 'Payment Sent',
      amountColor: 'text-blue-400',
      amountPrefix: '-',
    },
    failed: {
      icon: AlertCircle,
      iconBg: 'bg-red-500/30',
      iconColor: 'text-red-400',
      glowColor: 'shadow-red-500/20',
      borderColor: 'border-red-500/30',
      accentGradient: 'from-red-500 to-red-600',
      title: 'Payment Failed',
      amountColor: 'text-red-400',
      amountPrefix: '',
    },
    reversed: {
      icon: RotateCcw,
      iconBg: 'bg-amber-500/30',
      iconColor: 'text-amber-400',
      glowColor: 'shadow-amber-500/20',
      borderColor: 'border-amber-500/30',
      accentGradient: 'from-amber-500 to-amber-600',
      title: 'Payment Reversed',
      amountColor: 'text-amber-400',
      amountPrefix: '',
    },
  };

  const { icon: Icon, iconBg, iconColor, glowColor, borderColor, accentGradient, title, amountColor, amountPrefix } = config[type];

  return (
    <AnimatePresence>
      {t.visible && (
        <motion.div
          initial={{ opacity: 0, x: 100, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 100, scale: 0.9 }}
          transition={{ 
            type: "spring", 
            stiffness: 400, 
            damping: 25,
            mass: 0.8
          }}
          className={`max-w-sm w-full overflow-hidden rounded-2xl shadow-2xl ${glowColor}`}
          style={{
            background: 'rgba(20, 20, 30, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {/* Gradient border effect */}
          <div className={`absolute inset-0 rounded-2xl border ${borderColor} pointer-events-none`} />
          
          {/* Top accent gradient line */}
          <div className={`h-1 bg-gradient-to-r ${accentGradient}`} />
          
          <div className="p-4 relative">
            <div className="flex items-start gap-4">
              {/* Animated Icon with glow */}
              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
                className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center shrink-0 relative`}
              >
                {/* Icon glow effect */}
                <div className={`absolute inset-0 rounded-xl ${iconBg} blur-lg opacity-50`} />
                <motion.div
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Icon className={`w-6 h-6 ${iconColor} relative z-10`} />
                </motion.div>
              </motion.div>

              {/* Content */}
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="flex-1 min-w-0"
              >
                <p className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                  {title}
                </p>
                {amount !== undefined && (
                  <motion.p 
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.2 }}
                    className={`text-2xl font-bold ${amountColor} mt-0.5 tracking-tight`}
                  >
                    {amountPrefix}₹{amount.toLocaleString('en-IN')}
                  </motion.p>
                )}
                <p className="text-sm text-white/60 mt-1 truncate">
                  {from ? `from ${from}` : message}
                </p>
              </motion.div>

              {/* Close button with hover effect */}
              <motion.button
                whileHover={{ scale: 1.1, backgroundColor: 'rgba(255,255,255,0.1)' }}
                whileTap={{ scale: 0.9 }}
                onClick={() => toast.dismiss(t.id)}
                className="p-2 rounded-xl text-white/40 hover:text-white/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </motion.button>
            </div>
            
            {/* Subtle shimmer effect */}
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '200%' }}
              transition={{ duration: 1.5, delay: 0.3, ease: "easeInOut" }}
              className="absolute inset-0 w-1/3 h-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 pointer-events-none"
            />
          </div>

          {/* Auto-dismiss progress bar */}
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: type === 'received' ? 5 : 4, ease: "linear" }}
            style={{ transformOrigin: 'left' }}
            className={`h-0.5 bg-gradient-to-r ${accentGradient} opacity-60`}
          />
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
