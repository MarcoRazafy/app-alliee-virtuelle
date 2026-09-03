import { useCallback, useEffect, useMemo, useState } from 'react';
import * as evaluationService from '../../services/evaluationService';
import { notifySuccess, notifyError } from '../../utils/toast';
import RichTextEditor from '../RichTextEditor';
import { htmlToText } from '../../utils/sanitizeHtml';
import {
  IconX,
  IconArrowLeft,
  IconArrowRight,
  IconCheckCircle,
  IconAlert,
  IconPlus,
  IconChevronDown,
} from '../icons';
import '../../styles/evaluation.css';

const CRITERIA = [
  { key: 'delais', label: 'Respect des délais et fiabilité' },
  { key: 'qualite', label: 'Qualité des livrables et Rigueur' },
  { key: 'autonomie', label: 'Autonomie et Résolution de problème' },
  { key: 'adaptabilite', label: 'Adaptabilité et Évolution' },
];
const ITEM_KEYS = CRITERIA.map((c) => `${c.key}_items`);

// Champs libres « développement / carrière », avec une amorce concrète en placeholder.
const TEXT_FIELDS = [
  {
    key: 'forces_actuelles',
    label: 'Forces actuelles',
    placeholder: "Ce sur quoi la personne excelle aujourd'hui…",
  },
  {
    key: 'competences_ameliorer',
    label: 'Compétences à améliorer',
    placeholder: 'Points précis à travailler en priorité…',
  },
  {
    key: 'competences_developper',
    label: 'Compétences que la personne souhaite développer',
    placeholder: 'Ce que la personne a exprimé vouloir apprendre…',
  },
  {
    key: 'objectifs_professionnels',
    label: 'Objectifs professionnels',
    placeholder: 'Objectifs visés pour les prochains mois…',
  },
  {
    key: 'formations_recommandees',
    label: 'Formations recommandées',
    placeholder: 'Formations, ateliers ou ressources utiles…',
  },
  {
    key: 'nouvelles_responsabilites',
    label: 'Nouvelles responsabilités pouvant lui être confiées',
    placeholder: 'Missions à confier progressivement…',
  },
  {
    key: 'prochaine_etape',
    label: 'Prochaine étape possible dans son évolution',
    placeholder: 'Poste ou rôle envisageable à terme…',
  },
];

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

