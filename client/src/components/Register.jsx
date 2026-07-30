import React from 'react'
import './Register.css';
import { useNavigate } from 'react-router-dom';
import { usePopup } from './context/PopupContext';
import { useState } from 'react';
import { Link } from 'react-router-dom'
import bakeryLogo from '../images/icon.jpeg';
import api from '../api';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
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
      const response = await api.post('/register', formData);

      const data = await response.data;

      if (response.status === 200) {
        showPopup('success', 'Registration successful!');
        setTimeout(() => {
          navigate('/login');
        }, 1500);
      } else {
        showPopup('error', data.error || 'Registration failed');
      }
    } catch (error) {
      showPopup('error', 'Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="register-container">
        <form onSubmit={handleSubmit}>
            <div className="logo-header">
                <img src={bakeryLogo} alt="Bakery Logo" className="logo-image" />
            </div>
            <h2>Sign Up Here ...</h2>
            <div className="form-group">
                <label htmlFor="name">Name :                          </label>
                <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} required />
            </div>
            <div className="form-group">
                <label htmlFor="username">Username :</label>
                <input type="text" id="username" name="username" value={formData.username} onChange={handleChange} autoComplete="username" required />
            </div>
            <div className="form-group">
                <label htmlFor="password">Password :</label>
                <input type="password" id="password" name="password" value={formData.password} onChange={handleChange} required />
            </div>
            <button type="submit" disabled={isLoading}>
              {isLoading ? 'Registering...' : 'Register'}
            </button>
            
            <div className="login-link">
              <h4>Already have an account? <Link to="/login">Login</Link></h4>
            </div>
        </form>
    </div>
  )
}

export default Register
