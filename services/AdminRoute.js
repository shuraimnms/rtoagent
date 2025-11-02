import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Layout from '../../components/layout/Layout';

const AdminRoute = () => {
  const { isAdmin } = useAuth();

  return isAdmin ? <Layout><Outlet /></Layout> : <Navigate to="/dashboard" />;
};

export default AdminRoute;