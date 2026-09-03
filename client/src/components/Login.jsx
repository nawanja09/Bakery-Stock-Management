import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import bakeryLogo from '../images/icon.jpeg';
import { usePopup } from './context/PopupContext';
import { Link } from 'react-router-dom';
import './Login.css';
import api from '../api';

const Login = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { showPopup } = usePopup();

  // Redirect to the page the user tried to access before being sent to login.
  // Priority: React Router state (navigation guard) → ?redirect query param (token expiry) → /dashboard.
  const searchParams = new URLSearchParams(location.search);
  const from =
    location.state?.from?.pathname ||
    searchParams.get('redirect') ||
    '/dashboard';

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const response = await api.post('/login', formData);
      const data = await response.data;

      if (response.status === 200) {
        // Store token without quotes
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        showPopup('success', 'You have successfully logged into your account.', {
          title: 'Login Successful',
          confirmText: 'OK'
        });
        setTimeout(() => {
          navigate(from, { replace: true });
        }, 1500);
      } else {
        showPopup('error', data.error || 'Login failed');
      }
    } catch (error) {
      const message =
        error.response?.data?.error ||
        'Network error. Please try again.';
      showPopup('error', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-wrapper">
      <div className="login-container">
        <div className="login-header">
          <img src={bakeryLogo} alt="Bakery Logo" className="logo-image" />
          <h2>Welcome back!</h2>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username :</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              autoComplete="username"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password :</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>
          
          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
          <div className="register-link">
            <h4>Don't have an account? <Link to="/register">Register</Link></h4>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;
