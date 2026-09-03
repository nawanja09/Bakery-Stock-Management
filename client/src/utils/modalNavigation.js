export const openModalRoute = (navigate, location, path) => {
  navigate(path, { state: { backgroundLocation: location } });
};
