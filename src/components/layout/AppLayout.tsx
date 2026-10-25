import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { syncServerTime } from '../../lib/serverTime';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppLayout() {
  // Les évolutions de carrière et sorties arrivées à échéance sont appliquées par le serveur (tâche planifiée)
  useEffect(() => {
    void syncServerTime();
  }, []);

  return (
    <div className="bg-[#0b0f19] text-slate-100 font-sans min-h-screen selection:bg-brand-500/30 selection:text-brand-300 flex">
      <Sidebar />
      <div className="pl-64 flex-1 min-w-0 flex flex-col min-h-screen">
        <Topbar />
        <main className="flex-1 p-8 max-w-7xl w-full mx-auto flex flex-col gap-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
