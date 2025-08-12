import React from 'react'
import './Register.css';
import { useNavigate } from 'react-router-dom';
import { usePopup } from './context/PopupContext';
import { useState } from 'react';
import { Link } from 'react-router-dom'
import bakeryLogo from '../images/icon.jpeg';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
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
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
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
        <h2>Register</h2>
        <form onSubmit={handleSubmit}>
            <div className="logo-header">
                <img src={bakeryLogo} alt="Bakery Logo" className="logo-image" />
            </div>
            <div className="form-group">
                <label htmlFor="name">Name</label>
                <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} required />
            </div>
            <div className="form-group">
                <label htmlFor="email">Email</label>
                <input type="email" id="email" name="email" value={formData.email} onChange={handleChange} required />
            </div>
            <div className="form-group">
                <label htmlFor="password">Password</label>
                <input type="password" id="password" name="password" value={formData.password} onChange={handleChange} required />
            </div>
            <button type="submit">Register</button>

            <p className="login-link">
                      <h4>Already have an account? <Link to="/login">Login</Link></h4>
            </p>
        </form>
    </div>
  )
}

export default Register
