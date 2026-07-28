import '../styles/skeleton.css';

// Primitive : un bloc gris animé (shimmer). w/h acceptent nombre (px) ou chaîne CSS.
export function Skeleton({ w = '100%', h = 14, r = 8, className = '', style }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width: w, height: h, borderRadius: r, ...style }}
      aria-hidden="true"
    />
  );
}

// Plusieurs lignes de texte (la dernière plus courte).
export function SkeletonText({ lines = 3, gap = 8 }) {
  return (
    <span className="sk-text" style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} h={12} w={i === lines - 1 ? '60%' : '100%'} />
      ))}
    </span>
  );
}

function SkCard({ lines = 3 }) {
  return (
    <div className="sk-card">
      <div className="sk-card-head">
        <Skeleton w={40} h={40} r={12} />
        <div className="sk-card-headtext">
          <Skeleton w="55%" h={13} />
          <Skeleton w="35%" h={10} />
        </div>
      </div>
      <SkeletonText lines={lines} />
    </div>
  );
}

function SkRow() {
  return (
    <div className="sk-row">
      <Skeleton w={38} h={38} r={10} />
      <div className="sk-row-body">
        <Skeleton w="40%" h={13} />
        <Skeleton w="65%" h={10} />
      </div>
      <Skeleton w={70} h={24} r={999} />
    </div>
  );
}

function SkKpis({ count = 4 }) {
  return (
    <div className="sk-kpis">
      {Array.from({ length: count }).map((_, i) => (
        <div className="sk-kpi" key={i}>
          <Skeleton w="45%" h={11} />
          <Skeleton w="60%" h={30} />
          <Skeleton w="70%" h={10} />
        </div>
      ))}
    </div>
  );
}

function SkFilterBar() {
  return (
    <div className="sk-filterbar">
      <Skeleton w={260} h={38} r={12} />
      <div className="sk-filterbar-right">
        <Skeleton w={120} h={34} r={999} />
        <Skeleton w={120} h={34} r={999} />
        <Skeleton w={140} h={34} r={999} />
      </div>
    </div>
  );
}

// Squelette de page complet, adapté à la mise en page (variant).
export function PageSkeleton({ variant = 'cards', rows = 6, cards = 6 }) {
  if (variant === 'stats') {
    return (
      <div className="pgsk">
        <SkKpis count={5} />
        <div className="sk-chart">
          <Skeleton w="30%" h={16} />
          <Skeleton w="100%" h={260} r={14} />
        </div>
        <div className="sk-block">
          {Array.from({ length: rows }).map((_, i) => (
            <SkRow key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'list' || variant === 'table') {
    return (
      <div className="pgsk">
        <SkFilterBar />
        <div className="sk-block">
          {Array.from({ length: rows }).map((_, i) => (
            <SkRow key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'form') {
    return (
      <div className="pgsk pgsk--narrow">
        <div className="sk-card">
          <Skeleton w={90} h={90} r={999} style={{ margin: '0 auto 16px' }} />
          {Array.from({ length: rows || 5 }).map((_, i) => (
            <div className="sk-field" key={i}>
              <Skeleton w="30%" h={11} />
              <Skeleton w="100%" h={40} r={10} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'detail') {
    return (
      <div className="pgsk pgsk--narrow">
        <div className="sk-card">
          <div className="sk-card-head">
            <Skeleton w={56} h={56} r={16} />
            <div className="sk-card-headtext">
              <Skeleton w="50%" h={18} />
              <Skeleton w="30%" h={12} />
            </div>
          </div>
          <SkeletonText lines={5} />
          <SkeletonText lines={4} />
        </div>
      </div>
    );
  }

  if (variant === 'dashboard') {
    return (
      <div className="pgsk">
        <SkKpis count={3} />
        <SkFilterBar />
        <div className="sk-cards">
          {Array.from({ length: cards }).map((_, i) => (
            <SkCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // 'cards' (défaut)
  return (
    <div className="pgsk">
      <div className="sk-cards">
        {Array.from({ length: cards }).map((_, i) => (
          <SkCard key={i} />
        ))}
      </div>
    </div>
  );
}

export default Skeleton;
