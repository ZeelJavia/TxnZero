import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, ArrowRight, ArrowLeft, User, Lock, CheckCircle2, LogIn, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthLayout } from '../../components/layout';
import { Button, Input, OtpInput } from '../../components/ui';
import { authApi } from '../../services/api';
import { useAuthStore, type User as UserType } from '../../store';
import { validatePhoneNumber, getDeviceId, getDeviceInfo } from '../../utils';
import type { AuthStep } from '../../types';

// ============================================
// AUTH PAGE - Login & Registration
// ============================================

type AuthMode = 'select' | 'login' | 'register';

// Helper to map backend response to User type
const mapResponseToUser = (data: Record<string, unknown>): UserType => ({
  userId: Number(data.userId) || 0,
  phoneNumber: String(data.phoneNumber || ''),
  fullName: String(data.fullName || ''),
  vpa: data.vpa ? String(data.vpa) : null,
  kycStatus: (data.kycStatus as UserType['kycStatus']) || 'PENDING',
  createdAt: data.createdAt ? String(data.createdAt) : new Date().toISOString(),
});

export const AuthPage = () => {
  const navigate = useNavigate();
  const { setUser, setAuthenticated } = useAuthStore();

  // Auth mode: login or register
  const [authMode, setAuthMode] = useState<AuthMode>('select');
  
  // State
  const [step, setStep] = useState<AuthStep>('phone');
  const [isLoading, setIsLoading] = useState(false);
  const [needsDeviceVerification, setNeedsDeviceVerification] = useState(false);

  // Form Data
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Errors
  const [phoneError, setPhoneError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Step 1: Send OTP
  const handleSendOtp = async () => {
    setPhoneError('');
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    if (!validatePhoneNumber(cleanPhone)) {
      setPhoneError('Please enter a valid 10-digit mobile number');
      return;
    }

    setIsLoading(true);
    try {
      const response = await authApi.sendOtp(cleanPhone);
      if (response.data.statusCode === 200) {
        toast.success('OTP sent successfully!');
        setStep('otp');
      } else {
        throw new Error(response.data.message);
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || 'Failed to send OTP';
      setPhoneError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async () => {
    setOtpError('');
    if (otp.length !== 6) {
      setOtpError('Please enter a valid 6-digit OTP');
      return;
    }

    setIsLoading(true);
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const response = await authApi.verifyOtp(cleanPhone, otp);
      
      if (response.data.statusCode === 200) {
        toast.success('OTP verified!');
        // After OTP verification, user needs to complete registration
        // (Backend creates a minimal user record, we need to add password/name)
        setStep('register');
      } else {
        throw new Error(response.data.message);
      }
    } catch (error: any) {
      const msg = error.response?.data?.message || 'OTP verification failed';
      setOtpError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Complete Registration
  const handleRegister = async () => {
    setPasswordError('');

    if (!fullName.trim()) {
      toast.error('Please enter your name');
      return;
    }

    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const deviceId = getDeviceId();
      const { modelName, osVersion } = getDeviceInfo();

      const response = await authApi.register({
        phoneNumber: cleanPhone,
        password,
        fullName,
        deviceId,
        lastLoginIp: '', // Will be detected by backend
        modelName,
        osVersion,
      });

      if ((response.data.statusCode === 200 || response.data.statusCode === 201) && response.data.data) {
        toast.success('Registration successful!');
        const userData = mapResponseToUser(response.data.data);
        setUser(userData);
        setAuthenticated(true);
        navigate('/onboarding');
      } else {
        throw new Error(response.data.message);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Registration failed');
    } finally {
      setIsLoading(false);
    }
  };
  // Step 3 (Alt): Login for existing users
  const handleLogin = async () => {
    if (password.length < 4) {
      setPasswordError('Please enter your password');
      return;
    }

    setIsLoading(true);
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const deviceId = getDeviceId();

      const response = await authApi.login(cleanPhone, password, deviceId);

      if (response.data.statusCode === 200 && response.data.data) {
        // Login successful - map response to User type
        toast.success('Login successful!');
        const userData = mapResponseToUser(response.data.data);
        setUser(userData);
        setAuthenticated(true);
        navigate('/dashboard');
      } else if (response.data.message?.includes('OTP') || response.data.statusCode === 202) {
        // New device detected - OTP sent for verification
        toast('New device detected. Please verify with OTP.', { icon: '🔐' });
        setNeedsDeviceVerification(true);
        setStep('otp');
      } else {
        throw new Error(response.data.message);
      }
    } catch (error: any) {
      const msg = error.response?.data?.message || 'Login failed';
      
      // Check if OTP was sent for new device
      if (msg.includes('OTP') || error.response?.status === 202) {
        toast('New device detected. Please verify with OTP.', { icon: '🔐' });
        setNeedsDeviceVerification(true);
        setStep('otp');
      } else {
        setPasswordError(msg);
        toast.error(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Verify OTP for device change (login flow)
  const handleVerifyDeviceOtp = async () => {
    setOtpError('');
    if (otp.length !== 6) {
      setOtpError('Please enter a valid 6-digit OTP');
      return;
    }

    setIsLoading(true);
    try {
      const cleanPhone = phoneNumber.replace(/\D/g, '');
      const deviceId = getDeviceId();
      const { modelName, osVersion } = getDeviceInfo();

      const response = await authApi.changeDevice({
        phoneNumber: cleanPhone,
        otp,
        deviceId,
        lastLoginIp: '', // Will be detected by backend
        modelName,
        osVersion,
      });

      if (response.data.statusCode === 200 && response.data.data) {
        toast.success('Device verified! Login successful.');
        const userData = mapResponseToUser(response.data.data);
        setUser(userData);
        setAuthenticated(true);
        navigate('/dashboard');
      } else {
        throw new Error(response.data.message);
      }
    } catch (error: any) {
      const msg = error.response?.data?.message || 'OTP verification failed';
      setOtpError(msg);
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };
  // Resend OTP
  const handleResendOtp = async () => {
    setOtp('');
    if (needsDeviceVerification) {
      // For device verification, re-attempt login to trigger OTP
      await handleLogin();
    } else {
      await handleSendOtp();
    }
  };

  // Go back
  const handleBack = () => {
    if (step === 'otp') {
      if (needsDeviceVerification) {
        setStep('login');
        setNeedsDeviceVerification(false);
      } else {
        setStep('phone');
      }
      setOtp('');
    } else if (step === 'register') {
      setStep('otp');
      setPassword('');
      setConfirmPassword('');
    } else if (step === 'login') {
      setStep('phone');
      setPassword('');
    } else if (step === 'phone') {
      setAuthMode('select');
      setPhoneNumber('');
      setPhoneError('');
    }
  };

  // Render current step
  const renderStep = () => {
    // Show mode selection first
    if (authMode === 'select') {
      return (
        <ModeSelectStep
          onSelectLogin={() => {
            setAuthMode('login');
            setStep('phone');
          }}
          onSelectRegister={() => {
            setAuthMode('register');
            setStep('phone');
          }}
        />
      );
    }

    switch (step) {
      case 'phone':
        return (
          <PhoneStep
            phoneNumber={phoneNumber}
            setPhoneNumber={setPhoneNumber}
            error={phoneError}
            isLoading={isLoading}
            onSubmit={authMode === 'login' ? () => setStep('login') : handleSendOtp}
            authMode={authMode}
            onBack={handleBack}
          />
        );

      case 'otp':
        return (
          <OtpStep
            phoneNumber={phoneNumber}
            otp={otp}
            setOtp={setOtp}
            error={otpError}
            isLoading={isLoading}
            onSubmit={needsDeviceVerification ? handleVerifyDeviceOtp : handleVerifyOtp}
            onResend={handleResendOtp}
            onBack={handleBack}
            isDeviceVerification={needsDeviceVerification}
          />
        );

      case 'register':
        return (
          <RegisterStep
            fullName={fullName}
            setFullName={setFullName}
            password={password}
            setPassword={setPassword}
            confirmPassword={confirmPassword}
            setConfirmPassword={setConfirmPassword}
            error={passwordError}
            isLoading={isLoading}
            onSubmit={handleRegister}
            onBack={handleBack}
          />
        );

      case 'login':
        return (
          <LoginStep
            phoneNumber={phoneNumber}
            password={password}
            setPassword={setPassword}
            error={passwordError}
            isLoading={isLoading}
            onSubmit={handleLogin}
            onBack={handleBack}
          />
        );

      default:
        return null;
    }
  };

  const getTitle = () => {
    if (authMode === 'select') {
      return { title: 'Welcome to LedgerZero', subtitle: 'Secure, fast UPI payments' };
    }
    
    switch (step) {
      case 'phone':
        return authMode === 'login' 
          ? { title: 'Login', subtitle: 'Enter your registered mobile number' }
          : { title: 'Create Account', subtitle: 'Enter your mobile number to get started' };
      case 'otp':
        return needsDeviceVerification
          ? { title: 'Verify New Device', subtitle: `Enter the OTP sent to +91 ${phoneNumber}` }
          : { title: 'Verify OTP', subtitle: `We sent a code to +91 ${phoneNumber}` };
      case 'register':
        return { title: 'Complete Profile', subtitle: 'Set up your account details' };
      case 'login':
        return { title: 'Welcome Back', subtitle: 'Enter your password to continue' };
      default:
        return { title: '', subtitle: '' };
    }
  };

  const { title, subtitle } = getTitle();

  return (
    <AuthLayout title={title} subtitle={subtitle}>
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
    </AuthLayout>
  );
};

// ============================================
// STEP COMPONENTS
// ============================================

// Mode Selection Step
interface ModeSelectStepProps {
  onSelectLogin: () => void;
  onSelectRegister: () => void;
}

const ModeSelectStep = ({ onSelectLogin, onSelectRegister }: ModeSelectStepProps) => {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSelectLogin}
          className="w-full p-5 rounded-2xl bg-gradient-to-r from-primary-500/10 to-primary-600/10 border border-primary-500/30 hover:border-primary-500/50 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-lg">
              <LogIn className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-semibold text-white group-hover:text-primary-400 transition-colors">
                Login
              </h3>
              <p className="text-sm text-slate-400">
                Already have an account? Sign in here
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-primary-400 transition-colors" />
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSelectRegister}
          className="w-full p-5 rounded-2xl bg-gradient-to-r from-accent-500/10 to-accent-600/10 border border-accent-500/30 hover:border-accent-500/50 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent-500 to-accent-600 flex items-center justify-center shadow-lg">
              <UserPlus className="w-7 h-7 text-white" />
            </div>
            <div className="flex-1 text-left">
              <h3 className="text-lg font-semibold text-white group-hover:text-accent-400 transition-colors">
                Create Account
              </h3>
              <p className="text-sm text-slate-400">
                New here? Register to get started
              </p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-accent-400 transition-colors" />
          </div>
        </motion.button>
      </div>

      <p className="text-center text-xs text-slate-500 pt-4">
        By continuing, you agree to our{' '}
        <a href="#" className="text-primary-400 hover:underline">Terms of Service</a>
        {' '}and{' '}
        <a href="#" className="text-primary-400 hover:underline">Privacy Policy</a>
      </p>
    </div>
  );
};

interface PhoneStepProps {
  phoneNumber: string;
  setPhoneNumber: (value: string) => void;
  error: string;
  isLoading: boolean;
  onSubmit: () => void;
  authMode: AuthMode;
  onBack: () => void;
}

const PhoneStep = ({ phoneNumber, setPhoneNumber, error, isLoading, onSubmit, authMode, onBack }: PhoneStepProps) => {
  const handleSubmit = () => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      return;
    }
    onSubmit();
  };

  return (
    <div className="space-y-6">
      <Input
        label="Mobile Number"
        type="tel"
        placeholder="Enter 10-digit mobile number"
        value={phoneNumber}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhoneNumber(e.target.value)}
        error={error}
        leftIcon={<Phone size={20} />}
        autoFocus
      />

      <Button
        fullWidth
        size="lg"
        isLoading={isLoading}
        onClick={handleSubmit}
        rightIcon={<ArrowRight size={20} />}
      >
        {authMode === 'login' ? 'Continue to Login' : 'Send OTP'}
      </Button>

      <button
        onClick={onBack}
        className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={18} />
        <span>Back</span>
      </button>
    </div>
  );
};

interface OtpStepProps {
  phoneNumber: string;
  otp: string;
  setOtp: (value: string) => void;
  error: string;
  isLoading: boolean;
  onSubmit: () => void;
  onResend: () => void;
  onBack: () => void;
  isDeviceVerification?: boolean;
}

const OtpStep = ({ phoneNumber, otp, setOtp, error, isLoading, onSubmit, onResend, onBack, isDeviceVerification }: OtpStepProps) => {
  const [countdown, setCountdown] = useState(30);

  // Countdown timer
  useState(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  });

  return (
    <div className="space-y-6">
      {isDeviceVerification && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-4">
          <p className="text-sm text-amber-400 text-center">
            🔐 New device detected. Please verify to continue.
          </p>
        </div>
      )}

      <p className="text-sm text-slate-400 text-center">
        OTP sent to <span className="text-white font-medium">+91 {phoneNumber}</span>
      </p>

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
        onClick={onSubmit}
        disabled={otp.length !== 6}
        rightIcon={<CheckCircle2 size={20} />}
      >
        {isDeviceVerification ? 'Verify Device' : 'Verify OTP'}
      </Button>

      <div className="text-center">
        {countdown > 0 ? (
          <p className="text-sm text-slate-500">
            Resend OTP in <span className="text-primary-400 font-medium">{countdown}s</span>
          </p>
        ) : (
          <button
            onClick={onResend}
            disabled={isLoading}
            className="text-sm text-primary-400 hover:underline disabled:opacity-50"
          >
            Resend OTP
          </button>
        )}
      </div>

      <button
        onClick={onBack}
        className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={18} />
        <span>Change number</span>
      </button>
    </div>
  );
};

interface RegisterStepProps {
  fullName: string;
  setFullName: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  error: string;
  isLoading: boolean;
  onSubmit: () => void;
  onBack: () => void;
}

const RegisterStep = ({
  fullName, setFullName,
  password, setPassword,
  confirmPassword, setConfirmPassword,
  error, isLoading, onSubmit, onBack
}: RegisterStepProps) => {
  return (
    <div className="space-y-5">
      <Input
        label="Full Name"
        placeholder="Enter your full name"
        value={fullName}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFullName(e.target.value)}
        leftIcon={<User size={20} />}
        autoFocus
      />

      <Input
        label="Password"
        type="password"
        placeholder="Create a password"
        value={password}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
        leftIcon={<Lock size={20} />}
        hint="Minimum 6 characters"
      />

      <Input
        label="Confirm Password"
        type="password"
        placeholder="Confirm your password"
        value={confirmPassword}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
        error={error}
        leftIcon={<Lock size={20} />}
      />

      <Button
        fullWidth
        size="lg"
        isLoading={isLoading}
        onClick={onSubmit}
        rightIcon={<ArrowRight size={20} />}
      >
        Create Account
      </Button>

      <button
        onClick={onBack}
        className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={18} />
        <span>Back</span>
      </button>
    </div>
  );
};

