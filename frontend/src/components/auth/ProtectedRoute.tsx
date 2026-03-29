// frontend/src/components/auth/ProtectedRoute.tsx
import { Navigate, Outlet } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
