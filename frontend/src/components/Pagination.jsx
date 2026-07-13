function Pagination({ page, totalItems, itemsPerPage, onPageChange, onItemsPerPageChange }) {
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
          <option value={10}>10 par page</option>
          <option value={20}>20 par page</option>
          <option value={50}>50 par page</option>
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
