// frontend/src/pages/RegisterPage.tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/layout/Card';
import { GradientBackground } from '@/components/layout/GradientBackground';
import { CleaveIcon } from '@/components/ui/CleaveIcon';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await register(email, password, firstName || undefined, lastName || undefined);
      navigate('/dashboard');
    } catch {
      setError('Registration failed. Email may already be in use.');
    }
  }

  return (
    <GradientBackground>
      <div className="flex min-h-screen flex-col items-center justify-center">
        <div className="mb-8 flex flex-col items-center text-center">
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl shadow-lg"
            style={{ background: 'linear-gradient(135deg, #4AAED9, #00BCD4)' }}
          >
            <CleaveIcon size={36} />
          </div>
          <h2 className="font-display text-3xl font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">
            Cleave
          </h2>
          <p className="mt-1 text-sm text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
            CUT&amp;RUN Analysis Platform
          </p>
        </div>
        <Card className="w-full max-w-md border border-white/50 dark:border-white/10">
          <h1 className="mb-6 text-center font-display text-2xl font-bold text-foreground">Create Account</h1>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Input
              label="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              label="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit">Register</Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-primary hover:underline">
                Sign In
              </Link>
            </p>
          </form>
        </Card>
      </div>
    </GradientBackground>
  );
}
