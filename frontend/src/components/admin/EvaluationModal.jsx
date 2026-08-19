import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import * as evaluationService from '../../services/evaluationService';
import { notifySuccess, notifyError } from '../../utils/toast';
import { IconX, IconArrowLeft, IconArrowRight, IconCheckCircle, IconAlert, IconPlus } from '../icons';
import '../../styles/evaluation.css';

const CRITERIA = [
  { key: 'delais', label: 'Respect des délais et fiabilité' },
  { key: 'qualite', label: 'Qualité des livrables et Rigueur' },
  { key: 'autonomie', label: 'Autonomie et Résolution de problème' },
  { key: 'adaptabilite', label: 'Adaptabilité et Évolution' },
];
const ITEM_KEYS = CRITERIA.map((c) => `${c.key}_items`);

function toMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
const CURRENT_MONTH = toMonthKey(new Date());
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return toMonthKey(new Date(y, m - 1 + delta, 1));
}
function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function emptyForm() {
  return {
    visible_to_employee: false,
    global_comment: '',
    delais_items: [],
    qualite_items: [],
    autonomie_items: [],
    adaptabilite_items: [],
  };
}

function formFromEvaluation(ev) {
  if (!ev) return emptyForm();
  const f = emptyForm();
  f.visible_to_employee = Boolean(ev.visible_to_employee);
  f.global_comment = ev.global_comment || '';
  for (const itemsKey of ITEM_KEYS) {
    f[itemsKey] = Array.isArray(ev[itemsKey])
      ? ev[itemsKey].map((it) => ({ rating: it.rating, comment: it.comment || '' }))
      : [];
  }
  return f;
}

// Modale d'évaluation mensuelle d'un employé (admin). Chaque critère est une LISTE de
// remarques (bonnes/mauvaises), + commentaire global visible par l'employé + toggle de visibilité,
// navigation par mois + historique.
export default function EvaluationModal({ userId, userName, onClose }) {
  const [history, setHistory] = useState([]);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const evaluatedMonths = useMemo(() => new Set(history.map((h) => h.month)), [history]);

  function loadHistory() {
    return evaluationService
      .getUserEvaluations(userId)
      .then((data) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]));
  }

  useEffect(() => {
    setLoading(true);
    loadHistory().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    setForm(formFromEvaluation(history.find((h) => h.month === month)));
  }, [month, history]);

  // Manipulation des listes de remarques d'un critère.
  function addItem(itemsKey) {
    setForm((c) => ({ ...c, [itemsKey]: [...c[itemsKey], { rating: 'good', comment: '' }] }));
  }
  function updateItem(itemsKey, index, patch) {
    setForm((c) => ({
      ...c,
      [itemsKey]: c[itemsKey].map((it, i) => (i === index ? { ...it, ...patch } : it)),
    }));
  }
  function removeItem(itemsKey, index) {
    setForm((c) => ({ ...c, [itemsKey]: c[itemsKey].filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await evaluationService.saveUserEvaluation(userId, month, form);
      await loadHistory();
      notifySuccess(`Évaluation enregistrée — ${monthLabel(month)}`);
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'enregistrer l'évaluation");
    } finally {
      setSaving(false);
    }
  }

  const canGoNext = month < CURRENT_MONTH;

  return createPortal(
    <div className="eval-overlay" onClick={onClose}>
      <div className="eval-modal" onClick={(e) => e.stopPropagation()}>
        <div className="eval-head">
          <div>
            <p className="eval-eyebrow">Évaluation mensuelle</p>
            <h2 className="eval-title">{userName}</h2>
          </div>
          <button type="button" className="eval-close" onClick={onClose} aria-label="Fermer">
            <IconX />
          </button>
        </div>

        {/* Navigation par mois */}
        <div className="eval-monthnav">
          <button type="button" className="eval-nav-btn" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mois précédent">
            <IconArrowLeft />
          </button>
          <span className="eval-month">
            {monthLabel(month)}
            {evaluatedMonths.has(month) && <span className="eval-month-dot" title="Déjà évalué" />}
          </span>
          <button
            type="button"
            className="eval-nav-btn"
            onClick={() => canGoNext && setMonth((m) => shiftMonth(m, 1))}
            disabled={!canGoNext}
            aria-label="Mois suivant"
          >
            <IconArrowRight />
          </button>
        </div>

        {history.length > 0 && (
          <div className="eval-history">
            {history.map((h) => (
              <button
                key={h.month}
                type="button"
                className={`eval-history-chip${h.month === month ? ' eval-history-chip--active' : ''}`}
                onClick={() => setMonth(h.month)}
              >
                {monthLabel(h.month)}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <p className="eval-loading">Chargement…</p>
        ) : (
          <div className="eval-body">
            {CRITERIA.map(({ key, label }) => {
              const itemsKey = `${key}_items`;
              const items = form[itemsKey];
              return (
                <div className="eval-criterion" key={key}>
                  <div className="eval-criterion-head">
                    <span className="eval-criterion-label">{label}</span>
                  </div>

                  <div className="eval-items">
                    {items.length === 0 && <p className="eval-items-empty">Aucune remarque pour ce critère.</p>}
                    {items.map((item, index) => (
                      <div className={`eval-item eval-item--${item.rating}`} key={index}>
                        <button
                          type="button"
                          className="eval-item-toggle"
                          onClick={() => updateItem(itemsKey, index, { rating: item.rating === 'good' ? 'bad' : 'good' })}
                          title={item.rating === 'good' ? 'Bon — cliquer pour passer en mauvais' : 'Mauvais — cliquer pour passer en bon'}
                        >
                          {item.rating === 'good' ? <IconCheckCircle /> : <IconAlert />}
                        </button>
                        <textarea
                          className="eval-item-input"
                          placeholder="Remarque…"
                          value={item.comment}
                          onChange={(e) => updateItem(itemsKey, index, { comment: e.target.value })}
                          rows={1}
                        />
                        <button
                          type="button"
                          className="eval-item-remove"
                          onClick={() => removeItem(itemsKey, index)}
                          aria-label="Supprimer la remarque"
                        >
                          <IconX />
                        </button>
                      </div>
                    ))}

                    <button type="button" className="eval-add-btn" onClick={() => addItem(itemsKey)}>
                      <IconPlus /> Ajouter une remarque
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Commentaire global — toujours visible par l'employé */}
            <div className="eval-global">
              <label className="eval-global-label" htmlFor="eval-global">
                Commentaire global <span className="eval-global-hint">(toujours visible par l'employé)</span>
              </label>
              <textarea
                id="eval-global"
                className="eval-comment"
                placeholder="Message de synthèse adressé à l'employé…"
                value={form.global_comment}
                onChange={(e) => setForm((c) => ({ ...c, global_comment: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Visibilité du détail */}
            <label className="eval-visibility">
              <input
                type="checkbox"
                checked={form.visible_to_employee}
                onChange={(e) => setForm((c) => ({ ...c, visible_to_employee: e.target.checked }))}
              />
              <span>
                <strong>Rendre le détail visible par l'employé</strong>
                <small>Sinon, l'employé ne voit que le commentaire global (les remarques restent privées).</small>
              </span>
            </label>
          </div>
        )}

        <div className="eval-footer">
          <button type="button" className="btn-outline" onClick={onClose}>
            Fermer
          </button>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
