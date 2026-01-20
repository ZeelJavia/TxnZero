import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  ArrowLeft,
  QrCode,
  Camera,
  Share2,
  Download,
  Copy,
  Check,
  User,
  Wallet,
} from 'lucide-react';
import { Card } from '../../components/ui';
import { useAuthStore, useAccountStore } from '../../store';
import { cn } from '../../utils';
import { toast } from 'react-hot-toast';

// ============================================
// QR CODE PAGE - Show & Scan
// ============================================

type TabType = 'show' | 'scan';

export const QRCodePage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { linkedAccounts } = useAccountStore();
  
  const [activeTab, setActiveTab] = useState<TabType>('show');
  const [copied, setCopied] = useState(false);
  
  const userVpa = user?.vpa || linkedAccounts[0]?.vpa || '';
  const userName = user?.fullName || 'User';
  
  // Generate UPI payment URL format
  const upiUrl = `upi://pay?pa=${userVpa}&pn=${encodeURIComponent(userName)}&cu=INR`;

  const handleCopyVpa = async () => {
    if (!userVpa) return;
    
    try {
      await navigator.clipboard.writeText(userVpa);
      setCopied(true);
      toast.success('VPA copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleShare = async () => {
    if (!userVpa) return;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Pay me via UPI',
          text: `Pay ${userName} using UPI ID: ${userVpa}`,
          url: upiUrl,
        });
      } catch {
        // User cancelled or error
      }
    } else {
      handleCopyVpa();
    }
  };

  const handleDownloadQR = () => {
    const svg = document.getElementById('user-qr-code');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `${userVpa}-qr.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
      toast.success('QR Code downloaded');
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-[var(--border-subtle)]">
        <div className="flex items-center gap-4 p-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-[var(--surface-glass)] border border-[var(--border-subtle)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-[var(--text-primary)] flex-1">QR Code</h1>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-4 pb-4">
          <button
            onClick={() => setActiveTab('show')}
            className={cn(
              'flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all',
              activeTab === 'show'
                ? 'bg-[var(--color-primary-500)] text-white'
                : 'bg-[var(--surface-glass)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            <QrCode size={18} />
            Show QR
          </button>
          <button
            onClick={() => setActiveTab('scan')}
            className={cn(
              'flex-1 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-all',
              activeTab === 'scan'
                ? 'bg-[var(--color-primary-500)] text-white'
                : 'bg-[var(--surface-glass)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            )}
          >
            <Camera size={18} />
            Scan QR
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="p-4 max-w-md mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'show' ? (
            <motion.div
              key="show"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {/* QR Code Card */}
              <Card className="p-6">
                {/* User Info */}
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[var(--border-subtle)]">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[var(--color-primary-500)] to-[var(--color-accent-500)] flex items-center justify-center">
                    <User className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">{userName}</h2>
                    <p className="text-sm text-[var(--text-muted)]">Scan to pay me</p>
                  </div>
                </div>

                {/* QR Code */}
                <div className="flex justify-center mb-6">
                  <div className="p-4 bg-white rounded-2xl shadow-lg">
                    {userVpa ? (
                      <QRCodeSVG
                        id="user-qr-code"
                        value={upiUrl}
                        size={200}
                        level="H"
                        includeMargin={false}
                        bgColor="#ffffff"
                        fgColor="#000000"
                      />
                    ) : (
                      <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-100 rounded-xl">
                        <p className="text-sm text-gray-500 text-center px-4">
                          Link a bank account to generate QR code
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* VPA Display */}
                <div className="flex items-center justify-center gap-3 p-4 bg-[var(--surface-glass)] rounded-xl border border-[var(--border-subtle)]">
                  <Wallet className="w-5 h-5 text-[var(--color-primary-500)]" />
                  <span className="text-[var(--text-primary)] font-medium">{userVpa || 'No VPA linked'}</span>
                  {userVpa && (
                    <button
                      onClick={handleCopyVpa}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-[var(--color-success-500)]" />
                      ) : (
                        <Copy className="w-4 h-4 text-[var(--text-muted)]" />
                      )}
                    </button>
                  )}
                </div>
              </Card>

              {/* Action Buttons */}
              {userVpa && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleShare}
                    className="flex items-center justify-center gap-2 py-4 rounded-xl bg-[var(--surface-glass)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <Share2 size={20} />
                    Share
                  </button>
                  <button
                    onClick={handleDownloadQR}
                    className="flex items-center justify-center gap-2 py-4 rounded-xl bg-[var(--surface-glass)] border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                  >
                    <Download size={20} />
                    Download
                  </button>
                </div>
              )}

              {/* Instructions */}
              <Card className="p-4">
                <h3 className="font-medium text-[var(--text-primary)] mb-3">How it works</h3>
                <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-primary-500)]/20 text-[var(--color-primary-500)] flex items-center justify-center text-xs font-medium shrink-0">1</span>
                    Show this QR code to receive payments
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-primary-500)]/20 text-[var(--color-primary-500)] flex items-center justify-center text-xs font-medium shrink-0">2</span>
                    The payer scans with any UPI app
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 rounded-full bg-[var(--color-primary-500)]/20 text-[var(--color-primary-500)] flex items-center justify-center text-xs font-medium shrink-0">3</span>
                    Money is instantly credited to your account
                  </li>
                </ul>
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key="scan"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <QRScanner />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ============================================
// QR SCANNER COMPONENT
// ============================================

const QRScanner = () => {
  const navigate = useNavigate();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasProcessedRef = useRef(false); // CRITICAL: Prevent multiple scan callbacks
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedData, setScannedData] = useState<string | null>(null);

  useEffect(() => {
    hasProcessedRef.current = false; // Reset on mount
    startScanner();
    
    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    try {
      setError(null);
      setIsScanning(true);
      hasProcessedRef.current = false; // Reset flag
      
      scannerRef.current = new Html5Qrcode('qr-reader');
      
      await scannerRef.current.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        onScanSuccess,
        onScanFailure
      );
    } catch (err) {
      console.error('Scanner error:', err);
      setError('Unable to access camera. Please grant camera permission.');
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current?.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
    setIsScanning(false);
  };

  const onScanSuccess = async (decodedText: string) => {
    // CRITICAL: Check flag FIRST - prevent multiple callbacks from firing
    if (hasProcessedRef.current) {
      return;
    }
    hasProcessedRef.current = true; // Set immediately before any async work
    
    await stopScanner();
    setScannedData(decodedText);
    
    // Parse UPI URL
    const upiData = parseUPIUrl(decodedText);
    
    if (upiData.vpa) {
      toast.success(`Found VPA: ${upiData.vpa}`);
      // Navigate to send money with pre-filled VPA
      navigate(`/send?vpa=${encodeURIComponent(upiData.vpa)}&name=${encodeURIComponent(upiData.name || '')}`);
    } else {
      toast.error('Invalid QR code. Not a valid UPI QR.');
      hasProcessedRef.current = false; // Allow retry for invalid QR
    }
  };

  const onScanFailure = () => {
    // Silently ignore failures (happens on each frame without QR)
  };

  const parseUPIUrl = (url: string): { vpa?: string; name?: string; amount?: string } => {
    try {
      // Handle upi:// URLs
      if (url.startsWith('upi://')) {
        const urlObj = new URL(url);
        return {
          vpa: urlObj.searchParams.get('pa') || undefined,
          name: urlObj.searchParams.get('pn') || undefined,
          amount: urlObj.searchParams.get('am') || undefined,
        };
      }
      
      // Handle plain VPA (user@bank format)
      if (url.includes('@')) {
        return { vpa: url };
      }
      
      return {};
    } catch {
      // Try as plain VPA
      if (url.includes('@')) {
        return { vpa: url };
      }
      return {};
    }
  };

  const handleRetry = () => {
    setScannedData(null);
    setError(null);
    startScanner();
  };

  return (
    <div className="space-y-6">
      {/* Scanner Container */}
      <Card className="overflow-hidden">
  <div 
    id="qr-reader" 
    className="w-full h-[300px] overflow-hidden relative" // Ensure fixed height and overflow hidden
  />
        
        {!isScanning && !scannedData && (
          <div className="p-8 text-center">
            {error ? (
              <div className="space-y-4">
                <div className="w-16 h-16 rounded-full bg-[var(--color-error-500)]/20 flex items-center justify-center mx-auto">
                  <Camera className="w-8 h-8 text-[var(--color-error-500)]" />
                </div>
                <p className="text-[var(--text-muted)]">{error}</p>
                <button
                  onClick={handleRetry}
                  className="px-6 py-2 bg-[var(--color-primary-500)] text-white rounded-xl font-medium"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-16 h-16 rounded-full bg-[var(--color-primary-500)]/20 flex items-center justify-center mx-auto animate-pulse">
                  <Camera className="w-8 h-8 text-[var(--color-primary-500)]" />
                </div>
                <p className="text-[var(--text-muted)]">Starting camera...</p>
              </div>
            )}
          </div>
        )}

        {scannedData && (
          <div className="p-6 text-center">
            <div className="w-16 h-16 rounded-full bg-[var(--color-success-500)]/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-[var(--color-success-500)]" />
            </div>
            <p className="text-[var(--text-primary)] font-medium mb-2">QR Code Scanned!</p>
            <p className="text-sm text-[var(--text-muted)] mb-4 break-all">{scannedData}</p>
            <button
              onClick={handleRetry}
              className="px-6 py-2 bg-[var(--surface-glass)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-xl font-medium"
            >
              Scan Another
            </button>
          </div>
        )}
      </Card>

      {/* Instructions */}
      <Card className="p-4">
        <h3 className="font-medium text-[var(--text-primary)] mb-3">Tips for scanning</h3>
        <ul className="space-y-2 text-sm text-[var(--text-muted)]">
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-[var(--color-accent-500)]/20 text-[var(--color-accent-500)] flex items-center justify-center text-xs font-medium shrink-0">1</span>
            Hold the camera steady over the QR code
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-[var(--color-accent-500)]/20 text-[var(--color-accent-500)] flex items-center justify-center text-xs font-medium shrink-0">2</span>
            Ensure good lighting for better recognition
          </li>
          <li className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-[var(--color-accent-500)]/20 text-[var(--color-accent-500)] flex items-center justify-center text-xs font-medium shrink-0">3</span>
            Keep the QR code within the scanning frame
          </li>
        </ul>
      </Card>
    </div>
  );
};

export default QRCodePage;
