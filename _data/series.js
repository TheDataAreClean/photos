'use strict';

const { loadSeries } = require('../build/series');

module.exports = async function () {
  return loadSeries();
};
