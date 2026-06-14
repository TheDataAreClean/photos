'use strict';
const { loadSeries } = require('../build/series');
module.exports = async function () {
  const map = await loadSeries();
  return Object.values(map);
};
