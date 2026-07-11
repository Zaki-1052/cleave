// frontend/src/pages/ForgotPasswordPage.tsx
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '@/api/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthLayout } from '@/components/layout/AuthLayout';

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
    <AuthLayout title="Reset Your Password">
      {submitted ? (
        <div className="flex flex-col gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            If an account exists with that email, we've sent a password reset link.
            Please check your inbox.
          </p>
          <Link to="/login" className="text-sm text-primary hover:underline">
            Back to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
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
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary hover:underline">
              Back to Sign In
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
