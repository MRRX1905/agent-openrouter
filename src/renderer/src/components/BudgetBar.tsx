import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function BudgetBar() {
  const [state, setState] = useState({ used: 0, cap: 50, reservePct: 20 });
  useEffect(() => {
    void api.invoke('budget:get', {}).then(setState);
  }, []);
  const reserve = Math.ceil((state.cap * state.reservePct) / 100);
  return (
    <div className="budget">
      <span>{state.used}/{state.cap} request hari ini</span>
      <progress value={state.used} max={state.cap} />
      <small>reserve repair: {reserve}</small>
    </div>
  );
}
