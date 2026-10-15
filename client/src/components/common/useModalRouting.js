import { createContext, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// Key of the page behind a route popup (read by Layout for its <Outlet>).
export const PageKeyContext = createContext(0);

/**
 * React Router "modal route" pattern: a link that carries
 * `state.backgroundLocation` opens its route as a popup over that page, and the
 * page stays mounted underneath (filters, scroll and loaded data survive).
 * Opened directly (address bar, sidebar, reload without state) the same URL is
 * a full page.
 *
 * Returns
 *  location           - the real location (what the popup routes match)
 *  backgroundLocation - the page the popup was opened over, or null
 *  pageLocation       - what the page <Routes> render
 *  pageKey            - changes when a popup is left by navigating forward,
 *                       e.g. navigate('/items') after Save, so the page behind
 *                       reloads its data as it did when it was unmounted.
 *                       Closing (×, Escape, Back) goes back in history and
 *                       keeps the page as it is.
 */
const useModalRouting = () => {
  const location = useLocation();
  const navigationType = useNavigationType();
  const backgroundLocation = location.state?.backgroundLocation || null;

  const tracker = useRef({ key: location.key, wasPopup: Boolean(backgroundLocation), pageKey: 0 });
  const seen = tracker.current;
  if (seen.key !== location.key) {
    if (seen.wasPopup && !backgroundLocation && navigationType !== 'POP') seen.pageKey += 1;
    seen.key = location.key;
    seen.wasPopup = Boolean(backgroundLocation);
  }

  return {
    location,
    backgroundLocation,
    pageLocation: backgroundLocation || location,
    pageKey: seen.pageKey,
  };
};

export default useModalRouting;
