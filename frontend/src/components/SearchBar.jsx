import { useState } from 'react';
import { IconSearch } from './icons';

const STATUS_OPTIONS = [
  { value: 'DECLAREE', label: 'Non validée' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'A_REPRENDRE', label: 'À reprendre' },
  { value: 'TERMINEE', label: 'Terminée' },
  { value: 'CONFIRMEE', label: 'Confirmée' },
];

const PRIORITY_OPTIONS = ['URGENT', 'HAUTE', 'NORMALE', 'FAIBLE'];

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function SearchBar({ onChange }) {
  const [search, setSearch] = useState('');
  const [statuses, setStatuses] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [deadlineRange, setDeadlineRange] = useState('');

  function emit(next) {
    onChange({
      search: next.search ?? search,
      statuses: next.statuses ?? statuses,
      priorities: next.priorities ?? priorities,
      deadlineRange: next.deadlineRange ?? deadlineRange,
    });
  }

  function handleSearchChange(e) {
    setSearch(e.target.value);
    emit({ search: e.target.value });
  }

  function handleStatusToggle(value) {
    const next = toggleValue(statuses, value);
    setStatuses(next);
    emit({ statuses: next });
  }

  function handlePriorityToggle(value) {
    const next = toggleValue(priorities, value);
    setPriorities(next);
    emit({ priorities: next });
  }

  function handleDeadlineChange(e) {
    setDeadlineRange(e.target.value);
    emit({ deadlineRange: e.target.value });
  }

  return (
    <div className="filter-bar">
      <div className="filter-search">
        <IconSearch />
        <input placeholder="Rechercher une tâche..." value={search} onChange={handleSearchChange} />
      </div>

      <div className="filter-groups">
        <div className="filter-group">
          <span className="filter-group-label">Statut</span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`filter-chip${statuses.includes(opt.value) ? ' filter-chip--active' : ''}`}
              onClick={() => handleStatusToggle(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <span className="filter-group-label">Priorité</span>
          {PRIORITY_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={`filter-chip${priorities.includes(value) ? ' filter-chip--active' : ''}`}
              onClick={() => handlePriorityToggle(value)}
            >
              {value}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <span className="filter-group-label">Échéance</span>
          <select className="filter-select" value={deadlineRange} onChange={handleDeadlineChange}>
            <option value="">Toutes</option>
            <option value="today">Aujourd'hui</option>
            <option value="week">Cette semaine</option>
            <option value="month">Ce mois</option>
            <option value="past">Passée</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default SearchBar;
