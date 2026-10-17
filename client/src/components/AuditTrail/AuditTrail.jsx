// src/components/AuditTrail/AuditTrail.jsx
//
// Audit Trail (Admin / Super Admin): every sign-in event, sign-out, password
// change, data change and refused request, newest first. Rows are recorded by
// the server (server/services/auditLog.js) and cannot be edited or deleted.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUserShield, faFilter, faRotateLeft, faEye, faChevronLeft, faChevronRight, faXmark, faClockRotateLeft
} from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import api from '../../api';
import { PageHeader, Modal, StatusBadge, EmptyState } from '../common/ui';
import './AuditTrail.css';

export const ACTION_LABELS = {
  LOGIN: 'Signed in',
  LOGIN_FAILED: 'Sign-in failed',
  LOGIN_BLOCKED: 'Sign-in blocked',
  LOGOUT: 'Signed out',
  PASSWORD_CHANGE: 'Password change',
  CREATE: 'Created',
  UPDATE: 'Edited',
  DELETE: 'Deleted',
  APPROVE: 'Approved',
  REJECT: 'Rejected',
  RESTORE: 'Restored',
  CANCEL: 'Cancelled',
  CLOSE: 'Closed again',
  SUBMIT: 'Submitted',
  PAY: 'Payment',
  SETTLE: 'Settlement',
  ADJUST: 'Adjusted',
  RELEASE: 'Released',
  STATUS_CHANGE: 'Status changed',
  CONNECT: 'Connected',
  SYNC: 'POS / Restaurant sync',
  ACCESS_DENIED: 'Access denied'
};

const EVENT_TYPES = [
  { value: '', label: 'All events' },
  { value: 'AUTH', label: 'Sign-in / sign-out' },
  { value: 'CHANGE', label: 'Data changes' },
  { value: 'DENIED', label: 'Access denied' },
  { value: 'SYNC', label: 'POS / Restaurant sync' }
];


export const actionLabel = (action) => ACTION_LABELS[action] || String(action || '').replace(/_/g, ' ').toLowerCase()
  .replace(/^\w/, (c) => c.toUpperCase());

// Badge colour: failures and refusals stand out; sign-in events are informational.
const actionTone = (row) => {
  if (row.event_type === 'DENIED' || row.action === 'LOGIN_BLOCKED') return 'danger';
  if (row.outcome === 'FAILED') return 'warning';
  if (row.event_type === 'AUTH') return 'info';
  if (row.action === 'DELETE' || row.action === 'CANCEL' || row.action === 'REJECT') return 'danger';
  return 'success';
};

const PAGE_SIZES = [25, 50, 100];

const defaultFilters = () => ({
  from: dayjs().subtract(6, 'day').format('YYYY-MM-DD'),
  to: dayjs().format('YYYY-MM-DD'),
  userId: '',
  eventType: '',
  module: '',
  outcome: '',
  search: '',
  sessionId: ''
});

const formatTime = (value) => (value ? dayjs(value).format('DD MMM YYYY, HH:mm:ss') : '-');
const shortSession = (id) => (id ? `${String(id).slice(0, 8)}...` : '-');

