import { useEffect, useRef, useState } from 'react';
import type { IpcContract } from '@shared/ipc-contract';
import { api } from '../lib/api';

type Preflight = IpcContract['github:preflight']['res'];

export default function GitHubPanel({ projectId }: { projectId: string }) {
  const [userCode, setUserCode] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [repoName, setRepoName] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [repoUrl, setRepoUrl] = useState('');
  const [check, setCheck] = useState<Preflight | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => stop, []);

  const connect = async () => {
    stop();
    setError('');
    try {
      const start = await api.invoke('github:startDeviceFlow');
      setUserCode(start.userCode);
      setStatus(`Buka ${start.verificationUri} dan masukkan kode.`);
      timer.current = setInterval(async () => {
        try {
          const result = await api.invoke('github:pollDeviceFlow');
          if (result.status === 'connected') {
            stop();
            setStatus(`Terhubung sebagai ${result.login ?? 'GitHub user'}.`);
          } else if (result.status === 'expired') {
            stop();
            setStatus('Kode kedaluwarsa. Coba lagi.');
          }
        } catch (cause) {
          stop();
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }, 5000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const disconnect = async () => {
    stop();
    await api.invoke('github:disconnect');
    setUserCode('');
    setStatus('Terputus.');
  };

  const runPreflight = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await api.invoke('github:preflight', { projectId });
      setCheck(result);
      setStatus(`Preflight lulus: ${result.files.length} file. Publish masih memerlukan persetujuan.`);
    } catch (cause) {
      setCheck(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await api.invoke('github:publish', { projectId, repoName: repoName.trim(), visibility });
      setRepoUrl(result.repoUrl);
      setStatus(`Push selesai (${result.commitSha.slice(0, 7)}).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <h3>GitHub</h3>
      <button onClick={() => void connect()}>Hubungkan GitHub</button>
      <button onClick={() => void disconnect()}>Disconnect</button>
      {userCode && <p>Kode: <strong>{userCode}</strong></p>}
      {status && <p>{status}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="row">
        <input
          value={repoName}
          onChange={(event) => setRepoName(event.target.value)}
          placeholder="repo-name"
          aria-label="Nama repository"
        />
        <select
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as 'private' | 'public')}
          aria-label="Visibilitas repository"
        >
          <option value="private">Private</option>
          <option value="public">Public</option>
        </select>
        <button disabled={busy || !repoName.trim()} onClick={() => void runPreflight()}>Preflight</button>
        <button disabled={busy || !repoName.trim()} onClick={() => void publish()}>Publish</button>
      </div>
      <p>Publish memerlukan persetujuan di ApprovalModal. Tanpa persetujuan, repo tidak dibuat dan push tidak dijalankan.</p>
      {check && (
        <p>
          {check.files.length} file · git {check.gitAvailable ? 'ok' : 'tidak tersedia'} · auth {check.authenticated ? 'ok' : 'tidak'} ·
          remote {check.hasRemote ? 'ada' : 'belum ada'} · {check.dirty ? 'ada perubahan belum di-commit' : 'bersih'}
        </p>
      )}
      {repoUrl && <p>Repo: {repoUrl}</p>}
    </section>
  );
}