// Date d'enregistrement de l'évaluation. `formatDateTime` (utilitaire partagé) omet
// l'année : sur une fiche qui remonte plusieurs mois en arrière, elle est indispensable.
function formatSavedAt(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Date ET heure affichées à côté d'un nom, dans une pastille : « 3 sept. à 17:36 ». Le mois
// est abrégé et l'année n'apparaît que si ce n'est pas l'année en cours, pour que l'heure
// tienne sans faire déborder la pastille (une fiche peut remonter loin en arrière).
function formatShortDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day} à ${time}`;
}

// Pastille « qui a touché ce contenu, et quand ». Partagée par les remarques (sur le fond
// coloré du critère) et par les champs libres (à côté du libellé) : seule la classe change,
// pour que les deux ne divergent jamais dans leur formulation. La date reste courte, le
// survol donne le jour et l'heure exacts.
function AuthorStamp({ className, name, at, prefix = '' }) {
  const short = formatShortDate(at);
  if (!name && !short) return null;
  const full = formatSavedAt(at);
  const title = [name ? `Modifié par ${name}` : 'Modifié', full ? `le ${full}` : null]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={className} title={title}>
      {name ? `${prefix}${name}` : null}
      {short && <span className="eval-stamp-date">{name ? ` · ${short}` : short}</span>}
    </span>
  );
}

// Un champ riche « vidé » garde du balisage résiduel (`<br>`, `<div><br></div>`) : la chaîne
// n'est pas vide alors que le champ l'est à l'écran. On juge donc le vide sur le TEXTE, sinon
// un champ effacé compterait comme rempli et se verrait attribuer un auteur et une date.
function isFilled(html) {
  return Boolean(htmlToText(html || '').trim());
}

// Champs riches de l'évaluation : les 7 champs de développement + le commentaire global.
const RICH_FIELD_KEYS = [...TEXT_FIELDS.map((f) => f.key), 'global_comment'];

// Les évaluations saisies AVANT l'éditeur riche contiennent du texte brut. Le charger tel
// quel dans l'éditeur écraserait ses retours à la ligne (en HTML, ce ne sont que des espaces)
// et interpréterait un « < » comme une balise. On le convertit donc une fois, à l'ouverture.
function toRichValue(value) {
  const text = value || '';
  if (!text || /<[a-z][\s\S]*>/i.test(text)) return text; // déjà du HTML
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
}

function emptyForm() {
  const f = {
    visible_to_employee: false,
    global_comment: '',
    delais_items: [],
    qualite_items: [],
    autonomie_items: [],
    adaptabilite_items: [],
  };
  for (const { key } of TEXT_FIELDS) f[key] = '';
  return f;
}

function formFromEvaluation(ev) {
  if (!ev) return emptyForm();
  const f = emptyForm();
  f.visible_to_employee = Boolean(ev.visible_to_employee);
  f.global_comment = toRichValue(ev.global_comment);
  for (const itemsKey of ITEM_KEYS) {
    // On conserve auteur ET date : le serveur ne les réattribue qu'aux remarques dont le
    // texte ou la note a changé, mais il les affiche depuis ce qu'on lui renvoie.
    f[itemsKey] = Array.isArray(ev[itemsKey])
      ? ev[itemsKey].map((it) => ({
          rating: it.rating,
          comment: it.comment || '',
          author_id: it.author_id || null,
          author_name: it.author_name || null,
          updated_at: it.updated_at || null,
        }))
      : [];
  }
  for (const { key } of TEXT_FIELDS) f[key] = toRichValue(ev[key]);
  return f;
}

// Section d'évaluation mensuelle affichée sur la fiche employé (admin). Repliée par défaut
// (résumé du mois), elle contient 4 critères notés (listes de remarques bonnes/mauvaises),
// 7 champs de développement, le commentaire global et la visibilité employé.
export default function EvaluationSection({ userId }) {
  const [history, setHistory] = useState([]);
  const [month, setMonth] = useState(CURRENT_MONTH);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [devOpen, setDevOpen] = useState(false); // seul le bloc « développement » se replie
  const [dirty, setDirty] = useState(false);

  const evaluatedMonths = useMemo(() => new Set(history.map((h) => h.month)), [history]);
  const currentEvaluation = useMemo(() => history.find((h) => h.month === month), [history, month]);
  // Auteur et date de chaque champ libre, tels qu'enregistrés (vides tant que rien n'a été
  // sauvegardé — les fiches antérieures à la migration 036 n'ont pas de date, on n'affiche
  // alors que le nom).
  const fieldAuthors = currentEvaluation?.field_author_names || {};
  const fieldDates = currentEvaluation?.field_updated_at || {};
  const savedAtLabel = formatSavedAt(currentEvaluation?.updated_at);

  // Toute modification passe par ici → marque la saisie comme non enregistrée.
  const updateForm = useCallback((updater) => {
    setForm(updater);
    setDirty(true);
  }, []);

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

  // (Re)charge le formulaire depuis le serveur : la saisie repart « propre ».
  useEffect(() => {
    setForm(formFromEvaluation(history.find((h) => h.month === month)));
    setDirty(false);
  }, [month, history]);

  // Filet de sécurité : prévient avant de quitter la page avec une saisie non enregistrée.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function addItem(itemsKey) {
    updateForm((c) => ({ ...c, [itemsKey]: [...c[itemsKey], { rating: 'good', comment: '' }] }));
  }
  function updateItem(itemsKey, index, patch) {
    updateForm((c) => ({
      ...c,
      [itemsKey]: c[itemsKey].map((it, i) => (i === index ? { ...it, ...patch } : it)),
    }));
  }
  function removeItem(itemsKey, index) {
    updateForm((c) => ({ ...c, [itemsKey]: c[itemsKey].filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      // On envoie une chaîne vide pour un champ riche vidé de son texte : le serveur y voit
      // alors un champ effacé et retire son auteur et sa date, au lieu de conserver un `<br>`.
      const payload = { ...form };
      for (const key of RICH_FIELD_KEYS) {
        if (!isFilled(payload[key])) payload[key] = '';
      }
      await evaluationService.saveUserEvaluation(userId, month, payload);
      await loadHistory();
      setDirty(false);
      notifySuccess(`Évaluation enregistrée — ${monthLabel(month)}`);
    } catch (err) {
      notifyError(err.response?.data?.error || "Impossible d'enregistrer l'évaluation");
    } finally {
      setSaving(false);
    }
  }

  const canGoNext = month < CURRENT_MONTH;
  const remarkCount = ITEM_KEYS.reduce((n, k) => n + (form[k]?.length || 0), 0);
  const filledDevFields = TEXT_FIELDS.filter(({ key }) => isFilled(form[key])).length;
  const hasContent = remarkCount > 0 || filledDevFields > 0 || isFilled(form.global_comment);

  // Résumé affiché quand la section est repliée : toujours explicite sur le contenu,
  // même à zéro (« 0 remarque » plutôt qu'un simple « privée » énigmatique).
  const summary = !hasContent
    ? 'Pas encore évaluée'
    : [
        `${remarkCount} remarque${remarkCount > 1 ? 's' : ''}`,
        `${filledDevFields}/7 champs`,
        isFilled(form.global_comment) ? 'commentaire' : null,
        form.visible_to_employee ? 'partagée' : 'privée',
      ]
        .filter(Boolean)
        .join(' · ');

  // On masque l'historique quand il ne ferait que répéter le mois déjà affiché en titre.
  const showHistory = history.length > 1 || (history.length === 1 && history[0].month !== month);

  return (
    <section className="side-card eval-section eval-section--open">
      <div className="eval-section-head">
        <div className="eval-section-toggle eval-section-toggle--static">
          <span className="eval-section-heading">
            <span className="eval-eyebrow">Évaluation mensuelle</span>
            <span className="eval-section-title">{monthLabel(month)}</span>
          </span>
          <span className="eval-summary">
            {/* Qui a rempli ce mois : utile dès qu'il y a plusieurs administrateurs. */}
            {(currentEvaluation?.updated_by_name || currentEvaluation?.updated_at) && (
              <span className="eval-author">
                {currentEvaluation.updated_by_name
                  ? `Évaluée par ${currentEvaluation.updated_by_name}`
                  : 'Évaluée'}
                {savedAtLabel ? ` · le ${savedAtLabel}` : ''}
              </span>
            )}
            {summary}
            {dirty && <span className="eval-dirty-dot" title="Modifications non enregistrées" />}
          </span>
        </div>

        <div className="eval-monthnav">
          <button
            type="button"
            className="eval-nav-btn"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            aria-label="Mois précédent"
          >
            <IconArrowLeft />
          </button>
          {evaluatedMonths.has(month) && <span className="eval-month-dot" title="Mois déjà évalué" />}
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
      </div>

      <>
          {showHistory && (
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
            <>
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
                        {items.length === 0 && (
                          <p className="eval-items-empty">Aucune remarque pour ce critère.</p>
                        )}
                        {items.map((item, index) => (
                          <div className={`eval-item eval-item--${item.rating}`} key={index}>
                            <button
                              type="button"
                              className="eval-item-toggle"
                              onClick={() =>
                                updateItem(itemsKey, index, { rating: item.rating === 'good' ? 'bad' : 'good' })
                              }
                              title={
                                item.rating === 'good'
                                  ? 'Bon — cliquer pour passer en mauvais'
                                  : 'Mauvais — cliquer pour passer en bon'
                              }
                            >
                              {item.rating === 'good' ? <IconCheckCircle /> : <IconAlert />}
                            </button>
                            {/* La grille + le pseudo-élément miroir dimensionnent la zone de
                                saisie sur son contenu : une remarque courte reste courte. */}
                            <span className="eval-item-sizer" data-value={item.comment || ''}>
                              <textarea
                                className="eval-item-input"
                                placeholder="Remarque…"
                                value={item.comment}
                                onChange={(e) => updateItem(itemsKey, index, { comment: e.target.value })}
                                rows={1}
                              />
                            </span>
                            <AuthorStamp
                              className="eval-item-author"
                              name={item.author_name}
                              at={item.updated_at}
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
              </div>

              {/* Développement & évolution : repliable, contrairement aux 4 critères
                  ci-dessus qui restent toujours à l'écran. */}
              <button
                type="button"
                className="eval-dev-toggle"
                onClick={() => setDevOpen((v) => !v)}
                aria-expanded={devOpen}
              >
                <span className={`eval-chevron${devOpen ? ' eval-chevron--open' : ''}`}>
                  <IconChevronDown />
                </span>
                <span className="eval-dev-toggle-label">Développement &amp; évolution</span>
                <span className="eval-dev-toggle-summary">
                  {filledDevFields}/7 champs
                  {isFilled(form.global_comment) ? ' · commentaire global' : ''}
                </span>
              </button>

              {devOpen && (
                <>
              <div className="eval-dev">
                {TEXT_FIELDS.map(({ key, label, placeholder }) => (
                  <div className="eval-dev-field" key={key}>
                    {/* Plus un <label for> : la zone de saisie est un div[role=textbox]
                        (éditeur riche), que l'attribut for ne peut pas désigner. */}
                    <span className="eval-dev-label">
                      {label}
                      <AuthorStamp
                        className="eval-field-author"
                        name={fieldAuthors[key]}
                        at={fieldDates[key]}
                        prefix="par "
                      />
                    </span>
                    <RichTextEditor
                      value={form[key]}
                      onChange={(html) => updateForm((c) => ({ ...c, [key]: html }))}
                      placeholder={placeholder}
                      ariaLabel={label}
                    />
                  </div>
                ))}
              </div>

              {/* Commentaire global — toujours visible par l'employé */}
              <div className="eval-global">
                <span className="eval-global-label">
                  Commentaire global <span className="eval-global-hint">(toujours visible par l'employé)</span>
                  <AuthorStamp
                    className="eval-field-author"
                    name={fieldAuthors.global_comment}
                    at={fieldDates.global_comment}
                    prefix="par "
                  />
                </span>
                <RichTextEditor
                  value={form.global_comment}
                  onChange={(html) => updateForm((c) => ({ ...c, global_comment: html }))}
                  placeholder="Message de synthèse adressé à l'employé…"
                  ariaLabel="Commentaire global"
                />
              </div>

                </>
              )}

              <div className="eval-section-footer">
                <label className="eval-visibility">
                  <input
                    type="checkbox"
                    checked={form.visible_to_employee}
                    onChange={(e) => updateForm((c) => ({ ...c, visible_to_employee: e.target.checked }))}
                  />
                  <span>
                    <strong>Rendre le détail visible par l'employé</strong>
                    <small>Sinon, l'employé ne voit que le commentaire global (le reste reste privé).</small>
                  </span>
                </label>
                <div className="eval-save-zone">
                  {dirty && <span className="eval-dirty-label">Modifications non enregistrées</span>}
                  <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || !dirty}>
                    {saving ? 'Enregistrement…' : "Enregistrer l'évaluation"}
                  </button>
                </div>
              </div>
            </>
          )}
        </>
    </section>
  );
}
