import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import ProtectedRoute from './auth/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Conges from './pages/employe/Conges';
import Dashboard from './pages/employe/Dashboard';
import Documents from './pages/employe/Documents';
import Pointages from './pages/employe/Pointages';
import Profil from './pages/employe/Profil';
import RhAudit from './pages/rh/Audit';
import RhConges from './pages/rh/Conges';
import RhDashboard from './pages/rh/Dashboard';
import RhDocuments from './pages/rh/Documents';
import RhEmployeFiche from './pages/rh/EmployeFiche';
import RhEmployes from './pages/rh/Employes';
import RhPaie from './pages/rh/Paie';
import RhParametres from './pages/rh/Parametres';
import RhPointages from './pages/rh/Pointages';
import RhRapports from './pages/rh/Rapports';
import RhAbsences from './pages/rh/Absences';
import RhOrganisation from './pages/rh/Organisation';
import AdminDashboard from './pages/admin/Dashboard';
import AdminDemandes from './pages/admin/Demandes';
import AdminUtilisateurs from './pages/admin/Utilisateurs';
import Autorise from './components/layout/Autorise';
import { accueilPour } from './components/layout/navigation';
import { useDB } from './db/store';
import type { Permission } from './types';

/** Écrans de gestion partagés par le RH (selon ses permissions) et l'administrateur */
const ECRANS_GESTION: { chemin: string; permission: Permission | Permission[]; element: JSX.Element }[] = [
  { chemin: 'employes', permission: 'collaborateurs.gerer', element: <RhEmployes /> },
  { chemin: 'employes/:id', permission: 'collaborateurs.gerer', element: <RhEmployeFiche /> },
  { chemin: 'organisation', permission: 'organisation.gerer', element: <RhOrganisation /> },
  { chemin: 'pointages', permission: 'presences.gerer', element: <RhPointages /> },
  { chemin: 'absences', permission: 'absences.gerer', element: <RhAbsences /> },
  { chemin: 'conges', permission: ['conges.valider', 'permissions.valider'], element: <RhConges /> },
  { chemin: 'documents', permission: 'documents.gerer', element: <RhDocuments /> },
  { chemin: 'rapports', permission: 'rapports.consulter', element: <RhRapports /> },
  { chemin: 'audit', permission: 'audit.consulter', element: <RhAudit /> },
  { chemin: 'parametres', permission: 'parametres.gerer', element: <RhParametres /> },
];

function HomeRedirect() {
  const { user } = useAuth();
  const db = useDB();
  return <Navigate to={user ? accueilPour(db, user) : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute roles={['employe']} />}>
        <Route path="/employe" element={<AppLayout />}>
          <Route index element={<Navigate to="tableau-de-bord" replace />} />
          <Route path="tableau-de-bord" element={<Dashboard />} />
          <Route path="pointages" element={<Pointages />} />
          <Route path="conges" element={<Conges />} />
          <Route path="documents" element={<Documents />} />
          <Route path="profil" element={<Profil />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute roles={['rh']} />}>
        <Route path="/rh" element={<AppLayout />}>
          <Route index element={<HomeRedirect />} />
          {ECRANS_GESTION.map(({ chemin, permission, element }) => (
            <Route key={chemin} path={chemin} element={<Autorise permission={permission}>{element}</Autorise>} />
          ))}
          <Route path="tableau-de-bord" element={<Autorise permission="tableau_bord.consulter"><RhDashboard /></Autorise>} />
          <Route path="paie" element={<Autorise permission="paie.gerer"><RhPaie /></Autorise>} />
        </Route>
      </Route>

      {/* Administrateur : tous les droits, mêmes écrans de gestion que le RH + écrans d'administration */}
      <Route element={<ProtectedRoute roles={['admin']} />}>
        <Route path="/admin" element={<AppLayout />}>
          <Route index element={<Navigate to="tableau-de-bord" replace />} />
          <Route path="tableau-de-bord" element={<AdminDashboard />} />
          <Route path="tableau-rh" element={<RhDashboard />} />
          <Route path="demandes" element={<AdminDemandes />} />
          <Route path="utilisateurs" element={<AdminUtilisateurs />} />
          {ECRANS_GESTION.map(({ chemin, element }) => (
            <Route key={chemin} path={chemin} element={element} />
          ))}
        </Route>
      </Route>

      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
