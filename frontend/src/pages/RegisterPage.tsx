// frontend/src/pages/RegisterPage.tsx
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuthLayout } from '@/components/layout/AuthLayout';

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
    <AuthLayout title="Create Account">
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
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit">Register</Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:underline">
            Sign In
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