const JsonBlock = ({ value, empty }) => {
  if (value === null || value === undefined || (typeof value === 'object' && Object.keys(value).length === 0)) {
    return <p className="audit-muted">{empty}</p>;
  }
  return <pre className="audit-json">{typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>;
};

const DetailRow = ({ label, children }) => (
  <div className="audit-detail-row">
    <dt>{label}</dt>
    <dd>{children ?? '-'}</dd>
  </div>
);

// The Record column: the record by the name people know it ("Purchase invoice
// INV-1024"); events recorded before names were kept fall back to the number.
export const recordText = (row) => {
  if (row.record_label) return row.record_label;
  if (row.event_type === 'AUTH') return '-';
  return row.entity_id ? `Record no. ${row.entity_id}` : '-';
};

// ---------------------------------------------------------------------------
// Detail view in plain language (the server sends it as `plain`, with real
// names instead of ids). The raw request / response stay under "Technical details".
// ---------------------------------------------------------------------------
const NOT_RECORDED = <span className="audit-muted">Not recorded</span>;

const Fact = ({ label, children }) => (
  <div className="audit-fact">
    <dt>{label}</dt>
    <dd>{children === null || children === undefined || children === '' ? NOT_RECORDED : children}</dd>
  </div>
);

const ValuesTable = ({ rows, caption, beforeLabel = 'Previous value', afterLabel = 'New value' }) => (
  <table className="audit-changes-table">
    <caption className="sr-only">{caption}</caption>
    <thead>
      <tr><th scope="col">What changed</th><th scope="col">{beforeLabel}</th><th scope="col">{afterLabel}</th></tr>
    </thead>
    <tbody>
      {rows.map((c) => (
        <tr key={c.field}>
          <th scope="row">{c.label}</th>
          <td className="audit-old">{c.before}</td>
          <td className="audit-new">{c.after}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const SyncResult = ({ sync }) => (
  <div className="audit-sync">
    <ul className="audit-sync-counts">
      <li><strong>{sync.fetched}</strong> records read</li>
      <li><strong>{sync.created}</strong> new</li>
      <li><strong>{sync.updated}</strong> updated</li>
      <li className={sync.rejected ? 'is-alert' : ''}><strong>{sync.rejected}</strong> rejected</li>
      <li className={sync.unmapped ? 'is-alert' : ''}><strong>{sync.unmapped}</strong> not matched to a department</li>
    </ul>
    {sync.error && <p className="audit-why">Problem: {sync.error}</p>}
    {sync.rejectedRecords.length > 0 && (
      <>
        <h4>Rejected records</h4>
        <ul className="audit-plain-list">
          {sync.rejectedRecords.map((r, i) => (
            <li key={i}>{r.source}{r.record ? ` record ${r.record}` : ''}: {r.reason}</li>
          ))}
        </ul>
      </>
    )}
  </div>
);

const PlainDetail = ({ event, plain, onShowSession }) => {
  const failed = plain.result === 'Failed';
  const isRecordEvent = event.event_type === 'CHANGE' || event.event_type === 'DENIED';
  const editVerb = ['edited', 'adjusted', 'changed the status of'].includes(plain.action);
  return (
    <div className="audit-plain">
      <div className={`audit-headline ${failed ? 'is-failed' : ''}`.trim()}>
        <p>{plain.headline}</p>
        <StatusBadge tone={failed ? 'danger' : 'success'}>{plain.result}</StatusBadge>
      </div>
      {failed && plain.resultMessage && <p className="audit-why">Why it did not go through: {plain.resultMessage}</p>}
      {!failed && plain.resultMessage && event.event_type === 'CHANGE' && <p className="audit-note">Message shown: {plain.resultMessage}</p>}

      <dl className="audit-facts">
        <Fact label="Time">{plain.when}</Fact>
        <Fact label={editVerb ? 'Who edited it' : 'Done by'}>
          {plain.who ? `${plain.who.name}${plain.who.role ? ` (${plain.who.role})` : ''}` : null}
        </Fact>
        {isRecordEvent && <Fact label="Record">{plain.record}</Fact>}
        {plain.module && <Fact label="Section of the system">{plain.module}</Fact>}
        {isRecordEvent && (
          <Fact label="Who created it">
            {plain.createdBy ? `${plain.createdBy}${plain.createdAt ? `, ${plain.createdAt}` : ''}` : null}
          </Fact>
        )}
        {isRecordEvent && <Fact label="Approver">{plain.approver}</Fact>}
        {isRecordEvent && <Fact label="Reason / note">{plain.reason}</Fact>}
        <Fact label="Computer used">{[plain.device, plain.ip ? `IP ${plain.ip}` : null].filter(Boolean).join(' - ') || null}</Fact>
      </dl>

      {plain.changes.length > 0 && (
        <section>
          <h3>Changes</h3>
          <ValuesTable rows={plain.changes} caption="Changed values" />
        </section>
      )}
      {plain.deleted && (
        <section>
          <h3>Changes</h3>
          <p className="audit-changes-deleted">This record was deleted. These were its values:</p>
          {plain.deletedValues.length > 0 && <ValuesTable rows={plain.deletedValues} caption="Deleted values" afterLabel="Now" />}
        </section>
      )}
      {plain.lineItems.length > 0 && (
        <section>
          <h3>Items</h3>
          <ul className="audit-plain-list">
            {plain.lineItems.map((item, i) => <li key={i} className={`is-${item.kind}`}>{item.text}</li>)}
          </ul>
        </section>
      )}
      {plain.enteredValues.length > 0 && (
        <section>
          <h3>What was entered</h3>
          <dl className="audit-facts">
            {plain.enteredValues.map((v) => <Fact key={v.field} label={v.label}>{v.value}</Fact>)}
          </dl>
        </section>
      )}
      {event.event_type === 'CHANGE' && !failed && !plain.changes.length && !plain.deleted
        && !plain.lineItems.length && !plain.enteredValues.length && (
        <p className="audit-muted">No individual values were recorded for this action. See the technical details.</p>
      )}
      {plain.sync && (
        <section>
          <h3>Import result</h3>
          <SyncResult sync={plain.sync} />
        </section>
      )}

      {event.session_id && (
        <button type="button" className="btn btn-sm btn-secondary audit-session-button" onClick={() => onShowSession(event.session_id)}>
          <FontAwesomeIcon icon={faClockRotateLeft} /> Show everything this user did in this sign-in
        </button>
      )}

      <details className="audit-technical">
        <summary>Technical details (for IT support)</summary>
        <div className="audit-detail">
          <section>
            <dl>
              <DetailRow label="Event no.">{event.id}</DetailRow>
              <DetailRow label="Action code">{event.action}</DetailRow>
              <DetailRow label="Request"><code>{event.method} {event.path}{event.query_string ? `?${event.query_string}` : ''}</code></DetailRow>
              <DetailRow label="Status code">{event.status_code ?? '-'}</DetailRow>
              <DetailRow label="Took">{event.duration_ms !== null && event.duration_ms !== undefined ? `${event.duration_ms} ms` : '-'}</DetailRow>
            </dl>
          </section>
          <section>
            <dl>
              <DetailRow label="Username">{event.username || '-'}</DetailRow>
              <DetailRow label="Session">{event.session_id ? <code title={event.session_id}>{shortSession(event.session_id)}</code> : '-'}</DetailRow>
              <DetailRow label="Forwarded for">{event.forwarded_for || '-'}</DetailRow>
              <DetailRow label="Browser"><span className="audit-break">{event.user_agent || '-'}</span></DetailRow>
            </dl>
          </section>
          <section className="audit-detail-wide">
            <h4>Data sent</h4>
            <JsonBlock value={event.request_body} empty="No data was sent." />
          </section>
          <section className="audit-detail-wide">
            <h4>Server response</h4>
            <JsonBlock value={event.response_body} empty="No response data." />
          </section>
          {event.old_values && (
            <section className="audit-detail-wide">
              <h4>Record before</h4>
              <JsonBlock value={event.old_values} empty="-" />
            </section>
          )}
          {event.new_values && (
            <section className="audit-detail-wide">
              <h4>Record after</h4>
              <JsonBlock value={event.new_values} empty="-" />
            </section>
          )}
          <p className="audit-muted audit-detail-wide">Passwords and sign-in tokens are never stored; they show as [REDACTED].</p>
        </div>
      </details>
    </div>
  );
};


const AuditTrail = () => {
  const [filters, setFilters] = useState(defaultFilters);
  const [applied, setApplied] = useState(defaultFilters);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [summary, setSummary] = useState(null);
  const [options, setOptions] = useState({ users: [], modules: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const params = useMemo(() => {
    const p = {};
    Object.entries(applied).forEach(([key, value]) => { if (value !== '' && value !== null) p[key] = value; });
    return p;
  }, [applied]);

  useEffect(() => {
    api.get('/audit-logs/filters')
      .then((res) => setOptions({ users: res.data.users || [], modules: res.data.modules || [] }))
      .catch(() => setOptions({ users: [], modules: [] }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [list, totals] = await Promise.all([
        api.get('/audit-logs', { params: { ...params, page, limit } }),
        api.get('/audit-logs/summary', { params })
      ]);
      setData({ rows: list.data.rows || [], total: list.data.total || 0 });
      setSummary(totals.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the audit trail.');
      setData({ rows: [], total: 0 });
    } finally {
      setLoading(false);
    }
  }, [params, page, limit]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    setApplied({ ...filters });
  };

  const resetFilters = () => {
    const fresh = defaultFilters();
    setFilters(fresh);
    setApplied(fresh);
    setPage(1);
  };

  const showSession = (sessionId) => {
    // A session can span days: drop the date range, keep only the session.
    const next = { ...defaultFilters(), from: '', to: '', sessionId };
    setFilters(next);
    setApplied(next);
    setPage(1);
    setSelected(null);
  };

  const openDetail = async (row) => {
    setSelected(row);
    setDetailLoading(true);
    try {
      const res = await api.get(`/audit-logs/${row.id}`);
      setSelected(res.data);
    } catch (err) {
      setSelected({ ...row, loadError: err.response?.data?.error || 'Could not load the details.' });
    } finally {
      setDetailLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(data.total / limit));
  const firstRow = data.total === 0 ? 0 : (page - 1) * limit + 1;
  const lastRow = Math.min(page * limit, data.total);

  const tiles = summary ? [
    { label: 'Events', value: summary.total },
    { label: 'Sign-ins', value: summary.logins },
    { label: 'Failed sign-ins', value: summary.failedLogins, alert: summary.failedLogins > 0 },
    { label: 'Data changes', value: summary.changes, note: summary.failedChanges ? `${summary.failedChanges} failed` : null },
    { label: 'Access denied', value: summary.denied, alert: summary.denied > 0 },
    { label: 'Sync problems', value: summary.failedSyncs || 0, alert: summary.failedSyncs > 0 },
    { label: 'Users', value: summary.users }
  ] : [];

  return (
    <div className="audit-trail-page">
      <PageHeader
        eyebrow="Security"
        title="Audit Trail"
        subtitle="Every sign-in, sign-out, password change, data change and refused action, recorded by the server. Records cannot be edited or deleted."
      />

      {tiles.length > 0 && (
        <section className="audit-tiles" aria-label="Summary for the selected filters">
          {tiles.map((tile) => (
            <div key={tile.label} className={`audit-tile ${tile.alert ? 'is-alert' : ''}`.trim()}>
              <span className="audit-tile-label">{tile.label}</span>
              <strong className="audit-tile-value">{tile.value.toLocaleString()}</strong>
              {tile.note && <span className="audit-tile-note">{tile.note}</span>}
            </div>
          ))}
        </section>
      )}

      <form className="audit-filters" onSubmit={applyFilters} aria-label="Audit trail filters">
        <label>
          <span>From</span>
          <input type="date" name="from" value={filters.from} onChange={handleChange} max={filters.to || undefined} />
        </label>
        <label>
          <span>To</span>
          <input type="date" name="to" value={filters.to} onChange={handleChange} min={filters.from || undefined} />
        </label>
        <label>
          <span>User</span>
          <select name="userId" value={filters.userId} onChange={handleChange}>
            <option value="">All users</option>
            {options.users.map((u) => (
              <option key={u.id} value={u.id}>{u.name || u.username}{u.role ? ` (${u.role})` : ''}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Event</span>
          <select name="eventType" value={filters.eventType} onChange={handleChange}>
            {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label>
          <span>Module</span>
          <select name="module" value={filters.module} onChange={handleChange}>
            <option value="">All modules</option>
            {options.modules.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>
          <span>Result</span>
          <select name="outcome" value={filters.outcome} onChange={handleChange}>
            <option value="">All results</option>
            <option value="SUCCESS">Successful</option>
            <option value="FAILED">Failed</option>
          </select>
        </label>
        <label className="audit-filter-search">
          <span>Search</span>
          <input
            type="search"
            name="search"
            value={filters.search}
            onChange={handleChange}
            placeholder="Record no., page, IP, message or data"
          />
        </label>
        <div className="audit-filter-actions">
          <button type="submit" className="btn btn-primary"><FontAwesomeIcon icon={faFilter} /> Apply</button>
          <button type="button" className="btn btn-secondary" onClick={resetFilters}><FontAwesomeIcon icon={faRotateLeft} /> Reset</button>
        </div>
      </form>

      {applied.sessionId && (
        <div className="audit-session-chip" role="status">
          <FontAwesomeIcon icon={faClockRotateLeft} />
          Showing one sign-in session: <code>{applied.sessionId}</code>
          <button type="button" onClick={resetFilters} aria-label="Show all sessions">
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
      )}

      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th scope="col">Date &amp; time</th>
              <th scope="col">User</th>
              <th scope="col">Action</th>
              <th scope="col">Module</th>
              <th scope="col">Record</th>
              <th scope="col">Result</th>
              <th scope="col">IP address</th>
              <th scope="col"><span className="sr-only">Details</span></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="audit-loading">Loading audit trail...</td></tr>
            )}
            {!loading && data.rows.map((row) => (
              <tr key={row.id} className={row.outcome === 'FAILED' ? 'is-failed' : ''}>
                <td className="audit-nowrap">{formatTime(row.occurred_at)}</td>
                <td>
                  <div className="audit-user">
                    <span>{row.user_name || row.username || 'Unknown'}</span>
                    <small>{row.user_id ? (row.user_role || '') : 'Not signed in'}</small>
                  </div>
                </td>
                <td><StatusBadge tone={actionTone(row)}>{actionLabel(row.action)}</StatusBadge></td>
                <td>{row.module || '-'}</td>
                <td className="audit-record">{recordText(row)}</td>
                <td>
                  <span className={`audit-result ${row.outcome === 'FAILED' ? 'is-failed' : 'is-ok'}`}>
                    {row.outcome === 'FAILED' ? 'Failed' : 'Success'}
                  </span>
                  {row.outcome === 'FAILED' && row.message && <small className="audit-result-message">{row.message}</small>}
                </td>
                <td className="audit-mono">{row.ip_address || '-'}</td>
                <td>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => openDetail(row)} aria-label={`View details of event ${row.id}`}>
                    <FontAwesomeIcon icon={faEye} /> View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !error && data.rows.length === 0 && (
          <EmptyState
            icon={faUserShield}
            title="No audit events found"
            description="Nothing was recorded for these filters. Widen the date range or clear the filters."
          />
        )}
      </div>

      <div className="audit-pagination">
        <span>{firstRow.toLocaleString()}-{lastRow.toLocaleString()} of {data.total.toLocaleString()}</span>
        <label>
          <span>Rows</span>
          <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
            {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-sm btn-secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
          <FontAwesomeIcon icon={faChevronLeft} />
        </button>
        <span>Page {page} of {totalPages}</span>
        <button type="button" className="btn btn-sm btn-secondary" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
          <FontAwesomeIcon icon={faChevronRight} />
        </button>
      </div>

      {selected && (
        <Modal
          open
          size="lg"
          title="What happened"
          subtitle={formatTime(selected.occurred_at)}
          icon={<FontAwesomeIcon icon={faUserShield} />}
          onClose={() => setSelected(null)}
          closeOnOverlay
        >
          {selected.loadError && <div className="alert alert-error">{selected.loadError}</div>}
          {detailLoading && <p className="audit-muted">Loading details...</p>}
          {!detailLoading && selected.plain && (
            <PlainDetail event={selected} plain={selected.plain} onShowSession={showSession} />
          )}
        </Modal>
      )}
    </div>
  );
};

export default AuditTrail;
