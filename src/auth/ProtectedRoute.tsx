import { Navigate, Outlet } from 'react-router-dom';
import type { Role } from '../types';
import { accueilPour } from '../components/layout/navigation';
import { getDB } from '../db/store';
import { useAuth } from './AuthContext';

interface ProtectedRouteProps {
  roles: Role[];
}

export default function ProtectedRoute({ roles }: ProtectedRouteProps) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={accueilPour(getDB(), user)} replace />;
  return <Outlet />;
}
