// frontend/src/pages/RegisterPage.tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/layout/Card';
import { GradientBackground } from '@/components/layout/GradientBackground';

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
      navigate('/');
    } catch {
      setError('Registration failed. Email may already be in use.');
    }
  }

  return (
    <GradientBackground>
      <div className="flex min-h-screen flex-col items-center justify-center">
        <div className="mb-8 text-center">
          <h2 className="font-display text-3xl font-bold text-white">Cleave</h2>
          <p className="mt-1 text-sm text-white/70">CUT&RUN Analysis Platform</p>
        </div>
        <Card className="w-full max-w-md border border-white/50">
          <h1 className="mb-6 text-center font-display text-2xl font-bold text-gray-800">Create Account</h1>
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
            <p className="text-center text-sm text-gray-500">
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
