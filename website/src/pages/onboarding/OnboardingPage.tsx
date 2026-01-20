import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Building2, 
  CreditCard, 
  Shield, 
  ArrowRight, 
  CheckCircle2,
  Sparkles,
  ChevronRight,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button, OtpInput, Spinner } from '../../components/ui';
import { accountApi } from '../../services/api';
import { useAccountStore, useAuthStore } from '../../store';
import type { Bank } from '../../types';

// ============================================
// ONBOARDING PAGE
// ============================================

type OnboardingStep = 'welcome' | 'select-bank' | 'bank-otp' | 'set-mpin' | 'success';

export const OnboardingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { setBanks, setDefaultVpa } = useAccountStore();

  // State
  const [step, setStep] = useState<OnboardingStep>('welcome');
  const [isLoading, setIsLoading] = useState(false);
  const [banks, setBanksList] = useState<Bank[]>([]);
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [bankOtp, setBankOtp] = useState('');
  const [generatedVpa, setGeneratedVpa] = useState('');
  const [otpError, setOtpError] = useState('');
  const [mpin, setMpin] = useState('');
  const [confirmMpin, setConfirmMpin] = useState('');
  const [mpinError, setMpinError] = useState('');

  // Step 1: Fetch banks and proceed
  const handleGetStarted = async () => {
    setIsLoading(true);
    try {
      const response = await accountApi.getBanks();
      if (response.data.statusCode === 200 && response.data.data) {
        // API returns { banks: ["SBI", "AXIS"] }, convert to Bank[] format
        const bankHandles = response.data.data.banks || [];
        const formattedBanks: Bank[] = bankHandles.map((handle: string) => ({
          bankHandle: handle,
          bankName: getBankName(handle),
        }));
        setBanksList(formattedBanks);
        setBanks(bankHandles); // Store expects string[]
        setStep('select-bank');
      }
    } catch (error) {
      toast.error('Failed to fetch banks');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to get bank name from handle
  const getBankName = (handle: string): string => {
    const bankNames: Record<string, string> = {
      'SBI': 'State Bank of India',
      'AXIS': 'Axis Bank',
      'HDFC': 'HDFC Bank',
      'ICICI': 'ICICI Bank',
      'PNB': 'Punjab National Bank',
      'BOB': 'Bank of Baroda',
      'KOTAK': 'Kotak Mahindra Bank',
    };
    return bankNames[handle] || handle;
  };

  // Step 2: Select bank and send OTP
  const handleSelectBank = async (bank: Bank) => {
    setSelectedBank(bank);
    setIsLoading(true);
    try {
      // Phone number is extracted from JWT token on backend
      const response = await accountApi.sendBankOtp(bank.bankHandle);
      if (response.data.statusCode === 200) {
        toast.success('OTP sent to your registered mobile');
        setStep('bank-otp');
      }
    } catch (error) {
      toast.error('Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Verify bank OTP
  const handleVerifyBankOtp = async () => {
    if (bankOtp.length !== 6) {
      setOtpError('Please enter valid OTP');
      return;
    }

    setIsLoading(true);
    setOtpError('');
    try {
      // Phone number is extracted from JWT token on backend
      const response = await accountApi.generateVpa(
        selectedBank?.bankHandle || '',
        bankOtp
      );

      if (response.data.statusCode === 200 || response.data.statusCode === 201) {
        const data = response.data.data;
        setGeneratedVpa(data?.vpa || `${user?.phoneNumber}@upi`);
        setDefaultVpa(data?.vpa || '');
        toast.success('VPA generated! Now set your MPIN');
        setStep('set-mpin');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4: Set MPIN
  const handleSetMpin = async () => {
    // Validate MPIN
    if (mpin.length !== 6) {
      setMpinError('MPIN must be 6 digits');
      return;
    }
    if (mpin !== confirmMpin) {
      setMpinError('MPINs do not match');
      return;
    }
    if (!/^\d{6}$/.test(mpin)) {
      setMpinError('MPIN must contain only numbers');
      return;
    }

    setIsLoading(true);
    setMpinError('');
    try {
      const response = await accountApi.setMpin(mpin, selectedBank?.bankHandle || '');

      if (response.data.statusCode === 200 || response.data.statusCode === 201) {
        // Save linked account to store
        const newAccount = {
          vpa: generatedVpa,
          bankHandle: selectedBank?.bankHandle || '',
          bankName: selectedBank?.bankName || '',
          maskedAccountNumber: '',
          isPrimary: true,
        };
        
        // Import addLinkedAccount from store
        const { addLinkedAccount } = useAccountStore.getState();
        addLinkedAccount(newAccount);
        
        toast.success('MPIN set successfully!');
        setStep('success');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to set MPIN');
    } finally {
      setIsLoading(false);
    }
  };

  // Complete onboarding
  const handleComplete = () => {
    navigate('/dashboard');
  };

  // Skip onboarding
  const handleSkip = () => {
    navigate('/dashboard');
  };

  // Render steps
  const renderStep = () => {
    switch (step) {
      case 'welcome':
        return (
          <WelcomeStep
            userName={user?.fullName?.split(' ')[0] || 'there'}
            isLoading={isLoading}
            onGetStarted={handleGetStarted}
            onSkip={handleSkip}
          />
        );

      case 'select-bank':
        return (
          <SelectBankStep
            banks={banks}
            isLoading={isLoading}
            onSelectBank={handleSelectBank}
            selectedBank={selectedBank}
          />
        );

      case 'bank-otp':
        return (
          <BankOtpStep
            bankName={selectedBank?.bankName || ''}
            otp={bankOtp}
            setOtp={setBankOtp}
            error={otpError}
            isLoading={isLoading}
            onVerify={handleVerifyBankOtp}
            onBack={() => setStep('select-bank')}
          />
        );

      case 'set-mpin':
        return (
          <SetMpinStep
            vpa={generatedVpa}
            mpin={mpin}
            setMpin={setMpin}
            confirmMpin={confirmMpin}
            setConfirmMpin={setConfirmMpin}
            error={mpinError}
            isLoading={isLoading}
            onSetMpin={handleSetMpin}
          />
        );

      case 'success':
        return (
          <SuccessStep
            vpa={generatedVpa}
            bankName={selectedBank?.bankName || ''}
            onComplete={handleComplete}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Progress bar */}
      <div className="h-1 bg-slate-800">
        <motion.div
          className="h-full bg-gradient-to-r from-primary-500 to-accent-500"
          initial={{ width: '0%' }}
          animate={{
            width: step === 'welcome' ? '20%' :
                   step === 'select-bank' ? '40%' :
                   step === 'bank-otp' ? '60%' :
                   step === 'set-mpin' ? '80%' : '100%'
          }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md"
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

interface WelcomeStepProps {
  userName: string;
  isLoading: boolean;
  onGetStarted: () => void;
  onSkip: () => void;
}

const WelcomeStep = ({ userName, isLoading, onGetStarted, onSkip }: WelcomeStepProps) => {
  return (
    <div className="text-center space-y-8">
      {/* Icon */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, type: 'spring' }}
        className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center"
      >
        <Sparkles className="w-12 h-12 text-primary-400" />
      </motion.div>

      {/* Text */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-white">
          Welcome, {userName}! 🎉
        </h1>
        <p className="text-slate-400 text-lg">
          Let's set up your account to start making instant UPI payments
        </p>
      </div>

      {/* Features */}
      <div className="space-y-4 text-left">
        {[
          { icon: Building2, text: 'Link your bank account' },
          { icon: CreditCard, text: 'Get your unique UPI ID' },
          { icon: Shield, text: 'Secure & instant transfers' },
        ].map((feature, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 + idx * 0.1 }}
            className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800"
          >
            <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
              <feature.icon className="w-5 h-5 text-primary-400" />
            </div>
            <span className="text-white font-medium">{feature.text}</span>
          </motion.div>
        ))}
      </div>

      {/* Actions */}
      <div className="space-y-3 pt-4">
        <Button
          fullWidth
          size="lg"
          isLoading={isLoading}
          onClick={onGetStarted}
          rightIcon={<ArrowRight size={20} />}
        >
          Get Started
        </Button>

        <button
          onClick={onSkip}
          className="text-slate-500 hover:text-slate-400 text-sm transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
};

interface SelectBankStepProps {
  banks: Bank[];
  isLoading: boolean;
  onSelectBank: (bank: Bank) => void;
  selectedBank: Bank | null;
}

const SelectBankStep = ({ banks, isLoading, onSelectBank, selectedBank }: SelectBankStepProps) => {
  // Bank icons/colors mapping
  const bankColors: Record<string, string> = {
    'AXIS': 'from-pink-500 to-purple-600',
    'SBI': 'from-blue-500 to-blue-700',
    'HDFC': 'from-blue-600 to-red-500',
    'ICICI': 'from-orange-500 to-red-600',
    'DEFAULT': 'from-slate-600 to-slate-700',
  };

  const getBankGradient = (bankCode: string) => {
    return bankColors[bankCode] || bankColors['DEFAULT'];
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">Select Your Bank</h2>
        <p className="text-slate-400">Choose your primary bank account</p>
      </div>

      {/* Bank List */}
      <div className="space-y-3 max-h-[50vh] overflow-y-auto scrollbar-thin pr-2">
        {banks.map((bank) => (
          <motion.button
            key={bank.bankHandle}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectBank(bank)}
            disabled={isLoading && selectedBank?.bankHandle === bank.bankHandle}
            className={`w-full p-4 rounded-xl border transition-all flex items-center gap-4
              ${selectedBank?.bankHandle === bank.bankHandle && isLoading
                ? 'border-primary-500 bg-primary-500/10'
                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
              }`}
          >
            {/* Bank Icon */}
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${getBankGradient(bank.bankHandle)} flex items-center justify-center`}>
              <Building2 className="w-6 h-6 text-white" />
            </div>

            {/* Bank Info */}
            <div className="flex-1 text-left">
              <h3 className="font-semibold text-white">{bank.bankName}</h3>
              <p className="text-sm text-slate-500">{bank.bankHandle}</p>
            </div>

            {/* Loading/Arrow */}
            {isLoading && selectedBank?.bankHandle === bank.bankHandle ? (
              <Spinner size="sm" />
            ) : (
              <ChevronRight className="w-5 h-5 text-slate-500" />
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
};

interface BankOtpStepProps {
  bankName: string;
  otp: string;
  setOtp: (value: string) => void;
  error: string;
  isLoading: boolean;
  onVerify: () => void;
  onBack: () => void;
}

const BankOtpStep = ({ bankName, otp, setOtp, error, isLoading, onVerify, onBack }: BankOtpStepProps) => {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-white">Verify Bank Account</h2>
        <p className="text-slate-400">
          Enter the OTP sent by <span className="text-white">{bankName}</span>
        </p>
      </div>

      <div className="glass rounded-2xl p-6 space-y-6">
        <OtpInput
          length={6}
          value={otp}
          onChange={setOtp}
          error={error}
          disabled={isLoading}
        />

        <Button
          fullWidth
          size="lg"
          isLoading={isLoading}
          onClick={onVerify}
          disabled={otp.length !== 6}
          rightIcon={<CheckCircle2 size={20} />}
        >
          Verify & Link Account
        </Button>
      </div>

      <button
        onClick={onBack}
        className="w-full text-center text-slate-400 hover:text-white transition-colors"
      >
        Choose different bank
      </button>
    </div>
  );
};

// ============================================
// SET MPIN STEP
// ============================================

interface SetMpinStepProps {
  vpa: string;
  mpin: string;
  setMpin: (value: string) => void;
  confirmMpin: string;
  setConfirmMpin: (value: string) => void;
  error: string;
  isLoading: boolean;
  onSetMpin: () => void;
}

const SetMpinStep = ({ 
  vpa, 
  mpin, 
  setMpin, 
  confirmMpin, 
  setConfirmMpin, 
  error, 
  isLoading, 
  onSetMpin 
}: SetMpinStepProps) => {
  const [showMpin, setShowMpin] = useState(false);
  const [showConfirmMpin, setShowConfirmMpin] = useState(false);

  const handleMpinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setMpin(value);
  };

  const handleConfirmMpinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setConfirmMpin(value);
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center mb-4"
        >
          <Lock className="w-8 h-8 text-primary-400" />
        </motion.div>
        <h2 className="text-2xl font-bold text-white">Set Your MPIN</h2>
        <p className="text-slate-400">Create a 6-digit MPIN to secure your transactions</p>
      </div>

      {/* VPA Display */}
      <div className="glass rounded-xl p-4 text-center">
        <p className="text-xs text-slate-500 mb-1">Your UPI ID</p>
        <p className="text-lg font-semibold gradient-text">{vpa}</p>
      </div>

      {/* MPIN Inputs */}
      <div className="space-y-4">
        {/* Enter MPIN */}
        <div className="space-y-2">
          <label className="text-sm text-slate-400">Enter MPIN</label>
          <div className="relative">
            <input
              type={showMpin ? 'text' : 'password'}
              value={mpin}
              onChange={handleMpinChange}
              placeholder="••••••"
              maxLength={6}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl text-white text-center text-2xl tracking-[0.5em] placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:border-primary-500 transition-colors"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowMpin(!showMpin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
            >
              {showMpin ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {/* Confirm MPIN */}
        <div className="space-y-2">
          <label className="text-sm text-slate-400">Confirm MPIN</label>
          <div className="relative">
            <input
              type={showConfirmMpin ? 'text' : 'password'}
              value={confirmMpin}
              onChange={handleConfirmMpinChange}
              placeholder="••••••"
              maxLength={6}
              className="w-full px-4 py-3 bg-slate-900/50 border border-slate-800 rounded-xl text-white text-center text-2xl tracking-[0.5em] placeholder:tracking-normal placeholder:text-slate-600 focus:outline-none focus:border-primary-500 transition-colors"
              disabled={isLoading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmMpin(!showConfirmMpin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
            >
              {showConfirmMpin ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-red-400 text-center"
          >
            {error}
          </motion.p>
        )}

        {/* MPIN Requirements */}
        <div className="bg-slate-900/30 rounded-xl p-4 space-y-2">
          <p className="text-xs text-slate-500 font-medium">MPIN Requirements:</p>
          <ul className="text-xs text-slate-400 space-y-1">
            <li className={`flex items-center gap-2 ${mpin.length === 6 ? 'text-success-400' : ''}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${mpin.length === 6 ? 'bg-success-400' : 'bg-slate-600'}`} />
              Must be exactly 6 digits
            </li>
            <li className={`flex items-center gap-2 ${/^\d+$/.test(mpin) && mpin.length > 0 ? 'text-success-400' : ''}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${/^\d+$/.test(mpin) && mpin.length > 0 ? 'bg-success-400' : 'bg-slate-600'}`} />
              Numbers only
            </li>
            <li className={`flex items-center gap-2 ${mpin === confirmMpin && mpin.length === 6 ? 'text-success-400' : ''}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${mpin === confirmMpin && mpin.length === 6 ? 'bg-success-400' : 'bg-slate-600'}`} />
              Both MPINs must match
            </li>
          </ul>
        </div>
      </div>

      {/* Set MPIN Button */}
      <Button
        fullWidth
        size="lg"
        isLoading={isLoading}
        onClick={onSetMpin}
        disabled={mpin.length !== 6 || confirmMpin.length !== 6 || mpin !== confirmMpin}
        rightIcon={<Shield size={20} />}
      >
        Set MPIN & Complete
      </Button>

      {/* Security Note */}
      <p className="text-xs text-slate-500 text-center">
        🔒 Your MPIN is encrypted and never stored in plain text
      </p>
    </div>
  );
};

interface SuccessStepProps {
  vpa: string;
  bankName: string;
  onComplete: () => void;
}

const SuccessStep = ({ vpa, bankName, onComplete }: SuccessStepProps) => {
  return (
    <div className="text-center space-y-8">
      {/* Success Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', delay: 0.2 }}
        className="mx-auto w-24 h-24 rounded-full bg-success-500/20 flex items-center justify-center"
      >
        <CheckCircle2 className="w-14 h-14 text-success-400" />
      </motion.div>

      {/* Text */}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-white">You're All Set! 🎉</h1>
        <p className="text-slate-400">
          Your {bankName} account is now linked
        </p>
      </div>

      {/* VPA Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="glass rounded-2xl p-6 space-y-2"
      >
        <p className="text-sm text-slate-400">Your UPI ID</p>
        <p className="text-2xl font-bold gradient-text">{vpa}</p>
        <p className="text-xs text-slate-500">Share this ID to receive money</p>
      </motion.div>

      {/* Complete Button */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
      >
        <Button
          fullWidth
          size="lg"
          onClick={onComplete}
          rightIcon={<ArrowRight size={20} />}
        >
          Go to Dashboard
        </Button>
      </motion.div>
    </div>
  );
};

export default OnboardingPage;
