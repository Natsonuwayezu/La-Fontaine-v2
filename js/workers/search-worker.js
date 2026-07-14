/* ═══════════════════════════════════════════════════════════════════
   js/workers/search-worker.js — Off-thread search indexing
   ═══════════════════════════════════════════════════════════════════
   Keeps a simple in-memory index per named collection ('students',
   'marksDatabase', 'paymentHistory', ...) inside the worker itself, so
   re-querying doesn't require re-sending the whole dataset from the
   main thread each keystroke — only INDEX once, then QUERY repeatedly.

   No external fuzzy-search library — a small custom scorer (exact
   substring match ranks highest, then per-word prefix match, then
   loose character-sequence match) keeps this dependency-free and fast
   enough for a single school's dataset sizes.

   Incoming message:
     { type: 'INDEX', payload: { collection, items, fields } }
       items: [{...}], fields: which keys to search across, e.g. ['name','code']
     { type: 'QUERY', payload: { collection, query, limit = 50, includeScores = false } }
     { type: 'CLEAR', payload: { collection } }
     { type: 'STATUS', payload: { collection } }
     { type: 'CLEAR_ALL' }

   Outgoing:
     { type: 'INDEXED', payload: { collection, count } }
     { type: 'RESULTS', payload: { collection, query, results, total } }
     { type: 'STATUS', payload: { collection, count, fields } }
     { type: 'ERROR', payload: { message } }

   Last updated: 2026-07-13
   ═══════════════════════════════════════════════════════════════════ */

// ─── STATE ─────────────────────────────────────────────────────────────

const indexes = new Map(); // collection -> { items, fields, indexedAt }

// ─── SCORING FUNCTIONS ─────────────────────────────────────────────────

/**
 * Check if a query is a subsequence of a value (characters appear in order)
 * @param {string} query - The search query
 * @param {string} value - The value to search in
 * @returns {boolean} True if query is a subsequence of value
 */
function isSubsequence(query, value) {
  let qi = 0;
  const qLen = query.length;
  const vLen = value.length;

  for (let vi = 0; vi < vLen && qi < qLen; vi++) {
    if (value[vi] === query[qi]) {
      qi++;
    }
  }
  return qi === qLen;
}

/**
 * Calculate a score for an item based on query matching
 * @param {object} item - The item to score
 * @param {array} fields - Fields to search in
 * @param {string} queryLower - Lowercase query string
 * @param {string} queryOriginal - Original query for exact matching
 * @returns {object} { score, matches: { field: [matched values] } }
 */
function scoreItem(item, fields, queryLower, queryOriginal) {
  let bestScore = 0;
  const matches = {};

  for (const field of fields) {
    const rawValue = item[field];
    if (rawValue === null || rawValue === undefined) continue;

    const value = String(rawValue);
    const valueLower = value.toLowerCase();

    if (!valueLower) continue;

    // ── Exact match (highest priority) ──
    if (valueLower === queryLower) {
      return { score: 100, matches: { [field]: [value] } };
    }

    // ── Starts with query ──
    if (valueLower.startsWith(queryLower)) {
      const s = 85;
      if (s > bestScore) {
        bestScore = s;
        matches[field] = [value];
      }
      continue;
    }

    // ── Contains word starting with query ──
    const words = valueLower.split(/\s+/);
    let wordMatch = false;
    for (const word of words) {
      if (word.startsWith(queryLower) && word.length > queryLower.length) {
        wordMatch = true;
        break;
      }
    }
    if (wordMatch) {
      const s = 70;
      if (s > bestScore) {
        bestScore = s;
        matches[field] = [value];
      }
      continue;
    }

    // ── Contains query anywhere (substring) ──
    if (valueLower.includes(queryLower)) {
      const s = 60;
      if (s > bestScore) {
        bestScore = s;
        matches[field] = [value];
      }
      continue;
    }

    // ── Subsequence match (loose) ──
    if (isSubsequence(queryLower, valueLower)) {
      const s = 40;
      if (s > bestScore) {
        bestScore = s;
        matches[field] = [value];
      }
      continue;
    }

    // ── Word-level fuzzy: any word contains query as subsequence ──
    for (const word of words) {
      if (word.length > 2 && isSubsequence(queryLower, word)) {
        const s = 30;
        if (s > bestScore) {
          bestScore = s;
          matches[field] = [value];
        }
        break;
      }
    }
  }

  // ── Final score with field weighting ──
  // Weight certain fields higher (e.g., name > code > description)
  let fieldWeight = 1;
  if (matches['name'] || matches['fullName'] || matches['studentName'] || matches['teacherName']) {
    fieldWeight = 1.2;
  } else if (matches['code'] || matches['studentCode'] || matches['teacherCode']) {
    fieldWeight = 1.1;
  }

  return { score: Math.min(100, bestScore * fieldWeight), matches };
}

/**
 * Search a collection with a query
 * @param {string} collection - Collection name
 * @param {string} queryStr - Search query
 * @param {number} limit - Max results
 * @param {boolean} includeScores - Include score in results
 * @returns {array} Matching items
 */
