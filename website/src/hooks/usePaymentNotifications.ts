import { useEffect, useRef, useCallback, useState } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import toast from 'react-hot-toast';
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

      // Show toast based on event type - uses app's global toast styles from App.tsx
      switch (event.eventType) {
        case 'PAYMENT_RECEIVED':
          toast.success(
            `Received ₹${event.amount?.toLocaleString('en-IN')} from ${event.senderVpa}`,
            { duration: 5000, icon: '💰' }
          );
          // Update balance only if we have a valid number
          if (typeof event.newBalance === 'number' && !isNaN(event.newBalance)) {
            setBalanceRef.current(event.newBalance);
          }
          // Trigger dashboard refresh for updated data
          window.dispatchEvent(new CustomEvent('refresh-dashboard'));
          break;

        case 'PAYMENT_SENT':
          toast.success(
            event.message,
            { duration: 4000, icon: '📤' }
          );
          if (typeof event.newBalance === 'number' && !isNaN(event.newBalance)) {
            setBalanceRef.current(event.newBalance);
          }
          // Trigger dashboard refresh for updated data
          window.dispatchEvent(new CustomEvent('refresh-dashboard'));
          break;

        case 'PAYMENT_FAILED':
          toast.error(
            event.message,
            { duration: 5000, icon: '❌' }
          );
          break;

        case 'PAYMENT_REVERSED':
          toast(
            event.message,
            { duration: 5000, icon: '↩️' }
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
