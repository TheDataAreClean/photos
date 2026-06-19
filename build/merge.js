function mergeAndSort(photos) {
  // Deduplicate by id — last writer wins (local overrides Glass if same id)
  const map = new Map();
  for (const photo of photos) {
    map.set(photo.id, photo);
  }

  const unique = Array.from(map.values());

  // Sort reverse chronologically: dateTaken preferred, fall back to dateAdded
  unique.sort((a, b) => {
    const da = a.dateTaken || a.dateAdded || '';
    const db = b.dateTaken || b.dateAdded || '';
    if (db < da) return -1;
    if (db > da) return 1;
    return 0;
  });

  return unique;
}

module.exports = { mergeAndSort };
