// src/utils/usePaymentMethods.js
// Shared custom hook — fetches the active payment methods list from the API.
// All payment modals use this so the dropdown always reflects the latest
// methods defined on the Payment Method Management page.
import { useState, useEffect } from 'react';
import api from '../api';

/**
 * Returns { paymentMethods, loadingMethods }
 *
 * paymentMethods is an array of objects: { id, name, is_active }
 * ordered alphabetically by name (the API already orders them).
 *
 * Only ACTIVE methods are returned (no ?include_inactive flag).
 */
const usePaymentMethods = () => {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loadingMethods, setLoadingMethods] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchMethods = async () => {
      try {
        const { data } = await api.get('/payment-methods');
        if (!cancelled) {
          setPaymentMethods(data || []);
        }
      } catch (err) {
        console.error('usePaymentMethods: failed to load payment methods', err);
        if (!cancelled) {
          // Fall back to the three built-in defaults so the form is never broken
          setPaymentMethods([
            { id: 'CASH',   name: 'Cash' },
            { id: 'CHEQUE', name: 'Cheque' },
            { id: 'BANK',   name: 'Bank' }
          ]);
        }
      } finally {
        if (!cancelled) setLoadingMethods(false);
      }
    };

    fetchMethods();

    return () => { cancelled = true; };
  }, []);

  return { paymentMethods, loadingMethods };
};

export default usePaymentMethods;
