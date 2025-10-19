import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const AdminRoute = () => {
  const { isAdmin } = useAuth();

  return isAdmin ? <Outlet /> : <Navigate to="/dashboard" />;
};

export default AdminRoute;