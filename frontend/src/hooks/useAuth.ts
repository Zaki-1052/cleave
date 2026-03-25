// frontend/src/hooks/useAuth.ts
import { useContext } from 'react';
import { AuthContext, type AuthContextValue } from '@/contexts/authContextValue';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
