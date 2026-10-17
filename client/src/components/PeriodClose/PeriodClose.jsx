// src/components/PeriodClose/PeriodClose.jsx
//
// Period Close (Admin / Super Admin). Only the last few months are open; older
// months are closed, so a finished month never changes behind a report that was
// already issued. To correct a closed month an Admin asks to re-open it, the Super
// Admin approves for a number of hours, and meanwhile only an Admin can post or edit
// in it. Rules are enforced by the server (server/services/periodLock.js).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faLockOpen, faPaperPlane, faCheck, faXmark, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import dayjs from 'dayjs';
import api from '../../api';
import { usePopup } from '../context/PopupContext';
import usePermissions from '../../hooks/usePermissions';
import { ROLES } from '../../config/rolePermissions';
import { PageHeader, Modal, StatusBadge, EmptyState, useConfirm } from '../common/ui';
import './PeriodClose.css';

const TONE_BY_STATUS = { Pending: 'warning', Approved: 'success', Rejected: 'danger', Closed: 'neutral', Expired: 'neutral' };

const DEFAULT_HOURS = 24;
const MAX_HOURS = 168;
const REASON_MIN = 10;

export const monthText = (ym) => (ym ? dayjs(`${ym}-01`).format('MMM YYYY') : '-');
export const monthsText = (from, to) => (from === to ? monthText(from) : `${monthText(from)} - ${monthText(to)}`);

/** 'YYYY-MM' of the last closed month, from the first open date ('YYYY-MM-01'). */
export const lastClosedMonth = (closedBefore) => (
  closedBefore ? dayjs(closedBefore).subtract(1, 'day').format('YYYY-MM') : ''
);