function queryCollection(collection, queryStr, limit, includeScores) {
  const idx = indexes.get(collection);

  if (!idx) {
    return [];
  }

  const queryTrimmed = queryStr.trim();
  if (!queryTrimmed) {
    return idx.items.slice(0, limit);
  }

  const queryLower = queryTrimmed.toLowerCase();

  const scored = idx.items
    .map(item => {
      const { score, matches } = scoreItem(item, idx.fields, queryLower, queryTrimmed);
      return { item, score, matches };
    })
    .filter(r => r.score > 0)
    .sort((a, b) => {
      // Sort by score descending, then by name if available
      if (b.score !== a.score) return b.score - a.score;
      const aName = a.item.name || a.item.studentName || a.item.fullName || '';
      const bName = b.item.name || b.item.studentName || b.item.fullName || '';
      return aName.localeCompare(bName);
    })
    .slice(0, limit);

  if (includeScores) {
    return scored.map(r => ({ ...r.item, _searchScore: r.score, _searchMatches: r.matches }));
  }

  return scored.map(r => r.item);
}

// ─── HANDLERS ──────────────────────────────────────────────────────────

function handleIndex(payload) {
  const { collection, items, fields } = payload;

  if (!collection || typeof collection !== 'string') {
    self.postMessage({ type: 'ERROR', payload: { message: 'Invalid collection name' } });
    return;
  }

  if (!Array.isArray(items)) {
    self.postMessage({ type: 'ERROR', payload: { message: 'Items must be an array' } });
    return;
  }

  if (!Array.isArray(fields) || fields.length === 0) {
    self.postMessage({ type: 'ERROR', payload: { message: 'Fields must be a non-empty array' } });
    return;
  }

  indexes.set(collection, {
    items: items,
    fields: fields,
    indexedAt: Date.now()
  });

  self.postMessage({
    type: 'INDEXED',
    payload: {
      collection: collection,
      count: items.length,
      fields: fields,
      indexedAt: new Date().toISOString()
    }
  });
}

function handleQuery(payload) {
  const { collection, query, limit = 50, includeScores = false } = payload;

  if (!collection || typeof collection !== 'string') {
    self.postMessage({ type: 'ERROR', payload: { message: 'Invalid collection name' } });
    return;
  }

  const results = queryCollection(collection, query || '', limit, includeScores);

  self.postMessage({
    type: 'RESULTS',
    payload: {
      collection: collection,
      query: query || '',
      results: results,
      total: results.length,
      limit: limit
    }
  });
}

function handleStatus(payload) {
  const { collection } = payload;

  if (collection) {
    const idx = indexes.get(collection);
    if (idx) {
      self.postMessage({
        type: 'STATUS',
        payload: {
          collection: collection,
          count: idx.items.length,
          fields: idx.fields,
          indexedAt: new Date(idx.indexedAt).toISOString()
        }
      });
    } else {
      self.postMessage({
        type: 'STATUS',
        payload: {
          collection: collection,
          count: 0,
          fields: [],
          indexedAt: null
        }
      });
    }
  } else {
    // Return all collections status
    const status = {};
    for (const [name, idx] of indexes) {
      status[name] = {
        count: idx.items.length,
        fields: idx.fields,
        indexedAt: new Date(idx.indexedAt).toISOString()
      };
    }
    self.postMessage({
      type: 'STATUS',
      payload: {
        collections: status,
        totalCollections: indexes.size,
        totalItems: Array.from(indexes.values()).reduce((sum, idx) => sum + idx.items.length, 0)
      }
    });
  }
}

function handleClear(payload) {
  const { collection } = payload;

  if (collection) {
    const deleted = indexes.delete(collection);
    self.postMessage({
      type: 'CLEARED',
      payload: {
        collection: collection,
        deleted: deleted
      }
    });
  } else {
    // Clear all
    const count = indexes.size;
    indexes.clear();
    self.postMessage({
      type: 'CLEARED',
      payload: {
        collection: 'all',
        deleted: true,
        count: count
      }
    });
  }
}

function handleClearAll() {
  const count = indexes.size;
  indexes.clear();
  self.postMessage({
    type: 'CLEARED',
    payload: {
      collection: 'all',
      deleted: true,
      count: count
    }
  });
}

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────

self.onmessage = function (e) {
  try {
    const { type, payload = {} } = e.data;

    switch (type) {
      case 'INDEX':
        handleIndex(payload);
        break;

      case 'QUERY':
        handleQuery(payload);
        break;

      case 'STATUS':
        handleStatus(payload);
        break;

      case 'CLEAR':
        handleClear(payload);
        break;

      case 'CLEAR_ALL':
        handleClearAll();
        break;

      default:
        self.postMessage({
          type: 'ERROR',
          payload: { message: `Unknown message type: ${type}` }
        });
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      payload: {
        message: error.message || 'Unknown error',
        stack: error.stack
      }
    });
  }
};

// ─── ERROR HANDLING FOR UNCAUGHT ERRORS ──────────────────────────────

self.onerror = function (error) {
  self.postMessage({
    type: 'ERROR',
    payload: {
      message: error.message || 'Uncaught error in worker',
      filename: error.filename,
      lineno: error.lineno,
      colno: error.colno
    }
  });
};

// ─── LOGGING (optional, can be enabled for debugging) ─────────────────

console.log('[SearchWorker] Worker loaded and ready');