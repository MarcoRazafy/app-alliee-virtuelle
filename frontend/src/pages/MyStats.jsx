import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as statsService from '../services/statsService';
import { formatDurationShort } from '../utils/formatters';
import { notifyError } from '../utils/toast';

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function computeRange(preset) {
  const to = new Date();
  const from = new Date();
  if (preset === 'week') from.setDate(from.getDate() - 6);
  if (preset === 'month') from.setDate(from.getDate() - 29);
  if (preset === 'year') {
    from.setMonth(0);
    from.setDate(1);
  }
  // 'day' : from et to restent tous les deux égaux à aujourd'hui
  return { from: toDateString(from), to: toDateString(to) };
}

function MyStats() {
  const [preset, setPreset] = useState('month');
  const [from, setFrom] = useState(computeRange('month').from);
  const [to, setTo] = useState(computeRange('month').to);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (preset === 'custom') return;
    const range = computeRange(preset);
    setFrom(range.from);
    setTo(range.to);
  }, [preset]);

  useEffect(() => {
    if (!from || !to) return;
    statsService
      .getMyStats(from, to)
      .then(setStats)
      .catch((err) => notifyError(err.response?.data?.error || 'Impossible de charger vos statistiques'));
  }, [from, to]);

  return (
    <div>
      <p>
        <Link to="/dashboard">Retour au tableau de bord</Link>
      </p>
      <h1>Mes statistiques</h1>

      <div>
        <label>
          <input type="radio" checked={preset === 'day'} onChange={() => setPreset('day')} /> Aujourd'hui
        </label>
        <label>
          <input type="radio" checked={preset === 'week'} onChange={() => setPreset('week')} /> Semaine
        </label>
        <label>
          <input type="radio" checked={preset === 'month'} onChange={() => setPreset('month')} /> Mois
        </label>
        <label>
          <input type="radio" checked={preset === 'year'} onChange={() => setPreset('year')} /> Année
        </label>
        <label>
          <input type="radio" checked={preset === 'custom'} onChange={() => setPreset('custom')} /> Personnalisé
        </label>
        {preset === 'custom' && (
          <span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </span>
        )}
      </div>

      {!stats && <p>Chargement...</p>}

      {stats && (
        <>
          <div style={{ display: 'flex', gap: '20px', margin: '20px 0' }}>
            <div style={{ border: '1px solid black', padding: '10px' }}>
              <strong>Tâches complétées</strong>
              <p>{stats.summary.tasks_confirmed}</p>
            </div>
            <div style={{ border: '1px solid black', padding: '10px' }}>
              <strong>Taux de complétion</strong>
              <p>{stats.summary.completion_rate}%</p>
            </div>
            <div style={{ border: '1px solid black', padding: '10px' }}>
              <strong>Temps moyen par tâche</strong>
              <p>{formatDurationShort(stats.summary.average_time_per_task_seconds)}</p>
            </div>
            <div style={{ border: '1px solid black', padding: '10px' }}>
              <strong>Temps travaillé total</strong>
              <p>{formatDurationShort(stats.summary.total_hours_worked_seconds)}</p>
            </div>
          </div>

          <h2>Détail par jour</h2>
          {stats.by_day.length === 0 && <p>Aucune donnée sur cette période.</p>}
          {stats.by_day.length > 0 && (
            <table border="1" cellPadding="6">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Tâches confirmées</th>
                  <th>Temps travaillé</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_day.map((day) => (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    <td>{day.tasks_confirmed}</td>
                    <td>{formatDurationShort(day.hours_worked_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export default MyStats;
