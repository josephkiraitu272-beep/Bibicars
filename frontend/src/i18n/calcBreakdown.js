/**
 * Localise calculator breakdown row labels based on their stable ``key``.
 *
 * The backend (see /app/backend/app/services/calculator.py) always returns
 * English labels for breakdown items, e.g. { key: 'auctionBuyerFee', label:
 * 'Auction Buyer Fee' }.  In the CRM (admin / manager / team-lead cabinets)
 * we want the label to switch to the active UI language (EN / BG / UK).
 *
 * This helper is a *view-only* transform: it never mutates the backend
 * data, only produces a display string.  If no translation exists for the
 * given ``key``, the original English ``row.label`` is returned so that
 * newly-added breakdown rows continue to render (fail-safe).
 *
 * Some labels are parametric — e.g. cargo insurance carries the applied
 * rate inside the English label ("Cargo Insurance (2%)").  For those keys
 * the translation is a template containing ``{rate}`` and we substitute
 * the rate parsed from the original label.
 */

/**
 * Return the localised label for a breakdown row.
 *
 * @param {{key?: string, label?: string}} row  Breakdown row from the API.
 * @param {(key: string) => string}       t    ``useLang().t`` translator.
 * @returns {string}
 */
export function localizeBreakdownLabel(row, t) {
  if (!row) return '';
  const key = row.key;
  const original = row.label || '';
  if (!key || typeof t !== 'function') return original;

  const tKey = 'calcBreakdown_' + key;
  const translated = t(tKey);
  // useLang().t falls back to the raw key when no translation is found,
  // so treat that as "no translation available".
  if (!translated || translated === tKey) return original;

  // Parametric substitution for rows whose backend label carries a value
  // in parentheses (e.g. "Cargo Insurance (2%)").  The template contains
  // ``{rate}`` which we extract from the original English label.
  if (translated.includes('{rate}')) {
    const m = original.match(/\(([\d.]+)%\)/);
    const rate = m ? m[1] : '';
    return translated.replace('{rate}', rate);
  }

  return translated;
}

/**
 * Convenience helper that returns a new row object with a localised
 * ``label`` field, leaving the original object untouched.  Useful when
 * downstream code wants to keep passing the row around instead of just
 * the string.
 */
export function localizeBreakdownRow(row, t) {
  if (!row) return row;
  return { ...row, label: localizeBreakdownLabel(row, t) };
}

export default localizeBreakdownLabel;
