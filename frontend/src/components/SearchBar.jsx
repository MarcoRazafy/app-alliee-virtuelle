import { useState } from 'react';

const STATUS_OPTIONS = [
  { value: 'VALIDEE', label: 'À faire' },
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
    <div>
      <input placeholder="Rechercher une tâche..." value={search} onChange={handleSearchChange} />

      <div>
        <strong>Statut : </strong>
        {STATUS_OPTIONS.map((opt) => (
          <label key={opt.value} style={{ marginRight: '10px' }}>
            <input
              type="checkbox"
              checked={statuses.includes(opt.value)}
              onChange={() => handleStatusToggle(opt.value)}
            />
            {opt.label}
          </label>
        ))}
      </div>

      <div>
        <strong>Priorité : </strong>
        {PRIORITY_OPTIONS.map((value) => (
          <label key={value} style={{ marginRight: '10px' }}>
            <input
              type="checkbox"
              checked={priorities.includes(value)}
              onChange={() => handlePriorityToggle(value)}
            />
            {value}
          </label>
        ))}
      </div>

      <div>
        <strong>Deadline : </strong>
        <select value={deadlineRange} onChange={handleDeadlineChange}>
          <option value="">Toutes</option>
          <option value="today">Aujourd'hui</option>
          <option value="week">Cette semaine</option>
          <option value="month">Ce mois</option>
          <option value="past">Passée</option>
        </select>
      </div>
    </div>
  );
}

export default SearchBar;
