import { useEffect, useState } from 'react';
import * as evaluationService from '../../services/evaluationService';
import { IconCheckCircle, IconAlert, IconChecklist } from '../icons';
import '../../styles/evaluation.css';

const CRITERIA = [
  { key: 'delais', label: 'Respect des délais et fiabilité' },
  { key: 'qualite', label: 'Qualité des livrables et Rigueur' },
  { key: 'autonomie', label: 'Autonomie et Résolution de problème' },
  { key: 'adaptabilite', label: 'Adaptabilité et Évolution' },
];

function monthLabel(key) {
  const [y, m] = String(key).split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function RemarkItem({ item }) {
  const good = item.rating === 'good';
  return (
    <li className={`myeval-remark myeval-remark--${good ? 'good' : 'bad'}`}>
      <span className="myeval-remark-icon">{good ? <IconCheckCircle /> : <IconAlert />}</span>
      <span className="myeval-remark-text">{item.comment}</span>
    </li>
  );
}

// Vue employé de ses évaluations mensuelles : commentaire global toujours visible,
// détail des critères seulement si l'admin l'a partagé.
export default function MyEvaluations() {
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    evaluationService
      .getMyEvaluations()
      .then((data) => setEvaluations(Array.isArray(data) ? data : []))
      .catch(() => setEvaluations([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <article className="profile-panel">
      <header className="profile-panel-header">
        <h2>
          <IconChecklist /> Mes évaluations
        </h2>
        <p>Retours mensuels de votre responsable.</p>
      </header>

      {loading ? (
        <p className="myeval-empty">Chargement…</p>
      ) : evaluations.length === 0 ? (
        <p className="myeval-empty">Aucune évaluation partagée pour le moment.</p>
      ) : (
        <div className="myeval-list">
          {evaluations.map((ev) => (
            <div className="myeval-item" key={ev.id}>
              <div className="myeval-item-head">
                <span className="myeval-month">{monthLabel(ev.month)}</span>
              </div>

              {ev.global_comment && <p className="myeval-global">{ev.global_comment}</p>}

              {ev.criteria_hidden ? (
                <p className="myeval-hidden">Le détail par critère n'a pas été partagé pour ce mois.</p>
              ) : (
                <div className="myeval-criteria">
                  {CRITERIA.map(({ key, label }) => {
                    const items = Array.isArray(ev[`${key}_items`]) ? ev[`${key}_items`] : [];
                    return (
                      <div className="myeval-criterion" key={key}>
                        <span className="myeval-criterion-label">{label}</span>
                        {items.length === 0 ? (
                          <p className="myeval-none">Aucune remarque.</p>
                        ) : (
                          <ul className="myeval-remarks">
                            {items.map((item, i) => (
                              <RemarkItem item={item} key={i} />
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
