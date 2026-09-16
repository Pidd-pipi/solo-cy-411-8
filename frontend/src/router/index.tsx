import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../App';
import { Dashboard } from '../pages/Dashboard';
import { Activities } from '../pages/Activities';
import { Goals } from '../pages/Goals';
import { Ranking } from '../pages/Ranking';
import { Profile } from '../pages/Profile';
import { AuditLog } from '../pages/AuditLog';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'activities', element: <Activities /> },
      { path: 'goals', element: <Goals /> },
      { path: 'ranking', element: <Ranking /> },
      { path: 'profile', element: <Profile /> },
      { path: 'audit', element: <AuditLog /> }
    ]
  }
]);

