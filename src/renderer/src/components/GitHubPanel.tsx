import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export default function GitHubPanel() {
  const [userCode, setUserCode] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
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

  return (
    <section className="card">
      <h3>GitHub</h3>
      <button onClick={() => void connect()}>Hubungkan GitHub</button>
      <button onClick={() => void disconnect()}>Disconnect</button>
      {userCode && <p>Kode: <strong>{userCode}</strong></p>}
      {status && <p>{status}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
