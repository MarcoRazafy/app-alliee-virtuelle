import { paginationRange, GAP } from '../utils/paginationRange';

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

  const pages = paginationRange(page, totalPages);

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

        <button
          className="pagination-btn pagination-btn--step"
          onClick={() => goToPage(page - 1)}
          disabled={page === 1}
          aria-label="Page précédente"
        >
          <span className="pagination-btn-word">Précédent</span>
          <span className="pagination-btn-arrow" aria-hidden="true">
            ‹
          </span>
        </button>

        {pages.map((item, index) =>
          item === GAP ? (
            // eslint-disable-next-line react/no-array-index-key
            <span key={`gap-${index}`} className="pagination-gap" aria-hidden="true">
              {GAP}
            </span>
          ) : (
            <button
              key={item}
              className={`pagination-btn${item === page ? ' pagination-btn--active' : ''}`}
              onClick={() => goToPage(item)}
              disabled={item === page}
              aria-label={`Page ${item}`}
              aria-current={item === page ? 'page' : undefined}
            >
              {item}
            </button>
          )
        )}

        <button
          className="pagination-btn pagination-btn--step"
          onClick={() => goToPage(page + 1)}
          disabled={page === totalPages}
          aria-label="Page suivante"
        >
          <span className="pagination-btn-word">Suivant</span>
          <span className="pagination-btn-arrow" aria-hidden="true">
            ›
          </span>
        </button>
      </div>
    </div>
  );
}

export default Pagination;
