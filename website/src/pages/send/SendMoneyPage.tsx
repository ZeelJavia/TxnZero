import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  User,
  Building2,
  AtSign,
  IndianRupee,
  CheckCircle2,
  XCircle,
  Shield,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { Button, Input, Card, MpinInput, ProcessingLoader } from '../../components/ui';
import api, { paymentApi } from '../../services/api';
import { useAuthStore, useAccountStore } from '../../store';
import { formatCurrency, validateVpa, cn } from '../../utils';
import type { TransactionResponse, TransactionStatus } from '../../types';

// ============================================
// SEND MONEY PAGE
// ============================================

type SendStep = 'recipient' | 'amount' | 'confirm' | 'mpin' | 'processing' | 'result';

interface ForensicReport {
  verdict?: string;
  pattern?: string;
  explanation?: string;
  raw?: string;
}

export const SendMoneyPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useAuthStore();
  const { defaultVpa } = useAccountStore();

  // Get query params from QR scan
  const initialVpa = searchParams.get('vpa') || '';
  const initialName = searchParams.get('name') || '';

  // Steps
  const [step, setStep] = useState<SendStep>('recipient');
  const [isLoading, setIsLoading] = useState(false);

  // Form Data
  const [recipientVpa, setRecipientVpa] = useState(initialVpa);
  const [recipientName, setRecipientName] = useState(initialName);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [mpin, setMpin] = useState('');

  // Result
  const [transactionResult, setTransactionResult] = useState<TransactionResponse | null>(null);
  const [forensicReport, setForensicReport] = useState<ForensicReport | null>(null);
  const [isLoadingForensic, setIsLoadingForensic] = useState(false);

  // Errors
  const [vpaError, setVpaError] = useState('');
  const [amountError, setAmountError] = useState('');
  const [mpinError, setMpinError] = useState('');

  // Quick amounts
  const quickAmounts = [100, 200, 500, 1000, 2000, 5000];

  // Auto-advance if coming from QR scan with valid VPA
  useEffect(() => {
    if (initialVpa && validateVpa(initialVpa)) {
      // If we have a name from QR, skip validation and go to amount
      if (initialName) {
        setStep('amount');
      } else {
        // Auto-validate the VPA
        handleValidateVpa();
      }
    }
  }, []); // Run once on mount

  // Validate VPA and fetch recipient details
  const handleValidateVpa = async () => {
    setVpaError('');
    if (!validateVpa(recipientVpa)) {
      setVpaError('Please enter a valid UPI ID');
      return;
    }

    setIsLoading(true);
    try {
      // Simulate VPA verification
      await new Promise((resolve) => setTimeout(resolve, 800));
      
      // Use recipient name from QR if available, otherwise extract from VPA
      if (!recipientName) {
        const names: Record<string, string> = {
          'merchant@paytm': 'Merchant Store',
          'test@upi': 'Test Account',
        };
        setRecipientName(names[recipientVpa] || recipientVpa.split('@')[0]);
      }
      setStep('amount');
    } catch (error) {
      setVpaError('Invalid UPI ID');
    } finally {
      setIsLoading(false);
    }
  };

  // Validate amount
  const handleValidateAmount = () => {
    setAmountError('');
    const numAmount = parseFloat(amount);
    
    if (isNaN(numAmount) || numAmount <= 0) {
      setAmountError('Please enter a valid amount');
      return;
    }

    if (numAmount > 100000) {
      setAmountError('Amount cannot exceed ₹1,00,000');
      return;
    }

    setStep('confirm');
  };

  // Go to MPIN entry
  const handleProceedToMpin = () => {
    setStep('mpin');
  };

  // Parse forensic report from text format
  const parseForensicReport = (reportText: string): ForensicReport => {
    const report: ForensicReport = { raw: reportText };

    try {
      // Extract Verdict
      const verdictMatch = reportText.match(/\*\*Verdict:\*\*\s*(.+?)(?:\n|$)/);
      if (verdictMatch) {
        report.verdict = verdictMatch[1].trim();
      }

      // Extract Pattern
      const patternMatch = reportText.match(/\*\*Pattern Detected:\*\*\s*(.+?)(?:\n|$)/);
      if (patternMatch) {
        report.pattern = patternMatch[1].trim();
      }

      // Extract Explanation
      const explanationMatch = reportText.match(/\*\*Explanation:\*\*\s*(.+?)$/s);
      if (explanationMatch) {
        report.explanation = explanationMatch[1].trim();
      }
    } catch (error) {
      console.error('Error parsing forensic report:', error);
    }

    return report;
  };

  // Fetch forensic report independently
  const fetchForensicReport = async (txnId: string, txnAmount: number) => {
    setIsLoadingForensic(true);
    try {
      const response = await api('/api/payments/graph-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: {
          txnId,
          amount: txnAmount,
          payerVpa: defaultVpa || '',
          payeeVpa: recipientVpa,
        }
      });

      console.log('Graph RAG Response:', response.data); // Debug log

      if (response.status >= 200 && response.status < 300) {
        // Response structure: { data: { forensic_report, status, txnId }, message, statusCode }
        const responseData = response.data;
        const forensicData = responseData.data || responseData;
        
        // Parse the forensic report
        if (forensicData.forensic_report) {
          console.log('Forensic Report Text:', forensicData.forensic_report); // Debug log
          const parsed = parseForensicReport(forensicData.forensic_report);
          console.log('Parsed Report:', parsed); // Debug log
          setForensicReport(parsed);
        } else {
          setForensicReport({ raw: 'No forensic report available' });
        }
      }
    } catch (error) {
      console.error('Error fetching forensic report:', error);
      setForensicReport({ raw: 'Failed to fetch forensic report' });
    } finally {
      setIsLoadingForensic(false);
    }
  };

  // Initiate payment - Optimized for low latency
  const handleInitiatePayment = async () => {
    if (mpin.length !== 4 && mpin.length !== 6) {
      setMpinError('Please enter your UPI PIN');
      return;
    }

    setMpinError('');
    setStep('processing');

    try {
      // Get geolocation in parallel (non-blocking)
      const geoPromise = new Promise<{ lat: number; long: number } | null>((resolve) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, long: pos.coords.longitude }),
            () => resolve(null),
            { timeout: 3000, maximumAge: 300000 }
          );
        } else {
          resolve(null);
        }
      });

      // Start payment immediately, geo is optional
      const deviceId = localStorage.getItem('deviceId') || '';
      const geo = await Promise.race([
        geoPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1000))
      ]);

      const response = await paymentApi.initiatePayment({
        payerVpa: defaultVpa || '',
        payeeVpa: recipientVpa,
        amount: parseFloat(amount),
        mpin,
        deviceId,
        ipAddress: '', // Detected by backend
        geoLat: geo?.lat,
        geoLong: geo?.long,
        wifiSsid: undefined,
        userAgent: navigator.userAgent,
      });

      // Backend returns TransactionResponse directly (not wrapped)
      const txnResponse = response.data;
      
      const txnId = txnResponse.txnId || '';
      const transactionResult = {
        txnId,
        transactionId: txnId,
        status: txnResponse.status as TransactionStatus,
        message: txnResponse.message || 'Payment processed',
        amount: parseFloat(amount),
        timestamp: new Date().toISOString(),
        riskScore: txnResponse.riskScore,
      };

      // Set transaction result and move to result screen immediately
      setTransactionResult(transactionResult);
      setStep('result');

      // Fetch forensic report in the background (non-blocking)
      if (txnId) {
        fetchForensicReport(txnId, parseFloat(amount));
      }

    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error ||
                          error.message || 
                          'Payment failed. Please try again.';
      
      setTransactionResult({
        txnId: '',
        transactionId: '',
        status: 'FAILED' as TransactionStatus,
        message: errorMessage,
        amount: parseFloat(amount),
        timestamp: new Date().toISOString(),
      });
      setStep('result');
    }
  };

  // Handle back navigation
  const handleBack = () => {
    switch (step) {
      case 'amount':
        setStep('recipient');
        break;
      case 'confirm':
        setStep('amount');
        break;
      case 'mpin':
        setStep('confirm');
        setMpin('');
        break;
      default:
        navigate(-1);
    }
  };

  // Render step content
  const renderStep = () => {
    switch (step) {
      case 'recipient':
        return (
          <RecipientStep
            vpa={recipientVpa}
            setVpa={setRecipientVpa}
            error={vpaError}
            isLoading={isLoading}
            onSubmit={handleValidateVpa}
          />
        );

      case 'amount':
        return (
          <AmountStep
            amount={amount}
            setAmount={setAmount}
            note={note}
            setNote={setNote}
            quickAmounts={quickAmounts}
            error={amountError}
            recipientName={recipientName}
            onSubmit={handleValidateAmount}
          />
        );

      case 'confirm':
        return (
          <ConfirmStep
            recipientVpa={recipientVpa}
            recipientName={recipientName}
            amount={parseFloat(amount)}
            note={note}
            senderVpa={defaultVpa || ''}
            onConfirm={handleProceedToMpin}
          />
        );

      case 'mpin':
        return (
          <MpinStep
            mpin={mpin}
            setMpin={setMpin}
            error={mpinError}
            onSubmit={handleInitiatePayment}
          />
        );

      case 'processing':
        return <ProcessingStep amount={parseFloat(amount)} />;

      case 'result':
        return (
          <ResultStep
            result={transactionResult!}
            recipientName={recipientName}
            forensicReport={forensicReport}
            isLoadingForensic={isLoadingForensic}
            onDone={() => navigate('/dashboard')}
            onRetry={() => {
              setMpin('');
              setForensicReport(null);
              setStep('mpin');
            }}
          />
        );

      default:
        return null;
    }
  };

  const showBackButton = step !== 'processing' && step !== 'result';

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      {showBackButton && (
        <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/50">
          <div className="flex items-center gap-4 p-4">
            <button
              onClick={handleBack}
              className="w-10 h-10 rounded-xl bg-slate-800/80 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="text-lg font-semibold text-white">Send Money</h1>
          </div>
        </header>
      )}

      {/* Content */}
      <div className="p-4 md:p-6 max-w-lg mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