export const timeLeft = (expiresAt, now = dayjs()) => {
  const minutes = dayjs(expiresAt).diff(now, 'minute');
  if (minutes <= 0) return 'expired';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m left` : `${rest}m left`;
};

const formatTime = (value) => (value ? dayjs(value).format('DD MMM YYYY, HH:mm') : '-');

const errorText = (error, fallback) => error?.response?.data?.error || fallback;

const PeriodClose = () => {
  const { showPopup } = usePopup();
  const confirm = useConfirm();
  const { role } = usePermissions();
  const isSuperAdmin = role === ROLES.SUPER_ADMIN;

  const [status, setStatus] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ from_month: '', to_month: '', reason: '' });
  const [sending, setSending] = useState(false);
  const [decision, setDecision] = useState(null); // { type: 'approve' | 'reject', request }
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [statusResponse, requestsResponse] = await Promise.all([
        api.get('/period-close/status'),
        api.get('/period-close/requests')
      ]);
      setStatus(statusResponse.data);
      setRequests(requestsResponse.data || []);
    } catch (error) {
      setLoadError(errorText(error, 'Could not load the period status'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const latestClosed = useMemo(() => lastClosedMonth(status?.closed_before), [status]);
  const openNow = useMemo(() => requests.filter((request) => request.is_active), [requests]);
  const pendingCount = useMemo(() => requests.filter((request) => request.status === 'Pending').length, [requests]);

  const setField = (name) => (event) => setForm((prev) => ({ ...prev, [name]: event.target.value }));

  const submitRequest = async (event) => {
    event.preventDefault();
    const to = form.to_month || form.from_month;
    if (!form.from_month) return showPopup('error', 'Choose the month to re-open');
    if (form.from_month > to) return showPopup('error', 'The first month cannot be after the last month');
    if (form.reason.trim().length < REASON_MIN) return showPopup('error', `Give the reason (at least ${REASON_MIN} characters)`);

    setSending(true);
    try {
      const response = await api.post('/period-close/requests', { from_month: form.from_month, to_month: to, reason: form.reason.trim() });
      showPopup('success', response.data?.message || 'Request sent');
      setForm({ from_month: '', to_month: '', reason: '' });
      await load();
    } catch (error) {
      showPopup('error', errorText(error, 'Could not send the request'));
    } finally {
      setSending(false);
    }
  };

  const openDecision = (type, request) => {
    setDecision({ type, request });
    setHours(DEFAULT_HOURS);
    setNote('');
  };

  const submitDecision = async () => {
    const { type, request } = decision;
    if (type === 'reject' && !note.trim()) return showPopup('error', 'Give a reason for rejecting the request');
    if (type === 'approve' && (!Number.isInteger(Number(hours)) || Number(hours) < 1 || Number(hours) > MAX_HOURS)) {
      return showPopup('error', `Open it for 1 to ${MAX_HOURS} hours`);
    }
    setDeciding(true);
    try {
      const response = type === 'approve'
        ? await api.post('/period-close/approve', { id: request.id, hours: Number(hours), note: note.trim() })
        : await api.post('/period-close/reject', { id: request.id, note: note.trim() });
      showPopup('success', response.data?.message || 'Done');
      setDecision(null);
      await load();
    } catch (error) {
      showPopup('error', errorText(error, 'Could not save the decision'));
    } finally {
      setDeciding(false);
    }
  };

  const closeAgain = async (request) => {
    const ok = await confirm({
      title: 'Close these months again?',
      message: `${monthsText(request.from_month, request.to_month)} will be closed right away, before the approval runs out.`,
      confirmText: 'Close again',
      tone: 'warning'
    });
    if (!ok) return;
    try {
      const response = await api.post('/period-close/close', { id: request.id });
      showPopup('success', response.data?.message || 'Closed again');
      await load();
    } catch (error) {
      showPopup('error', errorText(error, 'Could not close the period'));
    }
  };

  return (
    <div className="period-close-page">
      <PageHeader
        eyebrow="Admin"
        title="Period Close"
        subtitle={status
          ? `Only the last ${status.open_months} months are open (from ${dayjs(status.closed_before).format('DD MMM YYYY')}). `
            + 'Nothing dated in an older month can be added, edited or removed unless the Super Admin approves a re-open.'
          : 'Closed months, and the requests to re-open them.'}
      />

      {loadError && <p className="pc-error" role="alert">{loadError}</p>}

      {status && (
        <div className="pc-tiles">
          <div className="pc-tile">
            <span className="pc-tile-label">Open from</span>
            <span className="pc-tile-value">{dayjs(status.closed_before).format('DD MMM YYYY')}</span>
            <span className="pc-tile-note">Earlier dates are closed</span>
          </div>
          <div className={`pc-tile ${openNow.length ? 'is-open' : ''}`}>
            <span className="pc-tile-label">Re-opened now</span>
            <span className="pc-tile-value">{openNow.length}</span>
            <span className="pc-tile-note">{openNow.length ? 'Only an Admin can post in them' : 'Every older month is closed'}</span>
          </div>
          <div className={`pc-tile ${pendingCount ? 'is-pending' : ''}`}>
            <span className="pc-tile-label">Waiting for approval</span>
            <span className="pc-tile-value">{pendingCount}</span>
            <span className="pc-tile-note">{isSuperAdmin ? 'You approve or reject these' : 'The Super Admin decides'}</span>
          </div>
        </div>
      )}

      <section className="pc-card" aria-labelledby="pc-request-title">
        <h2 id="pc-request-title" className="pc-card-title"><FontAwesomeIcon icon={faLockOpen} /> Ask to re-open a closed month</h2>
        <form className="pc-form" onSubmit={submitRequest}>
          <label>
            <span>From month</span>
            <input type="month" value={form.from_month} max={latestClosed || undefined} onChange={setField('from_month')} required />
          </label>
          <label>
            <span>To month (optional)</span>
            <input type="month" value={form.to_month} min={form.from_month || undefined} max={latestClosed || undefined} onChange={setField('to_month')} />
          </label>
          <label className="pc-form-reason">
            <span>Reason</span>
            <textarea rows={2} maxLength={500} value={form.reason} onChange={setField('reason')}
              placeholder="What must be corrected, and why (e.g. a supplier invoice that arrived late)" required />
          </label>
          <div className="pc-form-actions">
            <button type="submit" className="btn btn-primary" disabled={sending}>
              <FontAwesomeIcon icon={faPaperPlane} /> {sending ? 'Sending...' : 'Send request'}
            </button>
          </div>
        </form>
        <p className="pc-hint">
          <FontAwesomeIcon icon={faCircleInfo} /> The Super Admin decides how long the month stays open. While it is open, only an Admin
          can post or edit in it; everyone else is still blocked.
        </p>
      </section>

      <section className="pc-card" aria-labelledby="pc-list-title">
        <h2 id="pc-list-title" className="pc-card-title"><FontAwesomeIcon icon={faLock} /> Re-open requests</h2>
        {loading ? (
          <p className="pc-muted">Loading...</p>
        ) : requests.length === 0 ? (
          <EmptyState title="No requests yet" description="Every month before the open window is closed." />
        ) : (
          <div className="pc-table-wrap">
            <table className="pc-table">
              <thead>
                <tr>
                  <th scope="col">Months</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Requested by</th>
                  <th scope="col">Status</th>
                  <th scope="col">Decision</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id}>
                    <td className="pc-nowrap">{monthsText(request.from_month, request.to_month)}</td>
                    <td className="pc-reason">{request.reason}</td>
                    <td>
                      <div className="pc-stack"><span>{request.requested_by_name || '-'}</span><small>{formatTime(request.requested_at)}</small></div>
                    </td>
                    <td>
                      <StatusBadge tone={TONE_BY_STATUS[request.status] || 'neutral'}>{request.status}</StatusBadge>
                      {request.is_active && <small className="pc-left">{timeLeft(request.expires_at)}</small>}
                    </td>
                    <td>
                      {request.status === 'Pending' ? (
                        <span className="pc-muted">Waiting for the Super Admin</span>
                      ) : (
                        <div className="pc-stack">
                          <span>{request.decided_by_name || request.closed_by_name || '-'}</span>
                          <small>{formatTime(request.decided_at)}</small>
                          {request.decision_note && <small>{request.decision_note}</small>}
                          {request.expires_at && request.status !== 'Rejected' && <small>Until {formatTime(request.expires_at)}</small>}
                          {request.status === 'Closed' && request.closed_at && <small>Closed {formatTime(request.closed_at)} by {request.closed_by_name || '-'}</small>}
                        </div>
                      )}
                    </td>
                    <td className="pc-actions">
                      {request.status === 'Pending' && isSuperAdmin && (
                        <>
                          <button type="button" className="btn btn-sm btn-primary" onClick={() => openDecision('approve', request)}
                            aria-label={`Approve request ${request.id}`}><FontAwesomeIcon icon={faCheck} /> Approve</button>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => openDecision('reject', request)}
                            aria-label={`Reject request ${request.id}`}><FontAwesomeIcon icon={faXmark} /> Reject</button>
                        </>
                      )}
                      {request.is_active && (
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => closeAgain(request)}
                          aria-label={`Close request ${request.id} again`}><FontAwesomeIcon icon={faLock} /> Close again</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {decision && (
        <Modal
          open
          size="sm"
          title={decision.type === 'approve' ? 'Approve the re-open' : 'Reject the request'}
          subtitle={`${monthsText(decision.request.from_month, decision.request.to_month)} - requested by ${decision.request.requested_by_name || '-'}`}
          onClose={deciding ? undefined : () => setDecision(null)}
          footer={(
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDecision(null)} disabled={deciding}>Cancel</button>
              <button type="button" className={`btn ${decision.type === 'approve' ? 'btn-primary' : 'btn-danger'}`}
                onClick={submitDecision} disabled={deciding}>
                {decision.type === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </>
          )}
        >
          <p className="pc-modal-reason">&ldquo;{decision.request.reason}&rdquo;</p>
          <div className="pc-form pc-form-stack">
            {decision.type === 'approve' && (
              <label>
                <span>Keep it open for (hours, 1-{MAX_HOURS})</span>
                <input type="number" min="1" max={MAX_HOURS} step="1" value={hours} onChange={(event) => setHours(event.target.value)} />
              </label>
            )}
            <label>
              <span>{decision.type === 'approve' ? 'Note (optional)' : 'Reason for rejecting'}</span>
              <textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default PeriodClose;
