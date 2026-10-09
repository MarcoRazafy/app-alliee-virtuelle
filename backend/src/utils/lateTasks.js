const { sqlToday } = require('./businessDay');

const FINISHED_STATUSES = ['TERMINEE', 'CONFIRMEE'];

const TODAY = sqlToday();

function sqlIsLate(prefix = '') {
  const p = prefix ? `${prefix}.` : '';
  const finished = FINISHED_STATUSES.map((s) => `'${s}'`).join(', ');
  return `${p}deadline < ${TODAY} AND ${p}status NOT IN (${finished})`;
}

module.exports = { FINISHED_STATUSES, sqlIsLate };
