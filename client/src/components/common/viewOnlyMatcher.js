// Decides whether a control (button / link) is a data-changing action.
// Used by <ViewOnlyGuard /> to hide such controls for view-only roles (QB).
// Deliberately conservative: only clear action labels, titles, icons and class
// names match; navigation, filters, exports, refresh, print, close and cancel
// never do. (The API rejects every mutation from QB regardless.)

const clean = (text = '') =>
  String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}&()\s-]/gu, ' ') // drop emoji, +, ×, arrows, punctuation
    .replace(/\s+/g, ' ')
    .trim();

// Whole-label patterns (applied to the cleaned label).
const ACTION_LABELS = [
  /^(add|create|new|edit|update|delete|remove|save|submit|approve|reject|release|reimburse|rename|restore|activate|deactivate|enable|disable|upload)(\s|$)/,
  /^pay(\s+(now|selected|all|bill|bills|invoice|invoices))?(\s|\(|$)/,
  /^(make|record) (an )?(advance )?payment/,
  /^(apply |create )?credit note$/,
  /^(receive cash|receive payment|settle|settle now|settle invoice|confirm settlement|allocate all|allocate)$/,
  /^(order|create order|confirm order|cancel order|go to invoice)$/,
  /^approve (&|and) post$/,
  /^mark (as )?(paid|released|returned|completed)/
];

// Never hide these, even if a pattern above would match.
const KEEP_LABELS = /^(cancel|close|back|clear|reset|search|export|print|refresh|retry|view|filter|filters|apply filters|show|hide|logout|pdf|excel|download)/;

const ACTION_ICONS = new Set([
  'pen', 'pen-to-square', 'pencil', 'edit', 'trash', 'trash-can', 'trash-alt',
  'plus', 'circle-plus', 'plus-circle', 'square-plus', 'floppy-disk', 'save', 'user-plus'
]);

// Class-name tokens (split on - and _) that mark an action button.
const ACTION_CLASS_TOKENS = new Set(['edit', 'delete', 'remove', 'add', 'pay', 'save', 'approve', 'allocate']);
const KEEP_CLASS_TOKENS = new Set(['close', 'cancel', 'filter', 'filters', 'export', 'search', 'clear', 'view', 'toggle']);

export const isActionLabel = (raw) => {
  const label = clean(raw);
  if (!label) return false;
  if (KEEP_LABELS.test(label)) return false;
  return ACTION_LABELS.some((re) => re.test(label));
};

const classTokens = (el) =>
  String(el.getAttribute('class') || '')
    .toLowerCase()
    .split(/\s+/)
    .flatMap((c) => c.split(/[-_]/))
    .filter(Boolean);

export const isActionControl = (el) => {
  if (!el || el.nodeType !== 1) return false;

  const tokens = classTokens(el);
  if (tokens.some((t) => KEEP_CLASS_TOKENS.has(t))) return false;

  const ownText = el.tagName === 'INPUT' ? el.value : el.textContent;
  const labels = [el.getAttribute('aria-label'), el.getAttribute('title'), ownText];
  if (labels.some((l) => l && isActionLabel(l))) return true;

  if (el.querySelector) {
    const icons = el.querySelectorAll('svg[data-icon]');
    for (const icon of icons) {
      if (ACTION_ICONS.has(icon.getAttribute('data-icon'))) {
        const text = clean(el.textContent);
        // Icon-only, or icon + an action label. Not e.g. a nav/tab button with text.
        if (!text || isActionLabel(text)) return true;
      }
    }
  }

  return tokens.some((t) => ACTION_CLASS_TOKENS.has(t)) || /(^|\s)income-new-btn(\s|$)/.test(el.getAttribute('class') || '');
};

export const CONTROL_SELECTOR = 'button, a, [role="button"], input[type="button"], input[type="submit"]';
