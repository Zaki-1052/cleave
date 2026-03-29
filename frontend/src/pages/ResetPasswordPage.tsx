// frontend/src/pages/ResetPasswordPage.tsx
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '@/api/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/layout/Card';
import { GradientBackground } from '@/components/layout/GradientBackground';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return <Navigate to="/forgot-password" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token!, password);
      setSuccess(true);
    } catch {
      setError('Invalid or expired reset link. Please request a new one.');
    }
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
            Set New Password
          </h1>

          {success ? (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-gray-600">
                Your password has been reset successfully.
              </p>
              <Button asChild>
                <Link to="/login">Sign In</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                label="New Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Input
                label="Confirm Password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {error && (
                <p className="text-sm text-red-500">
                  {error}{' '}
                  {error.includes('expired') && (
                    <Link to="/forgot-password" className="text-primary hover:underline">
                      Request a new link
                    </Link>
                  )}
                </p>
              )}
              <Button type="submit" loading={loading}>
                Reset Password
              </Button>
            </form>
          )}
        </Card>
      </div>
    </GradientBackground>
  );
}
