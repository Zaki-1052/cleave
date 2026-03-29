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
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <h1 className="mb-6 text-center text-2xl font-bold text-gray-800">
            Set New Password
          </h1>

          {success ? (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-gray-600">
                Your password has been reset successfully.
              </p>
              <Link
                to="/login"
                className="inline-block rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                Sign In
              </Link>
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
              <Button type="submit" disabled={loading}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </GradientBackground>
  );
}