// ============================================
// STEP COMPONENTS
// ============================================

interface RecipientStepProps {
  vpa: string;
  setVpa: (value: string) => void;
  error: string;
  isLoading: boolean;
  onSubmit: () => void;
}

const RecipientStep = ({ vpa, setVpa, error, isLoading, onSubmit }: RecipientStepProps) => {
  const recentContacts = [
    { name: 'Rahul Kumar', vpa: 'rahul@upi' },
    { name: 'Priya Singh', vpa: 'priya@okaxis' },
    { name: 'Amit Shah', vpa: 'amit@ybl' },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold text-white">Who are you paying?</h2>
        <p className="text-slate-400">Enter recipient's UPI ID</p>
      </div>

      <Input
        label="UPI ID"
        placeholder="name@upi"
        value={vpa}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVpa(e.target.value.toLowerCase())}
        error={error}
        leftIcon={<AtSign size={20} />}
        autoFocus
      />

      <Button
        fullWidth
        size="lg"
        isLoading={isLoading}
        onClick={onSubmit}
        disabled={!vpa}
        rightIcon={<ArrowRight size={20} />}
      >
        Continue
      </Button>

      {/* Recent Contacts */}
      <div className="pt-4">
        <h3 className="text-sm font-medium text-slate-400 mb-3">Recent</h3>
        <div className="space-y-2">
          {recentContacts.map((contact) => (
            <button
              key={contact.vpa}
              onClick={() => setVpa(contact.vpa)}
              className="w-full p-3 rounded-xl bg-slate-800/50 flex items-center gap-3 hover:bg-slate-800 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-semibold">
                {contact.name.charAt(0)}
              </div>
              <div className="flex-1 text-left">
                <p className="text-white font-medium">{contact.name}</p>
                <p className="text-sm text-slate-500">{contact.vpa}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

interface AmountStepProps {
  amount: string;
  setAmount: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  quickAmounts: number[];
  error: string;
  recipientName: string;
  onSubmit: () => void;
}

const AmountStep = ({ amount, setAmount, note, setNote, quickAmounts, error, recipientName, onSubmit }: AmountStepProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="space-y-6">
      {/* Recipient Info */}
      <div className="text-center space-y-1">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">
          {recipientName.charAt(0).toUpperCase()}
        </div>
        <h2 className="text-xl font-bold text-white">{recipientName}</h2>
        <p className="text-sm text-slate-500">UPI Payment</p>
      </div>

      {/* Amount Input */}
      <div className="text-center py-8">
        <div className="flex items-center justify-center gap-2">
          <IndianRupee className="w-8 h-8 text-slate-400" />
          <input
            ref={inputRef}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="text-5xl font-bold text-white bg-transparent border-none outline-none text-center w-48 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
        </div>
        {error && (
          <p className="text-sm text-danger-400 mt-2">{error}</p>
        )}
      </div>

      {/* Quick Amounts */}
      <div className="flex flex-wrap justify-center gap-2">
        {quickAmounts.map((qa) => (
          <button
            key={qa}
            onClick={() => setAmount(String(qa))}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-medium transition-all',
              amount === String(qa)
                ? 'bg-primary-500 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            )}
          >
            ₹{qa}
          </button>
        ))}
      </div>

      {/* Note */}
      <Input
        label="Add a note (optional)"
        placeholder="Dinner, rent, etc."
        value={note}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
      />

      <Button
        fullWidth
        size="lg"
        onClick={onSubmit}
        disabled={!amount || parseFloat(amount) <= 0}
        rightIcon={<ArrowRight size={20} />}
      >
        Continue
      </Button>
    </div>
  );
};

interface ConfirmStepProps {
  recipientVpa: string;
  recipientName: string;
  amount: number;
  note: string;
  senderVpa: string;
  onConfirm: () => void;
}

const ConfirmStep = ({ recipientVpa, recipientName, amount, note, senderVpa, onConfirm }: ConfirmStepProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">Confirm Payment</h2>
        <p className="text-slate-400">Review the details before paying</p>
      </div>

      <Card className="p-6 space-y-6">
        {/* Amount */}
        <div className="text-center py-4 border-b border-slate-800">
          <p className="text-sm text-slate-400 mb-1">You're sending</p>
          <p className="text-4xl font-bold gradient-text">{formatCurrency(amount)}</p>
        </div>

        {/* Details */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-slate-400">
              <User size={18} />
              <span>To</span>
            </div>
            <div className="text-right">
              <p className="text-white font-medium">{recipientName}</p>
              <p className="text-sm text-slate-500">{recipientVpa}</p>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-slate-400">
              <Building2 size={18} />
              <span>From</span>
            </div>
            <div className="text-right">
              <p className="text-white font-medium">Primary Account</p>
              <p className="text-sm text-slate-500">{senderVpa}</p>
            </div>
          </div>

          {note && (
            <div className="flex justify-between items-start">
              <span className="text-slate-400">Note</span>
              <p className="text-white text-right max-w-[200px]">{note}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Security Note */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-primary-500/10 border border-primary-500/20">
        <Shield className="w-5 h-5 text-primary-400 shrink-0" />
        <p className="text-sm text-slate-300">
          Your transaction is secured with 256-bit encryption
        </p>
      </div>

      <Button
        fullWidth
        size="lg"
        onClick={onConfirm}
        rightIcon={<Shield size={20} />}
      >
        Pay {formatCurrency(amount)}
      </Button>
    </div>
  );
};

interface MpinStepProps {
  mpin: string;
  setMpin: (value: string) => void;
  error: string;
  onSubmit: () => void;
}

const MpinStep = ({ mpin, setMpin, error, onSubmit }: MpinStepProps) => {
  useEffect(() => {
    // Auto-submit when PIN is complete (4 or 6 digits)
    if (mpin.length === 6) {
      onSubmit();
    }
  }, [mpin, onSubmit]);

  return (
    <div className="space-y-8 py-8">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-primary-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Enter UPI PIN</h2>
        <p className="text-slate-400">Enter your 6-digit UPI PIN to authorize</p>
      </div>

      <MpinInput
        length={6}
        value={mpin}
        onChange={setMpin}
        error={error}
      />

      <p className="text-center text-xs text-slate-500">
        Never share your UPI PIN with anyone
      </p>
    </div>
  );
};

interface ProcessingStepProps {
  amount: number;
}

const ProcessingStep = ({ amount }: ProcessingStepProps) => {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <ProcessingLoader message={`Processing ${formatCurrency(amount)}`} />
    </div>
  );
};

interface ResultStepProps {
  result: TransactionResponse;
  recipientName: string;
  forensicReport: ForensicReport | null;
  isLoadingForensic: boolean;
  onDone: () => void;
  onRetry: () => void;
}

const ResultStep = ({ result, recipientName, forensicReport, isLoadingForensic, onDone, onRetry }: ResultStepProps) => {
  const isSuccess = result.status === 'SUCCESS';

  const getVerdictColor = (verdict?: string) => {
    if (!verdict) return 'text-slate-400';
    const lower = verdict.toLowerCase();
    if (lower.includes('illegal') || lower.includes('suspicious')) return 'text-danger-400';
    if (lower.includes('legal') || lower.includes('normal')) return 'text-success-400';
    return 'text-amber-400';
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-8 py-8">
      {/* Status Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.2 }}
        className={cn(
          'w-24 h-24 rounded-full flex items-center justify-center',
          isSuccess ? 'bg-success-500/20' : 'bg-danger-500/20'
        )}
      >
        {isSuccess ? (
          <CheckCircle2 className="w-14 h-14 text-success-400" />
        ) : (
          <XCircle className="w-14 h-14 text-danger-400" />
        )}
      </motion.div>

      {/* Status Text */}
      <div className="text-center space-y-2">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-bold text-white"
        >
          {isSuccess ? 'Payment Successful!' : 'Payment Failed'}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-slate-400"
        >
          {isSuccess
            ? `${formatCurrency(result.amount ?? 0)} sent to ${recipientName}`
            : result.message || 'Something went wrong'}
        </motion.p>
      </div>

      {/* Transaction Details */}
      {isSuccess && result.transactionId && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-md"
        >
          <Card className="p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Transaction ID</span>
              <span className="text-white font-mono text-xs">{result.transactionId.slice(0, 20)}...</span>
            </div>
            {result.timestamp && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Time</span>
                <span className="text-white">
                  {new Date(result.timestamp).toLocaleTimeString()}
                </span>
              </div>
            )}
            {result.riskScore !== undefined && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Risk Score</span>
                <span className={`font-medium ${result.riskScore > 0.5 ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {(result.riskScore * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </Card>
        </motion.div>
      )}

      {/* Forensic Report */}
      {isSuccess && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="w-full max-w-md"
        >
          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 className="text-lg font-bold text-white">Forensic Analysis</h3>
            </div>

            {isLoadingForensic ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
                <span className="ml-3 text-slate-400">Analyzing transaction...</span>
              </div>
            ) : forensicReport ? (
              <div className="space-y-3">
                {forensicReport.verdict && (
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <span className="text-xs text-slate-400 block mb-1">Verdict</span>
                    <span className={cn('text-base font-semibold', getVerdictColor(forensicReport.verdict))}>
                      {forensicReport.verdict}
                    </span>
                  </div>
                )}
                
                {forensicReport.pattern && (
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <span className="text-xs text-slate-400 block mb-1">Pattern Detected</span>
                    <span className="text-base font-medium text-white">
                      {forensicReport.pattern}
                    </span>
                  </div>
                )}
                
                {forensicReport.explanation && (
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <span className="text-xs text-slate-400 block mb-1">Explanation</span>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {forensicReport.explanation}
                    </p>
                  </div>
                )}

                {/* Show raw if parsing didn't extract anything */}
                {!forensicReport.verdict && !forensicReport.pattern && !forensicReport.explanation && forensicReport.raw && (
                  <div className="p-3 rounded-lg bg-slate-800/50">
                    <p className="text-sm text-slate-300 whitespace-pre-wrap">
                      {forensicReport.raw}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">
                No forensic data available
              </p>
            )}
          </Card>
        </motion.div>
      )}

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="w-full max-w-xs space-y-3"
      >
        {isSuccess ? (
          <>
            <Button fullWidth size="lg" onClick={onDone}>
              Done
            </Button>
            <Button fullWidth size="lg" variant="ghost" onClick={() => window.location.reload()}>
              Send Again
            </Button>
          </>
        ) : (
          <>
            <Button fullWidth size="lg" onClick={onRetry}>
              Try Again
            </Button>
            <Button fullWidth size="lg" variant="ghost" onClick={onDone}>
              Go Home
            </Button>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default SendMoneyPage;