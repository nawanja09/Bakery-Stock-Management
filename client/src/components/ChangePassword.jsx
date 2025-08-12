//src/components/ChangePassword.jsx

import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave } from '@fortawesome/free-solid-svg-icons';
import './ChangePassword.css';
import { usePopup } from '../components/context/PopupContext';
import api from '../api';

const ChangePassword = () => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const { showPopup } = usePopup();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        if (!currentPassword || !newPassword || !confirmPassword) {
            setMessage('All fields are required');
            setLoading(false);
            return;
        }
        if (newPassword !== confirmPassword) {
            setMessage('New passwords do not match');
            setLoading(false);
            return;
        }

        try {
            const response = await api.post('/change-password', { 
                currentPassword,
                newPassword,
            });
            if (response.status !== 200) {
                throw new Error('Failed to change password');
            }
            const data = await response.data;
            showPopup('success', data.message || 'Password changed successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            showPopup('error', error.message || 'An error occurred while changing password');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="change-password-container">
            <div className="change-password-card">
                <h2 className="change-password-title">
                    <i className="bi bi-shield-lock"></i> Change Password
                </h2>
                
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Current Password</label>
                        <input
                            type="password"
                            className="form-control"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>New Password</label>
                        <input
                            type="password"
                            className="form-control"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            minLength="6"
                        />
                    </div>
                    
                    <div className="form-group">
                        <label>Confirm New Password</label>
                        <input
                            type="password"
                            className="form-control"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-button-wrapper">
                        <button type="submit" className="btn-save" disabled={loading}>
                            <FontAwesomeIcon icon={faSave} /> 
                            {loading ? 'Updating...' : 'Change Password'}
                        </button>
                    </div>
                </form>
            </div>

            {message && <p className="message">{message}</p>}
        </div>
    );
};

export default ChangePassword;