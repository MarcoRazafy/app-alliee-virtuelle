// `options` : liste de tailles de page. Un item peut être un nombre (ex. 10) ou
// { value, label } — utiliser value=Infinity pour « Toutes ».
function Pagination({
  page,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  options = [10, 20, 50],
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const start = totalItems === 0 ? 0 : (page - 1) * itemsPerPage + 1;
  const end = Math.min(page * itemsPerPage, totalItems);

  function goToPage(newPage) {
    if (newPage < 1 || newPage > totalPages) return;
    onPageChange(newPage);
    window.scrollTo({ top: 0 });
  }

  return (
    <div className="pagination">
      <span className="pagination-info">
        Affichage {start}-{end} sur {totalItems}
      </span>

      <div className="pagination-controls">
        <select
          className="filter-select"
          value={itemsPerPage}
          onChange={(e) => {
            onItemsPerPageChange(Number(e.target.value));
            onPageChange(1);
          }}
        >
          {options.map((opt) => {
            const value = typeof opt === 'object' ? opt.value : opt;
            const label = typeof opt === 'object' ? opt.label : `${opt} par page`;
            return (
              <option key={String(value)} value={value}>
                {label}
              </option>
            );
          })}
        </select>

        <button className="pagination-btn" onClick={() => goToPage(page - 1)} disabled={page === 1}>
          Précédent
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            className={`pagination-btn${p === page ? ' pagination-btn--active' : ''}`}
            onClick={() => goToPage(p)}
            disabled={p === page}
          >
            {p}
          </button>
        ))}
        <button className="pagination-btn" onClick={() => goToPage(page + 1)} disabled={page === totalPages}>
          Suivant
        </button>
      </div>
    </div>
  );
}

export default Pagination;
