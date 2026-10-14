// server/utils/dateOnly.js
//
// 'YYYY-MM-DD' of a DATE value, whatever form it arrives in.
//
// mysql2 returns DATE columns as JS Date objects at LOCAL midnight. Neither
// common shortcut works on those:
//   String(date).slice(0, 10)       -> "Wed Sep 16"  (MariaDB then stores 0000-00-00)
//   date.toISOString().slice(0, 10) -> the PREVIOUS day east of UTC (Asia/Colombo)
// so a Date uses its local calendar fields; a string must already start with
// YYYY-MM-DD (a DATETIME string keeps only its date part).

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD', or null when the value is empty or not a real calendar date. */
const toYmd = (value) => {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const check = new Date(Number(y), Number(m) - 1, Number(d));
  // Rejects 0000-00-00, 2026-02-30, month 13 ...
  return check.getFullYear() === Number(y) && check.getMonth() === Number(m) - 1 && check.getDate() === Number(d)
    ? `${y}-${m}-${d}` : null;
};

/** Today's date on this server's calendar. */
const todayYmd = () => toYmd(new Date());

module.exports = { toYmd, todayYmd };
