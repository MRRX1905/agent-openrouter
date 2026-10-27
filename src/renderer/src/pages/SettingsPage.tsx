import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AppSettings } from '@shared/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    void api.invoke('settings:get').then(setSettings);
  }, []);

  if (!settings) return <p>Memuat pengaturan…</p>;

  const save = async () => {
    const next = await api.invoke('settings:update', {
      model: settings.model,
      dailyRequestCap: settings.dailyRequestCap,
      repairReservePct: settings.repairReservePct,
      workspaceRoot: settings.workspaceRoot,
      mode: settings.mode,
      githubClientId: settings.githubClientId,
    });
    setSettings(next);
    setMessage('Pengaturan disimpan.');
  };

  const saveKey = async () => {
    await api.invoke('secret:setOpenRouterKey', { apiKey });
    setApiKey('');
    setSettings(await api.invoke('settings:get'));
    setMessage('API key disimpan terenkripsi.');
  };

  return (
    <section>
      <h2>Pengaturan</h2>
      <label>Model <input value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} /></label>
      <label>Batas request/hari <input type="number" min={1} max={1000} value={settings.dailyRequestCap} onChange={(e) => setSettings({ ...settings, dailyRequestCap: Number(e.target.value) })} /></label>
      <label>Reserve repair (%) <input type="number" min={0} max={80} value={settings.repairReservePct} onChange={(e) => setSettings({ ...settings, repairReservePct: Number(e.target.value) })} /></label>
      <label>Folder workspace <input value={settings.workspaceRoot} onChange={(e) => setSettings({ ...settings, workspaceRoot: e.target.value })} /></label>
      <label>Mode
        <select value={settings.mode} onChange={(e) => setSettings({ ...settings, mode: e.target.value as AppSettings['mode'] })}>
          <option value="auto">Auto Build</option>
          <option value="supervised">Supervised Build</option>
          <option value="repair">Repair Existing Project</option>
        </select>
      </label>
      <label>GitHub OAuth Client ID <input value={settings.githubClientId} onChange={(e) => setSettings({ ...settings, githubClientId: e.target.value })} /></label>
      <button onClick={() => void save()}>Simpan</button>

      <h3>OpenRouter API Key</h3>
      <p>{settings.hasOpenRouterKey ? 'Tersimpan.' : 'Belum ada.'}</p>
      <input type="password" value={apiKey} placeholder="sk-or-v1-..." onChange={(e) => setApiKey(e.target.value)} />
      <button disabled={!apiKey} onClick={() => void saveKey()}>Simpan key</button>
      <button onClick={() => void api.invoke('secret:clearOpenRouterKey').then(() => api.invoke('settings:get')).then(setSettings)}>Hapus key</button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
