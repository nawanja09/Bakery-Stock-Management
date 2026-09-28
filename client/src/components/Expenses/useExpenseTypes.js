// src/components/Expenses/useExpenseTypes.js
//
// Shared data + helpers for the Expenses Type / Sub Expenses Type dropdowns.
// Both lists come from Expenses Type Management (/expense-types and
// /sub-expense-types) - the same source New Expenses uses. Nothing is
// hard-coded here.
//
// Sub Expenses Type options always belong to exactly one Expenses Type, so
// they are loaded per selected type via loadSubExpenseTypes(expenseTypeId).
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api';

// Keeps a record's saved value visible when it is no longer an active option
// (renamed/deactivated in management, or a legacy name with no id). Without
// this the <select> would silently show "Select..." for an existing record.
export const withSavedOption = (options, savedId, savedName) => {
  if (!savedName && !savedId) return options;
  const id = savedId ? String(savedId) : '';
  if (id && options.some((o) => String(o.id) === id)) return options;
  if (!id && options.some((o) => o.name === savedName)) return options;
  return [...options, { id: id || `saved:${savedName}`, name: savedName || `#${savedId}`, saved: true }];
};

// Legacy rows may carry only the type name; find the managed type's id.
export const findExpenseTypeId = (expenseTypes, id, name) => {
  if (id) return String(id);
  const match = expenseTypes.find((t) => t.name === name);
  return match ? String(match.id) : '';
};

export default function useExpenseTypes() {
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [subExpenseTypes, setSubExpenseTypes] = useState([]);
  const [loadingSubTypes, setLoadingSubTypes] = useState(false);
  const latestRequest = useRef(0);

  useEffect(() => {
    let active = true;
    api.get('/expense-types')
      .then((res) => { if (active) setExpenseTypes(res.data || []); })
      .catch((error) => console.error('Error loading expense types:', error));
    return () => { active = false; };
  }, []);

  // Resolves with the loaded list so callers can also read it synchronously.
  // Out-of-order responses (fast type switching) are ignored.
  const loadSubExpenseTypes = useCallback(async (expenseTypeId) => {
    const requestId = ++latestRequest.current;
    if (!expenseTypeId || String(expenseTypeId).startsWith('saved:')) {
      setSubExpenseTypes([]);
      setLoadingSubTypes(false);
      return [];
    }
    setLoadingSubTypes(true);
    try {
      const res = await api.get('/sub-expense-types', {
        params: { expense_type_id: expenseTypeId, activeOnly: true }
      });
      const list = res.data || [];
      if (requestId === latestRequest.current) setSubExpenseTypes(list);
      return list;
    } catch (error) {
      console.error('Error loading sub expense types:', error);
      if (requestId === latestRequest.current) setSubExpenseTypes([]);
      return [];
    } finally {
      if (requestId === latestRequest.current) setLoadingSubTypes(false);
    }
  }, []);

  return { expenseTypes, subExpenseTypes, loadingSubTypes, loadSubExpenseTypes, setSubExpenseTypes };
}
