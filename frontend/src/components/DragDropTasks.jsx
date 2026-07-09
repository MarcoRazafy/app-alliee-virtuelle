import { useRef } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const ITEM_TYPE = 'TASK';

function DraggableTask({ task, index, column, order, moveTask, disabled }) {
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

  return (
    <div
      ref={ref}
      style={{
        opacity: isDragging ? 0.4 : 1,
        border: '1px solid gray',
        padding: '8px',
        marginBottom: '6px',
        cursor: disabled ? 'default' : 'grab',
      }}
    >
      {order != null && <strong>{order}. </strong>}
      {task.title} — {task.priority}
    </div>
  );
}

function Column({ title, tasks, column, moveTask, showOrder, emptyLabel, disabled }) {
  const ref = useRef(null);
  const [, drop] = useDrop({
    accept: ITEM_TYPE,
    drop(item) {
      if (disabled) return;
      if (item.column !== column) {
        moveTask(item.column, item.index, column, tasks.length);
        item.column = column;
        item.index = tasks.length;
      }
    },
  });
  drop(ref);

  return (
    <div ref={ref} style={{ flex: 1, border: '1px solid black', padding: '10px', minHeight: '200px' }}>
      <h2>{title}</h2>
      {tasks.length === 0 && <p>{emptyLabel}</p>}
      {tasks.map((task, index) => (
        <DraggableTask
          key={task.id}
          task={task}
          index={index}
          column={column}
          order={showOrder ? index + 1 : null}
          moveTask={moveTask}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function DragDropTasks({ availableTasks, selectedTasks, onUpdate, validated }) {
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
      <div style={{ display: 'flex', gap: '20px' }}>
        <Column
          title="Tâches disponibles"
          tasks={availableTasks}
          column="available"
          moveTask={moveTask}
          emptyLabel="Aucune tâche disponible."
          disabled={validated}
        />
        <Column
          title="Mes tâches aujourd'hui"
          tasks={selectedTasks}
          column="selected"
          moveTask={moveTask}
          showOrder
          emptyLabel="Glissez des tâches ici."
          disabled={validated}
        />
      </div>
    </DndProvider>
  );
}

export default DragDropTasks;
