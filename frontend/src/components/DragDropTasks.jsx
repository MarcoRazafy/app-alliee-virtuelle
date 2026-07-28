import { useRef } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { priorityLabel } from '../utils/taskStatus';

const ITEM_TYPE = 'TASK';

const PRIORITY_DOT_CLASS = {
  URGENT: 'priority-dot--urgent',
  HAUTE: 'priority-dot--haute',
  NORMALE: 'priority-dot--normale',
  FAIBLE: 'priority-dot--faible',
};

// Calcule l'urgence d'une deadline (date) par rapport à aujourd'hui, en raisonnant en jours
// calendaires locaux. On parse d'abord un éventuel préfixe "YYYY-MM-DD" pour éviter les décalages
// de fuseau (une colonne SQL `date` sérialisée en ISO minuit UTC peut basculer d'un jour).
function deadlineInfo(raw) {
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  let target;
  if (m) {
    target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  } else {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target - startToday) / 86400000);

  if (diffDays < 0) return { urgency: 'overdue', label: `${Math.abs(diffDays)}d late`, diffDays };
  if (diffDays === 0) return { urgency: 'today', label: "Today", diffDays };
  if (diffDays === 1) return { urgency: 'soon', label: 'Tomorrow', diffDays };
  if (diffDays <= 3) return { urgency: 'soon', label: `In ${diffDays} days`, diffDays };
  return { urgency: 'normal', label: target.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }), diffDays };
}

function IconClock() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RequestControl({ task, requestState, onRequest }) {
  if (requestState?.status === 'PENDING') {
    return <span className="task-request-chip task-request-chip--pending">Pending</span>;
  }
  if (requestState?.status === 'REJECTED') {
    return (
      <span className="task-request-actions">
        <span
          className="task-request-chip task-request-chip--rejected"
          title={requestState.admin_note ? `Reason: ${requestState.admin_note}` : 'Request rejected'}
        >
          Rejected
        </span>
        <button type="button" className="task-request-btn" onClick={() => onRequest(task)}>
          Request again
        </button>
      </span>
    );
  }
  return (
    <button type="button" className="task-request-btn" onClick={() => onRequest(task)}>
      Request
    </button>
  );
}

function DraggableTask({ task, index, column, order, moveTask, disabled, requestable, requestState, onRequest }) {
  const ref = useRef(null);

  const [, drop] = useDrop({
    accept: ITEM_TYPE,
    hover(item) {
      if (disabled || item.column !== column || item.index === index) return;
      moveTask(item.column, item.index, column, index);
      item.index = index;
    },
  });

  const [{ isDragging }, drag] = useDrag({
    type: ITEM_TYPE,
    item: { id: task.id, index, column },
    canDrag: () => !disabled,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  drag(drop(ref));

  // Une carte "demandable" (journée validée, colonne disponible) reste visuellement active
  // — surlignée non verrouillée — car son bouton doit être cliquable.
  const locked = disabled && !requestable;
  const dl = deadlineInfo(task.deadline);

  return (
    <div
      ref={ref}
      className={`task-card${isDragging ? ' task-card--dragging' : ''}${locked ? ' task-card--locked' : ''}${
        requestable ? ' task-card--requestable' : ''
      }`}
    >
      {order != null && <span className="task-order-badge">{order}</span>}
      <span className={`priority-dot ${PRIORITY_DOT_CLASS[task.priority] || 'priority-dot--normale'}`} />
      <span className="task-card-title">{task.title}</span>
      {dl && (
        <span
          className={`task-card-deadline task-card-deadline--${dl.urgency}`}
          title={`Deadline: ${task.deadline ? new Date(task.deadline).toLocaleDateString('en-US') : ''}`}
        >
          <IconClock />
          {dl.label}
        </span>
      )}
      {requestable ? (
        <RequestControl task={task} requestState={requestState} onRequest={onRequest} />
      ) : (
        <span className="task-card-priority">{priorityLabel(task.priority)}</span>
      )}
    </div>
  );
}

function Column({ title, tasks, column, moveTask, showOrder, emptyLabel, disabled, requestable, requestsByTaskId, onRequestTask }) {
  const ref = useRef(null);
  const [{ isOver }, drop] = useDrop({
    accept: ITEM_TYPE,
    drop(item) {
      if (disabled) return;
      if (item.column !== column) {
        moveTask(item.column, item.index, column, tasks.length);
        item.column = column;
        item.index = tasks.length;
      }
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  });
  drop(ref);

  return (
    <div ref={ref} className={`dnd-column${isOver && !disabled ? ' dnd-column--over' : ''}`}>
      <div className="dnd-column-header">
        <p className="dnd-column-title">{title}</p>
        <span className="dnd-column-count">{tasks.length}</span>
      </div>
      {tasks.length === 0 && <div className="dnd-empty">{emptyLabel}</div>}
      {tasks.map((task, index) => (
        <DraggableTask
          key={task.id}
          task={task}
          index={index}
          column={column}
          order={showOrder ? index + 1 : null}
          moveTask={moveTask}
          disabled={disabled}
          requestable={requestable}
          requestState={requestsByTaskId?.[task.id]}
          onRequest={onRequestTask}
        />
      ))}
    </div>
  );
}

function DragDropTasks({ availableTasks, selectedTasks, onUpdate, validated, requestsByTaskId, onRequestTask }) {
  function moveTask(fromColumn, fromIndex, toColumn, toIndex) {
    if (validated) return;

    const available = [...availableTasks];
    const selected = [...selectedTasks];

    const sourceList = fromColumn === 'available' ? available : selected;
    const [moved] = sourceList.splice(fromIndex, 1);

    const destList = toColumn === 'available' ? available : selected;
    destList.splice(toIndex, 0, moved);

    onUpdate({ available, selected });
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="dnd-columns">
        <Column
          title="Available tasks"
          tasks={availableTasks}
          column="available"
          moveTask={moveTask}
          emptyLabel="No available tasks."
          disabled={validated}
          requestable={validated && !!onRequestTask}
          requestsByTaskId={requestsByTaskId}
          onRequestTask={onRequestTask}
        />
        <Column
          title="My tasks today"
          tasks={selectedTasks}
          column="selected"
          moveTask={moveTask}
          showOrder
          emptyLabel="Drag tasks here."
          disabled={validated}
        />
      </div>
    </DndProvider>
  );
}

export default DragDropTasks;
