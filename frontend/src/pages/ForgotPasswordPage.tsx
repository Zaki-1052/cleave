// frontend/src/pages/ForgotPasswordPage.tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '@/api/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/layout/Card';
import { GradientBackground } from '@/components/layout/GradientBackground';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
    } catch {
      // Always show success to prevent email enumeration
    }
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <GradientBackground>
      <div className="flex min-h-screen flex-col items-center justify-center">
        <div className="mb-8 text-center">
          <h2 className="font-display text-3xl font-bold text-white">Cleave</h2>
          <p className="mt-1 text-sm text-white/70">CUT&RUN Analysis Platform</p>
        </div>
        <Card className="w-full max-w-md border border-white/50">
          <h1 className="mb-6 text-center font-display text-2xl font-bold text-gray-800">
            Reset Your Password
          </h1>

          {submitted ? (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-gray-600">
                If an account exists with that email, we've sent a password reset link.
                Please check your inbox.
              </p>
              <Link to="/login" className="text-sm text-primary hover:underline">
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-gray-500">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <Input
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Button type="submit" loading={loading}>
                Send Reset Link
              </Button>
              <p className="text-center text-sm text-gray-500">
                <Link to="/login" className="text-primary hover:underline">
                  Back to Sign In
                </Link>
              </p>
            </form>
          )}
        </Card>
      </div>
    </GradientBackground>
  );
}
