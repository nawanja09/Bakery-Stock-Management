import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import bakeryLogo from '../images/icon.jpeg';
import { usePopup } from './context/PopupContext';
import { Link } from 'react-router-dom';
import './Login.css';
import api from '../api';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { showPopup } = usePopup();

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
        showPopup('success', 'Login successful!');
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
      } else {
        showPopup('error', data.error || 'Login failed');
      }
    } catch (error) {
      showPopup('error', 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-header">
        <img src={bakeryLogo} alt="Bakery Logo" className="logo-image" />
        <h2>Welcome back!</h2>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email :</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
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
  );
};

export default Login;