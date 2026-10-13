// client/src/hooks/useIntegrationAccess.js
//
// What the signed-in user's OWN RAVON POS / Restaurant accounts allow, as
// validated by the server (GET /api/integrations/access):
//   { collection: { allowed, sources: { POS: [...], RESTAURANT: [...] } },
//     fgItems: { allowed }, systems: { pos, restaurant } }
// Used only to hide what the user cannot use - the server enforces every rule
// on its own. `access` is null until known (show nothing as denied meanwhile).
// The answer is cached briefly per login (token) so several components share it.

import { useCallback, useEffect, useState } from 'react';
import api from '../api';

const CACHE_MS = 60 * 1000;
let cache = { token: null, at: 0, value: null, promise: null };

const currentToken = () => {
  try { return localStorage.getItem('token'); } catch (error) { return null; }
};

const fetchAccess = (force = false) => {
  const token = currentToken();
  if (!token) return Promise.resolve(null);
  const fresh = cache.token === token && Date.now() - cache.at < CACHE_MS;
  if (!force && fresh && cache.value) return Promise.resolve(cache.value);
  if (!force && cache.token === token && cache.promise) return cache.promise;
  const promise = api.get('/integrations/access')
    .then((res) => {
      cache = { token, at: Date.now(), value: res.data || null, promise: null };
      return cache.value;
    })
    .catch((error) => {
      cache = { ...cache, promise: null };
      throw error;
    });
  cache = { ...cache, token, promise };
  return promise;
};

const useIntegrationAccess = ({ enabled = true } = {}) => {
  const [access, setAccess] = useState(() => (cache.token === currentToken() ? cache.value : null));
  const [error, setError] = useState(null);

  const refresh = useCallback(async (force = true) => {
    try {
      setError(null);
      const value = await fetchAccess(force);
      setAccess(value);
      return value;
    } catch (err) {
      setError(err);
      return null;
    }
  }, []);

  useEffect(() => {
    if (enabled) refresh(false);
  }, [enabled, refresh]);

  return { access, error, refresh };
};

export default useIntegrationAccess;
