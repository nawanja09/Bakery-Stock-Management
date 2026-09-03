import React from 'react';
import PendingInvoicesSection from './PendingInvoicesSection';
import './PaymentPage.css';

const RecordPaymentPage = () => (
  <div className="page-container payment-page">
    <header className="page-header payment-page-header">
      <div>
        <h2>Record Payment</h2>
        <p>Select outstanding supplier invoices and record their payment.</p>
      </div>
    </header>
    <PendingInvoicesSection />
  </div>
);

export default RecordPaymentPage;
