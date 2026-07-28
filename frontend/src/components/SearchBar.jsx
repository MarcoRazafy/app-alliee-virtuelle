import { useState } from 'react';
import { IconSearch } from './icons';
import { priorityLabel } from '../utils/taskStatus';

const STATUS_OPTIONS = [
  { value: 'DECLAREE', label: 'Declared' },
  { value: 'EN_COURS', label: 'In progress' },
  { value: 'A_REPRENDRE', label: 'To resume' },
  { value: 'TERMINEE', label: 'Completed' },
  { value: 'CONFIRMEE', label: 'Confirmed' },
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
        <input placeholder="Search a task..." value={search} onChange={handleSearchChange} />
      </div>

      <div className="filter-groups">
        <div className="filter-group">
          <span className="filter-group-label">Status</span>
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
          <span className="filter-group-label">Priority</span>
          {PRIORITY_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={`filter-chip${priorities.includes(value) ? ' filter-chip--active' : ''}`}
              onClick={() => handlePriorityToggle(value)}
            >
              {priorityLabel(value)}
            </button>
          ))}
        </div>

        <div className="filter-group">
          <span className="filter-group-label">Deadline</span>
          <select className="filter-select" value={deadlineRange} onChange={handleDeadlineChange}>
            <option value="">All</option>
            <option value="today">Today</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="past">Past</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default SearchBar;