interface LoginStepProps {
  phoneNumber: string;
  password: string;
  setPassword: (value: string) => void;
  error: string;
  isLoading: boolean;
  onSubmit: () => void;
  onBack: () => void;
}

const LoginStep = ({ phoneNumber, password, setPassword, error, isLoading, onSubmit, onBack }: LoginStepProps) => {
  return (
    <div className="space-y-6">
      {/* Phone number display */}
      <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center">
          <Phone className="w-5 h-5 text-primary-400" />
        </div>
        <div>
          <p className="text-xs text-slate-400">Logging in as</p>
          <p className="text-white font-medium">+91 {phoneNumber}</p>
        </div>
      </div>

      <Input
        label="Password"
        type="password"
        placeholder="Enter your password"
        value={password}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
        error={error}
        leftIcon={<Lock size={20} />}
        autoFocus
      />

      <Button
        fullWidth
        size="lg"
        isLoading={isLoading}
        onClick={onSubmit}
        rightIcon={<LogIn size={20} />}
      >
        Login
      </Button>

      <div className="text-center">
        <button className="text-sm text-primary-400 hover:underline">
          Forgot Password?
        </button>
      </div>

      <button
        onClick={onBack}
        className="w-full flex items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={18} />
        <span>Change number</span>
      </button>
    </div>
  );
};

export default AuthPage;
