import { useState } from 'react';
import DashboardPage from './pages/DashboardPage';
import NewProjectPage from './pages/NewProjectPage';
import ProjectPage from './pages/ProjectPage';
import SettingsPage from './pages/SettingsPage';
import SkillsPage from './pages/SkillsPage';

type Page =
  | { name: 'dashboard' }
  | { name: 'new' }
  | { name: 'skills' }
  | { name: 'settings' }
  | { name: 'project'; projectId: string };

export default function App() {
  const [page, setPage] = useState<Page>({ name: 'dashboard' });
  return (
    <div className="shell">
      <nav className="sidebar">
        <h1>R3X Agent Studio</h1>
        <button onClick={() => setPage({ name: 'dashboard' })}>Dashboard</button>
        <button onClick={() => setPage({ name: 'new' })}>Proyek Baru</button>
        <button onClick={() => setPage({ name: 'skills' })}>Skills</button>
        <button onClick={() => setPage({ name: 'settings' })}>Pengaturan</button>
      </nav>
      <main className="content">
        {page.name === 'dashboard' && (
          <DashboardPage onNew={() => setPage({ name: 'new' })} onOpen={(projectId) => setPage({ name: 'project', projectId })} />
        )}
        {page.name === 'new' && <NewProjectPage onCreated={(projectId) => setPage({ name: 'project', projectId })} />}
        {page.name === 'skills' && <SkillsPage />}
        {page.name === 'settings' && <SettingsPage />}
        {page.name === 'project' && <ProjectPage projectId={page.projectId} />}
      </main>
    </div>
  );
}
