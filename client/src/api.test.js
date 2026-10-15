import api from './api';

// The response interceptor is exercised directly so no request leaves the test.
const onResponseError = api.interceptors.response.handlers[0].rejected;

const unauthorized = (url) => ({
  config: { url, method: 'post' },
  response: { status: 401, data: { error: 'Invalid credentials' } },
});

const originalLocation = window.location;

beforeEach(() => {
  localStorage.clear();
  delete window.location;
  window.location = { pathname: '/purchase/history', search: '?page=2', href: 'http://localhost/purchase/history?page=2' };
});

afterAll(() => {
  window.location = originalLocation;
});

test('a 401 from POST /login is passed to the caller without reloading the page', async () => {
  window.location.pathname = '/login';
  window.location.href = 'http://localhost/login';
  const error = unauthorized('/login');

  await expect(onResponseError(error)).rejects.toBe(error);
  expect(window.location.href).toBe('http://localhost/login');
});

test('a 401 from any other request still signs out and returns to the current page after login', async () => {
  localStorage.setItem('token', 'expired');
  localStorage.setItem('user', '{"id":7}');
  const error = unauthorized('/purchases');

  await expect(onResponseError(error)).rejects.toBe(error);
  expect(localStorage.getItem('token')).toBeNull();
  expect(localStorage.getItem('user')).toBeNull();
  expect(window.location.href).toBe('/login?redirect=%2Fpurchase%2Fhistory%3Fpage%3D2');
});
