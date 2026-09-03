import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PayNowModal from './PayNowModal';
import api from '../../api';
import './PaymentPage.css';

const AdvancePaymentPage = () => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    let mounted = true;
    Promise.all([api.get('/purchases/suppliers'), api.get('/purchases/companies')])
      .then(([suppliersResponse, companiesResponse]) => {
        if (!mounted) return;
        setSuppliers(suppliersResponse.data || []);
        setCompanies(companiesResponse.data || []);
      })
      .catch(() => {
        if (mounted) {
          setSuppliers([]);
          setCompanies([]);
        }
      });
    return () => { mounted = false; };
  }, []);

  return (
    <div className="page-container payment-page">
      <header className="page-header payment-page-header">
        <div>
          <h2>Advance Payment</h2>
          <p>Record a supplier payment to use against future invoices.</p>
        </div>
      </header>
      <PayNowModal
        isOpen
        embedded
        onClose={() => navigate('/purchase/history')}
        suppliers={suppliers}
        companies={companies}
        onSuccess={() => navigate('/purchase/history')}
      />
    </div>
  );
};

export default AdvancePaymentPage;
