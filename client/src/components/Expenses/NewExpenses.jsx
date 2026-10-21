// src/components/Expenses/NewExpenses.jsx
//
// Replaces the old Online Expenses / Cheque Expenses screens with a
// single New Expenses workflow: enter a bill -> pick bills for the
// same payee -> Pay -> choose Payment Type (Cash / Cheque / Bank) ->
// submit. The payment amount is free: less than the outstanding total is a
// Partial Payment (the unpaid remainder stays in Pending), equal is a Full
// Payment, and more is an Overpayment - the excess is recorded as a credit for
// that payee, which can be settled against a later payment for the same payee.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSave,
  faTimes,
  faPlus,
  faEdit,
  faTrash,
  faSearch,
  faFileExcel,
  faSpinner,
  faReceipt,
  faMoneyBillWave,
  faCheckCircle,
  faCreditCard,
  faBuildingColumns,
  faChevronDown,
  faChevronUp,
  faExclamationTriangle,
  faFileInvoiceDollar,
  faFileInvoice,
  faRightLeft,
  faEllipsisV,
  faHistory
} from '@fortawesome/free-solid-svg-icons';
import './OnlineExpenses.css';
import { usePopup } from '../context/PopupContext';
import api from '../../api';

import { useConfirm } from '../common/ui';
const emptyBillForm = {
  bill_date: new Date().toISOString().split('T')[0],
  bill_number: '',
  company_id: '',
  payee_id: '',
  payee_name: '',
  vat_reg_number: '',
  expense_type_id: '',
  expense_type: '',
  sub_expense_type_id: '',
  sub_expense_type: '',
  without_vat_amount: '',
  vat_amount: '',
  total_bill_amount: '',
  description: ''
};

const emptyPaymentForm = {
  payment_date: new Date().toISOString().split('T')[0],
  payee_id: '',
  payee_name: '',
  payment_type_id: '',
  payment_type: '',
  bank_id: '',
  bank_name: '',
  cheque_number: '',
  voucher_number: '',
  reference_number: '',
  description: '',
  transfer_amount: '0.00',
  // Amount of the payee's existing overpayment credit to settle in this payment
  use_overpayment: ''
};

const NewExpenses = () => {
  const confirm = useConfirm();
  const { showPopup } = usePopup();

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [bills, setBills] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  // 'pending' shows bills still awaiting payment (original behaviour),
  // 'paid' shows bills that have already been settled in full.
  const [viewFilter, setViewFilter] = useState('pending');

  // Lookups
  const [payees, setPayees] = useState([]);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [subExpenseTypes, setSubExpenseTypes] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [banks, setBanks] = useState([]);
  const [companies, setCompanies] = useState([]);

  // Payee dropdown (bill form)
  const [payeeSearch, setPayeeSearch] = useState('');
  const [filteredPayees, setFilteredPayees] = useState([]);
  const [isPayeeDropdownOpen, setIsPayeeDropdownOpen] = useState(false);
  const [highlightedPayeeIndex, setHighlightedPayeeIndex] = useState(0);
  const payeeInputRef = useRef(null);

  // Quick-add mini modals
  const [showAddPayee, setShowAddPayee] = useState(false);
  const [newPayeeName, setNewPayeeName] = useState('');
  const [showAddType, setShowAddType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  // Bank dropdown (payment modal)
  const [bankSearchTerm, setBankSearchTerm] = useState('');
  const [filteredBanks, setFilteredBanks] = useState([]);
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);

  // Payment modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedForPayment, setSelectedForPayment] = useState([]);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  // Overpayment credit the selected payee can still draw on (this payment form)
  const [payeeOverpayment, setPayeeOverpayment] = useState({ total_available: 0, isLoading: false });
  // All payee overpayments (panel under the bills table)
  const [overpayments, setOverpayments] = useState([]);
  const [showUsedOverpayments, setShowUsedOverpayments] = useState(false);
  // Payment history modal
  const [historyBill, setHistoryBill] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const [formData, setFormData] = useState(emptyBillForm);

  // Credit Note - create/view modal
  const [showCreditNoteModal, setShowCreditNoteModal] = useState(false);
  const [creditNoteSourceBill, setCreditNoteSourceBill] = useState(null);
  const [creditNoteForm, setCreditNoteForm] = useState(null);
  const [creditNoteModalMode, setCreditNoteModalMode] = useState('create'); // 'create' | 'view'
  const [creditNoteExisting, setCreditNoteExisting] = useState(null);
  const [isCheckingExistingCreditNote, setIsCheckingExistingCreditNote] = useState(false);

  // All non-cancelled Credit Notes, keyed by their source Expense Detail id,
  // so we know instantly whether the selected row already has one.
  const [creditNotesByExpenseId, setCreditNotesByExpenseId] = useState({});

  // Credit Note - apply (set-off) modal
  const [showApplyCreditNoteModal, setShowApplyCreditNoteModal] = useState(false);
  const [applyCreditNoteBill, setApplyCreditNoteBill] = useState(null);
  const [availableCreditNotes, setAvailableCreditNotes] = useState([]);
  const [creditNoteApplyAmounts, setCreditNoteApplyAmounts] = useState({});
  const [isLoadingCreditNotes, setIsLoadingCreditNotes] = useState(false);

  // Expenses Details table - row three-dot action menu
  const [openActionMenuId, setOpenActionMenuId] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const actionMenuDropdownRef = useRef(null);
  const actionMenuTriggerRef = useRef(null);

  useEffect(() => {
    if (!openActionMenuId) return;

    const handleOutsideClick = (event) => {
      if (actionMenuDropdownRef.current && actionMenuDropdownRef.current.contains(event.target)) {
        return;
      }
      if (actionMenuTriggerRef.current && actionMenuTriggerRef.current.contains(event.target)) {
        return;
      }
      setOpenActionMenuId(null);
      setMenuPosition(null);
    };

    const handleScrollOrResize = (event) => {
      if (actionMenuDropdownRef.current && actionMenuDropdownRef.current.contains(event.target)) {
        return;
      }
      setOpenActionMenuId(null);
      setMenuPosition(null);
    };

    document.addEventListener('mousedown', handleOutsideClick, true);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [openActionMenuId]);

  const handleToggleActionMenu = (bill, e) => {
    e.stopPropagation();
    if (openActionMenuId === bill.id) {
      setOpenActionMenuId(null);
      setMenuPosition(null);
      actionMenuTriggerRef.current = null;
    } else {
      const btn = e.currentTarget;
      actionMenuTriggerRef.current = btn;
      const rect = btn.getBoundingClientRect();
      const dropdownHeight = 190;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;

      setMenuPosition({
        top: openUpward ? Math.max(10, rect.top - dropdownHeight - 6) : rect.bottom + 6,
        right: Math.max(12, window.innerWidth - rect.right),
        bill,
        openUpward
      });
      setOpenActionMenuId(bill.id);
    }
  };


  const fetchCreditNotesIndex = useCallback(async () => {
    try {
      const response = await api.get('/new-expenses/credit-notes');
      const map = {};
      (response.data || []).forEach(cn => {
        if (cn.expense_id && cn.status !== 'Cancelled') map[cn.expense_id] = cn;
      });
      setCreditNotesByExpenseId(map);
    } catch (error) {
      console.error('Error fetching credit notes index:', error);
    }
  }, []);

  const fetchBills = useCallback(async () => {
    setIsFetching(true);
    try {
      const response = await api.get('/new-expenses');
      setBills(response.data || []);
    } catch (error) {
      console.error('Error fetching expense bills:', error);
      showPopup('error', 'Failed to load expense bills');
      setBills([]);
    } finally {
      setIsFetching(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchCreditNotesIndex();
  }, [fetchCreditNotesIndex]);

  const fetchOverpayments = useCallback(async () => {
    try {
      const response = await api.get('/new-expenses/overpayments');
      setOverpayments(response.data || []);
    } catch (error) {
      console.error('Error fetching overpayments:', error);
      setOverpayments([]);
    }
  }, []);

  useEffect(() => {
    fetchOverpayments();
  }, [fetchOverpayments]);

  const fetchPayees = useCallback(async () => {
    try {
      const response = await api.get('/payees');
      setPayees(response.data || []);
    } catch (error) {
      console.error('Error fetching payees:', error);
    }
  }, []);

  const fetchExpenseTypes = useCallback(async () => {
    try {
      const response = await api.get('/expense-types');
      setExpenseTypes(response.data || []);
    } catch (error) {
      console.error('Error fetching expense types:', error);
    }
  }, []);

  const fetchSubExpenseTypes = useCallback(async (expenseTypeId) => {
    if (!expenseTypeId) {
      setSubExpenseTypes([]);
      return;
    }
    try {
      const response = await api.get('/sub-expense-types', {
        params: { expense_type_id: expenseTypeId, activeOnly: true }
      });
      setSubExpenseTypes(response.data || []);
    } catch (error) {
      console.error('Error fetching sub expense types:', error);
      setSubExpenseTypes([]);
    }
  }, []);

  const fetchPaymentTypes = useCallback(async () => {
    try {
      const response = await api.get('/payment-methods');
      setPaymentTypes(response.data || []);
    } catch (error) {
      console.error('Error fetching payment types:', error);
    }
  }, []);

  const fetchBanks = useCallback(async () => {
    try {
      const response = await api.get('/expenses/banks');
      setBanks(response.data || []);
    } catch (error) {
      console.error('Error fetching banks:', error);
    }
  }, []);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await api.get('/companies');
      setCompanies(response.data || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      showPopup('error', 'Failed to load companies');
    }
  }, [showPopup]);

  useEffect(() => {
    fetchBills();
    fetchPayees();
    fetchExpenseTypes();
    fetchPaymentTypes();
    fetchBanks();
    fetchCompanies();
  }, [fetchBills, fetchPayees, fetchExpenseTypes, fetchPaymentTypes, fetchBanks, fetchCompanies]);

  useEffect(() => {
    const query = payeeSearch.trim().toLowerCase();
    setFilteredPayees(query === '' ? payees : payees.filter(p => p.payee_name.toLowerCase().includes(query)));
    setHighlightedPayeeIndex(0);
  }, [payeeSearch, payees]);

  useEffect(() => {
    if (bankSearchTerm.trim() === '') {
      setFilteredBanks(banks);
    } else {
      setFilteredBanks(banks.filter(b => b.bank_name.toLowerCase().includes(bankSearchTerm.toLowerCase())));
    }
  }, [bankSearchTerm, banks]);

  useEffect(() => {
    const withoutVat = parseFloat(formData.without_vat_amount) || 0;
    const vat = parseFloat(formData.vat_amount) || 0;
    setFormData(prev => ({ ...prev, total_bill_amount: (withoutVat + vat).toFixed(2) }));
  }, [formData.without_vat_amount, formData.vat_amount]);

  // ---------- Bill form handlers ----------
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePayeeInputChange = (e) => {
    const value = e.target.value;
    setPayeeSearch(value);
    setFormData(prev => ({ ...prev, payee_name: value, payee_id: '' }));
    setIsPayeeDropdownOpen(true);
  };

  const handlePayeeSelect = (payee) => {
    setPayeeSearch(payee.payee_name);
    setFormData(prev => ({
      ...prev,
      payee_id: payee.id,
      payee_name: payee.payee_name,
      vat_reg_number: payee.vat_reg_number || ''
    }));
    setIsPayeeDropdownOpen(false);
  };

  const handlePayeeKeyDown = (e) => {
    if (!isPayeeDropdownOpen || filteredPayees.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedPayeeIndex(prev => (prev + 1) % filteredPayees.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedPayeeIndex(prev => (prev - 1 + filteredPayees.length) % filteredPayees.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredPayees[highlightedPayeeIndex];
      if (selected) handlePayeeSelect(selected);
    } else if (e.key === 'Escape') {
      setIsPayeeDropdownOpen(false);
    }
  };

  const handleQuickAddPayee = async () => {
    if (!newPayeeName.trim()) return;
    try {
      const response = await api.post('/payees', { payee_name: newPayeeName.trim() });
      const created = response.data;
      setPayees(prev => [...prev, created].sort((a, b) => a.payee_name.localeCompare(b.payee_name)));
      handlePayeeSelect(created);
      setShowAddPayee(false);
      setNewPayeeName('');
      showPopup('success', 'Payee added');
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to add payee');
    }
  };

  const handleQuickAddType = async () => {
    if (!newTypeName.trim()) return;
    try {
      const response = await api.post('/expense-types', { name: newTypeName.trim() });
      const created = response.data;
      setExpenseTypes(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setFormData(prev => ({
        ...prev,
        expense_type_id: created.id,
        expense_type: created.name,
        sub_expense_type_id: '',
        sub_expense_type: ''
      }));
      setSubExpenseTypes([]);
      setShowAddType(false);
      setNewTypeName('');
      showPopup('success', 'Expense type added');
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to add expense type');
    }
  };

  const handleExpenseTypeChange = (e) => {
    const id = e.target.value;
    const type = expenseTypes.find(t => String(t.id) === String(id));
    setFormData(prev => ({
      ...prev,
      expense_type_id: id,
      expense_type: type ? type.name : '',
      sub_expense_type_id: '',
      sub_expense_type: ''
    }));
    fetchSubExpenseTypes(id);
  };

  const handleSubExpenseTypeChange = (e) => {
    const id = e.target.value;
    const type = subExpenseTypes.find(item => String(item.id) === String(id));
    setFormData(prev => ({
      ...prev,
      sub_expense_type_id: id,
      sub_expense_type: type ? type.name : ''
    }));
  };

  const resetForm = () => {
    setFormData(emptyBillForm);
    setPayeeSearch('');
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.bill_date || !formData.company_id || !formData.payee_name || !formData.expense_type || !formData.sub_expense_type_id) {
      showPopup('error', 'Please fill all required fields');
      return;
    }
    if (!formData.without_vat_amount || parseFloat(formData.without_vat_amount) <= 0) {
      showPopup('error', 'Valid amount is required');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        bill_date: formData.bill_date,
        bill_number: formData.bill_number || null,
        company_id: formData.company_id,
        payee_id: formData.payee_id || null,
        payee_name: formData.payee_name,
        vat_reg_number: formData.vat_reg_number || null,
        expense_type_id: formData.expense_type_id || null,
        expense_type: formData.expense_type,
        sub_expense_type_id: formData.sub_expense_type_id || null,
        sub_expense_type: formData.sub_expense_type,
        without_vat_amount: parseFloat(formData.without_vat_amount),
        vat_amount: parseFloat(formData.vat_amount) || 0,
        total_bill_amount: parseFloat(formData.total_bill_amount),
        description: formData.description || null
      };

      if (editingId) {
        await api.put(`/new-expenses/${editingId}`, payload);
        showPopup('success', 'Expense bill updated successfully!');
      } else {
        await api.post('/new-expenses', payload);
        showPopup('success', 'Expense bill recorded successfully!');
      }

      resetForm();
      await fetchBills();
    } catch (error) {
      console.error('Error saving expense bill:', error);
      showPopup('error', error.response?.data?.error || 'Failed to save expense bill');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (bill) => {
    setEditingId(bill.id);
    setFormData({
      bill_date: bill.bill_date,
      bill_number: bill.bill_number || '',
      company_id: bill.company_id || '',
      payee_id: bill.payee_id || '',
      payee_name: bill.payee_name,
      vat_reg_number: bill.vat_reg_number || '',
      expense_type_id: bill.expense_type_id || '',
      expense_type: bill.expense_type,
      sub_expense_type_id: bill.sub_expense_type_id || '',
      sub_expense_type: bill.sub_expense_type || '',
      without_vat_amount: String(bill.without_vat_amount),
      vat_amount: String(bill.vat_amount),
      total_bill_amount: String(bill.total_bill_amount),
      description: bill.description || ''
    });
    fetchSubExpenseTypes(bill.expense_type_id);
    setPayeeSearch(bill.payee_name);
    document.querySelector('.form-card')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!await confirm('Are you sure you want to delete this expense bill?')) return;
    setIsLoading(true);
    try {
      await api.delete(`/new-expenses/${id}`);
      showPopup('success', 'Expense bill deleted successfully!');
      await fetchBills();
    } catch (error) {
      showPopup('error', error.response?.data?.error || 'Failed to delete expense bill');
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Selection ----------
  const filteredBills = bills.filter(bill => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      bill.bill_number?.toLowerCase().includes(q) ||
      bill.payee_name?.toLowerCase().includes(q) ||
      bill.expense_type?.toLowerCase().includes(q) ||
      bill.vat_reg_number?.toLowerCase().includes(q);
    if (!matchesSearch) return false;
    const isPaid = parseFloat(bill.balance || 0) <= 0;
    return viewFilter === 'paid' ? isPaid : !isPaid;
  });

  const pendingCount = bills.filter(b => parseFloat(b.balance || 0) > 0).length;
  const paidCount = bills.filter(b => parseFloat(b.balance || 0) <= 0).length;

  const allSelected = filteredBills.length > 0 && filteredBills.every(b => selectedIds.includes(b.id));

  const handleSelectAll = (e) => {
    setSelectedIds(e.target.checked ? filteredBills.map(b => b.id) : []);
  };

  const handleSelectOne = (id) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]));
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return 'LKR 0.00';
    return new Intl.NumberFormat('en-LK', {
      style: 'currency', currency: 'LKR', minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(amount);
  };

  const selectedBills = bills.filter(b => selectedIds.includes(b.id));
  const selectedPayeeNames = [...new Set(selectedBills.map(b => b.payee_name).filter(Boolean))];
  const canPay = selectedBills.length > 0 && selectedPayeeNames.length === 1;
  const totalSelectedBalance = selectedBills.reduce((sum, b) => sum + parseFloat(b.balance || 0), 0);

  // ---------- Payment modal ----------
  const handleOpenPaymentModal = () => {
    if (!canPay) {
      if (selectedPayeeNames.length > 1) {
        showPopup('error', `Selected bills have different payees (${selectedPayeeNames.join(', ')}). Please select bills for one payee.`);
      } else {
        showPopup('error', 'Select at least one bill to pay');
      }
      return;
    }

    setSelectedForPayment(selectedBills);
    setPaymentForm({
      ...emptyPaymentForm,
      payee_id: selectedBills[0].payee_id || '',
      payee_name: selectedPayeeNames[0],
      transfer_amount: totalSelectedBalance.toFixed(2)
    });
    setBankSearchTerm('');
    setShowPaymentModal(true);

    // Offer any overpayment credit this payee already has.
    setPayeeOverpayment({ total_available: 0, isLoading: true });
    api.get('/new-expenses/overpayments/available', {
      params: { payee_id: selectedBills[0].payee_id || undefined, payee_name: selectedPayeeNames[0] }
    })
      .then((res) => setPayeeOverpayment({ total_available: parseFloat(res.data?.total_available) || 0, isLoading: false }))
      .catch(() => setPayeeOverpayment({ total_available: 0, isLoading: false }));
  };

  const handleClosePaymentModal = () => {
    setShowPaymentModal(false);
    setSelectedForPayment([]);
    setPayeeOverpayment({ total_available: 0, isLoading: false });
    setBankSearchTerm('');
    setIsBankDropdownOpen(false);
  };

  const handlePaymentFormChange = (e) => {
    const { name, value } = e.target;
    setPaymentForm(prev => ({ ...prev, [name]: value }));
  };

  const handlePaymentTypeChange = (e) => {
    const id = e.target.value;
    const type = paymentTypes.find(t => String(t.id) === String(id));
    setPaymentForm(prev => ({
      ...prev,
      payment_type_id: id,
      payment_type: type ? type.name : '',
      // Clear reference fields when the type changes so a stale value
      // from a previous selection can't slip through validation.
      cheque_number: '',
      voucher_number: '',
      bank_id: '',
      bank_name: ''
    }));
    setBankSearchTerm('');
  };

  const handleBankSelect = (bank) => {
    setPaymentForm(prev => ({ ...prev, bank_name: bank.bank_name, bank_id: bank.id }));
    setBankSearchTerm(bank.bank_name);
    setIsBankDropdownOpen(false);
  };

  const paymentTypeLower = paymentForm.payment_type.toLowerCase();
  const isCheque = paymentTypeLower === 'cheque';
  const isBankLike = paymentTypeLower === 'bank' || paymentTypeLower === 'online';
  const needsBank = isCheque || isBankLike;

  // Everything is worked out in whole cents so partial payments and
  // overpayments never show a stray fraction of a cent.
  const toCents = (v) => Math.round((parseFloat(v) || 0) * 100);
  const fromCents = (c) => c / 100;

  // Outstanding = what the selected bills still owe.
  const outstandingCents = selectedForPayment.reduce((sum, b) => sum + toCents(b.balance), 0);
  const totalBillAmountForPayment = fromCents(outstandingCents);
  const transferCents = Math.max(0, toCents(paymentForm.transfer_amount));
  const transferAmountValue = fromCents(transferCents);

  // Existing overpayment credit being settled in this payment (never more than
  // the credit available or the amount that is actually owed).
  const availableOverpaymentCents = toCents(payeeOverpayment.total_available);
  const maxUsableOverpaymentCents = Math.min(availableOverpaymentCents, outstandingCents);
  const useOverpaymentCents = Math.max(0, toCents(paymentForm.use_overpayment));
  const overpaymentUsedInvalid = useOverpaymentCents > maxUsableOverpaymentCents;

  // Payment = money leaving an account + overpayment credit used.
  //   Remaining   = Outstanding - Payment      (> 0 stays in Pending Payment)
  //   Overpayment = Payment - Outstanding      (> 0 becomes payee credit)
  const paymentCents = transferCents + useOverpaymentCents;
  const remainingCents = Math.max(0, outstandingCents - paymentCents);
  const overpaymentCents = Math.max(0, paymentCents - outstandingCents);
  const overpayment = fromCents(overpaymentCents);
  const remainingAmount = fromCents(remainingCents);
  const paymentKind = paymentCents <= 0 ? null : overpaymentCents > 0 ? 'overpayment' : remainingCents > 0 ? 'partial' : 'full';

  // Preview how the payment lands on each bill (oldest bill first - the same
  // order the server uses).
  const billAllocationPreview = (() => {
    let left = Math.min(paymentCents, outstandingCents);
    const map = {};
    [...selectedForPayment]
      .sort((a, b) => (a.bill_date < b.bill_date ? -1 : a.bill_date > b.bill_date ? 1 : a.id - b.id))
      .forEach((b) => {
        const bal = toCents(b.balance);
        const alloc = Math.min(bal, left);
        left -= alloc;
        map[b.id] = { paying: fromCents(alloc), remaining: fromCents(bal - alloc) };
      });
    return map;
  })();

  // Payment method details are only needed when money actually leaves an
  // account; a payment settled wholly from overpayment credit moves no cash.
  const movesMoney = transferCents > 0;

  const paymentValid =
    !!paymentForm.payment_date &&
    paymentCents > 0 &&
    !overpaymentUsedInvalid &&
    (!movesMoney || !!paymentForm.payment_type) &&
    (!movesMoney || !needsBank || !!paymentForm.bank_id) &&
    (!movesMoney || !isCheque || !!paymentForm.cheque_number.trim()) &&
    (!movesMoney || !isBankLike || !!paymentForm.voucher_number.trim());

  const handleProcessPayment = async () => {
    if (!paymentValid) {
      if (paymentCents <= 0) {
        showPopup('error', 'Enter a payment amount greater than zero');
      } else if (overpaymentUsedInvalid) {
        showPopup('error', `Overpayment to settle cannot exceed ${formatCurrency(fromCents(maxUsableOverpaymentCents))} (the available overpayment balance or the outstanding amount)`);
      } else {
        showPopup('error', 'Please fill all required payment fields');
      }
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        expense_ids: selectedForPayment.map(b => b.id),
        payment_date: paymentForm.payment_date,
        payee_id: paymentForm.payee_id || null,
        payee_name: paymentForm.payee_name,
        payment_type_id: movesMoney ? (paymentForm.payment_type_id || null) : null,
        payment_type: movesMoney ? paymentForm.payment_type : null,
        bank_id: movesMoney && needsBank ? paymentForm.bank_id : null,
        cheque_number: movesMoney && isCheque ? paymentForm.cheque_number : null,
        voucher_number: movesMoney && isBankLike ? paymentForm.voucher_number : null,
        reference_number: paymentForm.reference_number || null,
        transfer_amount: transferAmountValue,
        use_overpayment_amount: fromCents(useOverpaymentCents),
        description: paymentForm.description || null
      };

      const response = await api.post('/new-expenses/pay', payload);
      const data = response.data || {};
      const createdOverpayment = data.overpayment || 0;
      const remaining = data.remaining_amount || 0;

      let message = 'Payment submitted successfully!';
      if (createdOverpayment > 0) {
        message = `Payment submitted. Overpayment of ${formatCurrency(createdOverpayment)} recorded for ${data.payee_name || paymentForm.payee_name}.`;
      } else if (remaining > 0) {
        message = `Partial payment of ${formatCurrency(data.applied_amount)} recorded. ${formatCurrency(remaining)} remains in Pending Payment.`;
      }
      showPopup('success', message);

      setSelectedIds([]);
      handleClosePaymentModal();
      await Promise.all([fetchBills(), fetchOverpayments()]);
    } catch (error) {
      console.error('Error submitting payment:', error);
      showPopup('error', error.response?.data?.error || 'Failed to submit payment');
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Payment history (per bill) ----------
  const handleOpenPaymentHistory = async (bill) => {
    setHistoryBill(bill);
    setHistoryRows([]);
    setIsLoadingHistory(true);
    try {
      const response = await api.get(`/new-expenses/${bill.id}/payments`);
      setHistoryRows(response.data || []);
    } catch (error) {
      console.error('Error loading payment history:', error);
      showPopup('error', 'Failed to load payment history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleClosePaymentHistory = () => {
    setHistoryBill(null);
    setHistoryRows([]);
  };

  // ---------- Credit Note: create / view (one per Expense Detail) ----------
  const handleOpenCreditNoteModal = async (bill) => {
    if (!bill) return;
    setCreditNoteSourceBill(bill);
    setShowCreditNoteModal(true);
    setIsCheckingExistingCreditNote(true);
    setCreditNoteExisting(null);

    // A Credit Note is a transaction that belongs to exactly one Expense
    // Detail - check locally first (from the index we already fetched),
    // and always re-confirm with the server before allowing creation.
    const cachedExisting = creditNotesByExpenseId[bill.id];
    try {
      const response = await api.get('/new-expenses/credit-notes', { params: { expense_id: bill.id } });
      const existing = (response.data || []).find(cn => cn.status !== 'Cancelled') || cachedExisting || null;
      if (existing) {
        setCreditNoteExisting(existing);
        setCreditNoteModalMode('view');
        setCreditNoteForm(null);
      } else {
        setCreditNoteModalMode('create');
        setCreditNoteForm({
          credit_note_date: new Date().toISOString().split('T')[0],
          payee_id: bill.payee_id || '',
          payee_name: bill.payee_name,
          company_id: bill.company_id || '',
          company_name: bill.company_name || '',
          without_vat_amount: String(bill.without_vat_amount ?? ''),
          vat_amount: String(bill.vat_amount ?? '0'),
          total_amount: String(bill.total_bill_amount ?? ''),
          notes: ''
        });
      }
    } catch (error) {
      console.error('Error checking for an existing credit note:', error);
      showPopup('error', 'Failed to check for an existing credit note on this expense detail');
      setShowCreditNoteModal(false);
    } finally {
      setIsCheckingExistingCreditNote(false);
    }
  };

  const handleCloseCreditNoteModal = () => {
    setShowCreditNoteModal(false);
    setCreditNoteSourceBill(null);
    setCreditNoteForm(null);
    setCreditNoteExisting(null);
    setCreditNoteModalMode('create');
  };

  const handleCreditNoteFormChange = (e) => {
    const { name, value } = e.target;
    setCreditNoteForm(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'without_vat_amount' || name === 'vat_amount') {
        const withoutVat = parseFloat(next.without_vat_amount) || 0;
        const vat = parseFloat(next.vat_amount) || 0;
        next.total_amount = (withoutVat + vat).toFixed(2);
      }
      return next;
    });
  };

  const handleSaveCreditNote = async () => {
    if (!creditNoteForm) return;
    const total = parseFloat(creditNoteForm.total_amount) || 0;
    if (!creditNoteForm.credit_note_date || !creditNoteForm.company_id || total <= 0) {
      showPopup('error', 'Date, company and a valid amount are required');
      return;
    }

    setIsLoading(true);
    try {
      await api.post('/new-expenses/credit-notes', {
        expense_id: creditNoteSourceBill?.id || null,
        credit_note_date: creditNoteForm.credit_note_date,
        payee_id: creditNoteForm.payee_id || null,
        payee_name: creditNoteForm.payee_name,
        company_id: creditNoteForm.company_id,
        without_vat_amount: parseFloat(creditNoteForm.without_vat_amount) || 0,
        vat_amount: parseFloat(creditNoteForm.vat_amount) || 0,
        total_amount: total,
        notes: creditNoteForm.notes || null
      });
      showPopup('success', 'Credit Note created successfully!');
      handleCloseCreditNoteModal();
      setSelectedIds([]);
      await Promise.all([fetchBills(), fetchCreditNotesIndex()]);
    } catch (error) {
      console.error('Error creating credit note:', error);
      // A 409 means someone else just created one for this same expense
      // detail - surface it as the existing record rather than a plain error.
      if (error.response?.status === 409 && error.response?.data?.existing_credit_note) {
        setCreditNoteExisting(error.response.data.existing_credit_note);
        setCreditNoteModalMode('view');
        showPopup('error', error.response.data.error);
      } else {
        showPopup('error', error.response?.data?.error || 'Failed to create credit note');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Credit Note: apply (set-off against a pending bill) ----------
  const handleOpenApplyCreditNoteModal = async (bill) => {
    setApplyCreditNoteBill(bill);
    setCreditNoteApplyAmounts({});
    setShowApplyCreditNoteModal(true);
    setIsLoadingCreditNotes(true);
    try {
      const params = bill.payee_id
        ? { payee_id: bill.payee_id, company_id: bill.company_id }
        : { payee_name: bill.payee_name, company_id: bill.company_id };
      const response = await api.get('/new-expenses/credit-notes/available', { params });
      setAvailableCreditNotes(response.data || []);
    } catch (error) {
      console.error('Error fetching available credit notes:', error);
      showPopup('error', 'Failed to load available credit notes');
      setAvailableCreditNotes([]);
    } finally {
      setIsLoadingCreditNotes(false);
    }
  };

  const handleCloseApplyCreditNoteModal = () => {
    setShowApplyCreditNoteModal(false);
    setApplyCreditNoteBill(null);
    setAvailableCreditNotes([]);
    setCreditNoteApplyAmounts({});
  };

  const handleCreditNoteApplyAmountChange = (creditNoteId, value) => {
    setCreditNoteApplyAmounts(prev => ({ ...prev, [creditNoteId]: value }));
  };

  const totalCreditNoteApplyAmount = Object.values(creditNoteApplyAmounts)
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

  const handleSubmitApplyCreditNote = async () => {
    const entries = Object.entries(creditNoteApplyAmounts)
      .map(([creditNoteId, amount]) => ({ credit_note_id: creditNoteId, amount: parseFloat(amount) || 0 }))
      .filter(e => e.amount > 0);

    if (entries.length === 0) {
      showPopup('error', 'Enter an amount to apply from at least one credit note');
      return;
    }
    if (totalCreditNoteApplyAmount > parseFloat(applyCreditNoteBill?.balance || 0) + 0.001) {
      showPopup('error', 'Total applied amount cannot exceed the bill balance');
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post('/new-expenses/credit-notes/apply', {
        expense_id: applyCreditNoteBill.id,
        credit_notes: entries,
        applied_date: new Date().toISOString().split('T')[0]
      });
      showPopup('success', `Credit note applied. New balance: ${formatCurrency(response.data?.new_balance || 0)}`);
      handleCloseApplyCreditNoteModal();
      await Promise.all([fetchBills(), fetchCreditNotesIndex()]);
    } catch (error) {
      console.error('Error applying credit note:', error);
      showPopup('error', error.response?.data?.error || 'Failed to apply credit note');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (filteredBills.length === 0) return;

    const worksheetData = [];
    worksheetData.push(['Expenses Report']);
    worksheetData.push([`Status: ${viewFilter === 'paid' ? 'Paid' : 'Pending'}`]);
    worksheetData.push([]);
    worksheetData.push([
      'Bill Date',
      'Bill Number',
      'Payee Name',
      'Expenses Type',
      'Company',
      'VAT Reg No',
      'Without VAT Amount',
      'VAT Amount',
      'Total Bill Amount',
      'Paid Amount',
      'Balance',
      'Status',
      'Description'
    ]);

    filteredBills.forEach((b) => {
      worksheetData.push([
        b.bill_date || 'N/A',
        b.bill_number || 'N/A',
        b.payee_name || 'N/A',
        b.expense_type || 'N/A',
        b.company_name || 'N/A',
        b.vat_reg_number || 'N/A',
        parseFloat(b.without_vat_amount) || 0,
        parseFloat(b.vat_amount) || 0,
        parseFloat(b.total_bill_amount) || 0,
        parseFloat(b.paid_amount) || 0,
        parseFloat(b.balance) || 0,
        b.payment_status || (parseFloat(b.balance) <= 0 ? 'Paid' : 'Pending'),
        b.description || ''
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 14 },
      { wch: 22 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 16 },
      { wch: 16 },
      { wch: 14 },
      { wch: 25 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses');
    XLSX.writeFile(workbook, `expenses-${viewFilter}-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="page-container new-expenses-page">
      <header className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{ textAlign: 'left', margin: 0 }}>
            <FontAwesomeIcon icon={faFileInvoiceDollar} style={{ marginRight: '8px' }} />
            New Expenses
          </h2>
        </div>
      </header>

      {/* New Expense Bill Form */}
      <div className="card form-container" style={{ padding: 'var(--spacing-lg)' }}>
        <h3 className="form-section-title">
          <FontAwesomeIcon icon={editingId ? faEdit : faPlus} />
          {editingId ? 'Edit Expense Bill' : 'New Expense Bill'}
        </h3>

        <form onSubmit={handleSubmit}>
          <div className="form-grid two-col">
            <div className="form-group">
              <label>Bill Date <span className="required">*</span></label>
              <input
                type="date" name="bill_date" value={formData.bill_date}
                onChange={handleChange} required className="form-input"
              />
            </div>
            <div className="form-group">
              <label>Bill Number</label>
              <input
                type="text" name="bill_number" value={formData.bill_number}
                onChange={handleChange} className="form-input" placeholder="Enter bill number"
              />
            </div>
          </div>

          <div className="form-grid two-col">
            <div className="form-group">
              <label>Company <span className="required">*</span></label>
              <select name="company_id" value={formData.company_id} onChange={handleChange} required className="form-select">
                <option value="">Select Company</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Payee Name <span className="required">*</span></label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div className="payee-dropdown-wrapper" style={{ flex: 1 }}>
                  <div className="payee-input-inner">
                    <input
                      type="text" name="payee_name" value={payeeSearch}
                      onChange={handlePayeeInputChange}
                      onFocus={() => setIsPayeeDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsPayeeDropdownOpen(false), 150)}
                      onKeyDown={handlePayeeKeyDown}
                      ref={payeeInputRef} required className="form-input"
                      placeholder="Search or select payee" autoComplete="off"
                    />
                  </div>
                  {isPayeeDropdownOpen && (
                    <div className="payee-dropdown">
                      {filteredPayees.length === 0 ? (
                        <div className="dropdown-empty">No matching payees found.</div>
                      ) : (
                        filteredPayees.map((payee, index) => (
                          <button
                            type="button" key={payee.id}
                            className={`dropdown-item ${index === highlightedPayeeIndex ? 'highlighted' : ''}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handlePayeeSelect(payee)}
                          >
                            <span>{payee.payee_name}</span>
                            {payee.vat_reg_number ? <span className="dropdown-annotation">{payee.vat_reg_number}</span> : null}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="form-grid two-col">
            <div className="form-group">
              <label>VAT Reg Number</label>
              <input
                type="text" name="vat_reg_number" value={formData.vat_reg_number}
                readOnly className="form-input" placeholder="Auto-filled from payee"
              />
            </div>
            <div className="form-group">
              <label>Expenses Type <span className="required">*</span></label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  name="expense_type_id" value={formData.expense_type_id}
                  onChange={handleExpenseTypeChange} required className="form-select" style={{ flex: 1 }}
                >
                  <option value="">Select Expense Type</option>
                  {expenseTypes.map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="form-grid two-col">
            <div className="form-group">
              <label>Sub Expenses Type <span className="required">*</span></label>
              <select
                name="sub_expense_type_id" value={formData.sub_expense_type_id}
                onChange={handleSubExpenseTypeChange} required disabled={!formData.expense_type_id}
                className="form-select"
              >
                <option value="">{formData.expense_type_id ? 'Select Sub Expense Type' : 'Select Expense Type First'}</option>
                {subExpenseTypes.map(type => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Without VAT Amount <span className="required">*</span></label>
              <input
                type="number" name="without_vat_amount" value={formData.without_vat_amount}
                onChange={handleChange} required min="0" step="0.01"
                className="form-input amount-input" placeholder="0.00"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>VAT Amount</label>
              <input
                type="number" name="vat_amount" value={formData.vat_amount}
                onChange={handleChange} min="0" step="0.01"
                className="form-input amount-input" placeholder="0.00"
              />
            </div>
            <div className="form-group">
              <label>Total Bill Amount</label>
              <input
                type="text" value={formData.total_bill_amount} readOnly
                className="form-input total-amount" placeholder="0.00"
              />
            </div>
          </div>

          <div className="form-group full-width">
            <label>Description</label>
            <textarea
              name="description" value={formData.description} onChange={handleChange}
              className="form-textarea" rows="3" placeholder="Enter description (optional)"
            />
          </div>

          <div className="form-actions">
            {editingId && (
              <button type="button" onClick={resetForm} className="btn-secondary" disabled={isLoading}>
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
            )}
            <button type="button" onClick={resetForm} className="btn-secondary" disabled={isLoading}>
              <FontAwesomeIcon icon={faTimes} /> Clear
            </button>
            <button type="submit" className="btn-primary" disabled={isLoading}>
              <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
              {isLoading ? 'Processing...' : (editingId ? 'Update Bill' : 'Submit')}
            </button>
          </div>
        </form>
      </div>

      {/* Expenses Details Table */}
      <div className="card expenses-details-card" style={{ padding: 'var(--spacing-lg)' }}>
        <div className="form-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span><FontAwesomeIcon icon={faReceipt} /> Expenses Details</span>
            <button
              type="button"
              className="btn btn-secondary"
              title={selectedIds.length === 1 ? 'Create a Credit Note for the selected expense detail' : 'Select exactly one expense detail to create a Credit Note'}
              disabled={selectedIds.length !== 1}
              onClick={() => handleOpenCreditNoteModal(bills.find(b => b.id === selectedIds[0]))}
            >
              <FontAwesomeIcon icon={faFileInvoice} /> Credit Note
            </button>
          </div>
          <div className="report-filter-actions">
            <button
              type="button"
              className="btn btn-success"
              title="Export to Excel"
              onClick={handleExportExcel}
              disabled={filteredBills.length === 0}
            >
              <FontAwesomeIcon icon={faFileExcel} /> Export
            </button>
          </div>
        </div>

        <div className="filters-section" style={{ marginBottom: 'var(--spacing-md)' }}>
          <div className="expense-view-tabs" style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className={`btn ${viewFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setViewFilter('pending'); setSelectedIds([]); }}
            >
              Pending ({pendingCount})
            </button>
            <button
              type="button"
              className={`btn ${viewFilter === 'paid' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setViewFilter('paid'); setSelectedIds([]); }}
            >
              Paid ({paidCount})
            </button>
          </div>
          <div className="report-filter-group" style={{ flex: '1 1 auto', marginLeft: 'auto', maxWidth: '300px' }}>
            <div style={{ position: 'relative' }}>
              <FontAwesomeIcon icon={faSearch} style={{ position: 'absolute', left: '10px', top: '12px', color: 'var(--color-text-tertiary)' }} />
              <input
                type="text" placeholder="Search by bill number, payee, expense type..."
                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                className="report-filter-input" style={{ paddingLeft: '32px' }}
              />
              {searchTerm && (
                <button className="clear-search" onClick={() => setSearchTerm('')} style={{ position: 'absolute', right: '10px', top: '10px', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
              )}
            </div>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="report-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input type="checkbox" checked={allSelected} onChange={handleSelectAll} className="select-checkbox" />
                </th>
                <th>Bill Date</th>
                <th>Bill Number</th>
                <th>Payee Name</th>
                <th>Expenses Type</th>
                <th>Sub Expenses Type</th>
                <th>Company</th>
                <th>VAT Reg No</th>
                <th>Without VAT Amount</th>
                <th>VAT Amount</th>
                <th>Total Bill Amount</th>
                <th>Paid Amount</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Description</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {isFetching ? (
                <tr><td colSpan="16" className="loading-row"><FontAwesomeIcon icon={faSpinner} spin /> Loading expenses...</td></tr>
              ) : filteredBills.length > 0 ? (
                filteredBills.map(bill => {
                  const isPaid = parseFloat(bill.balance || 0) <= 0;
                  const existingCn = creditNotesByExpenseId[bill.id];
                  return (
                    <tr key={bill.id}>
                      <td>
                        <input type="checkbox" checked={selectedIds.includes(bill.id)} onChange={() => handleSelectOne(bill.id)} className="select-checkbox" />
                      </td>
                      <td className="date-cell">{bill.bill_date}</td>
                      <td className="bill-number-cell">
                        {bill.bill_number || '-'}
                        {existingCn && (
                          <span className="badge badge-primary" style={{ marginLeft: '6px' }} title={`Credit Note ${existingCn.credit_note_number} (${existingCn.status})`}>
                            CN
                          </span>
                        )}
                      </td>
                      <td className="payee-cell">{bill.payee_name}</td>
                      <td className="expense-type-cell">{bill.expense_type || '-'}</td>
                      <td className="expense-type-cell">{bill.sub_expense_type || '-'}</td>
                      <td>{bill.company_name || '-'}</td>
                      <td className="vat-cell">{bill.vat_reg_number || '-'}</td>
                      <td className="amount-cell">{formatCurrency(bill.without_vat_amount)}</td>
                      <td className="amount-cell">{formatCurrency(bill.vat_amount)}</td>
                      <td className="amount-cell total">{formatCurrency(bill.total_bill_amount)}</td>
                      <td className="amount-cell">{formatCurrency(bill.paid_amount)}</td>
                      <td className="balance-cell">
                        <span className={parseFloat(bill.balance) > 0 ? 'balance-positive' : 'balance-zero'}>
                          {formatCurrency(bill.balance)}
                        </span>
                      </td>
                      <td>
                        <span className={`payment-status-badge ${isPaid ? 'paid' : 'pending'}`}>
                          <span className="status-dot"></span>
                          {bill.payment_status || (isPaid ? 'Paid' : 'Pending')}
                        </span>
                      </td>
                      <td className="description-cell">{bill.description || '-'}</td>
                      <td className={`action-cell ${openActionMenuId === bill.id ? 'menu-open' : ''}`}>
                        {viewFilter === 'pending' ? (
                          <div className="expense-action-menu-wrapper">
                            <button
                              type="button"
                              className={`action-menu-trigger ${openActionMenuId === bill.id ? 'active' : ''}`}
                              onClick={(e) => handleToggleActionMenu(bill, e)}
                              title="More actions"
                              aria-haspopup="true"
                              aria-expanded={openActionMenuId === bill.id}
                            >
                              <FontAwesomeIcon icon={faEllipsisV} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="action-menu-trigger"
                            onClick={() => handleOpenPaymentHistory(bill)}
                            title="Payment History"
                          >
                            <FontAwesomeIcon icon={faHistory} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="16" className="empty-row">
                    {viewFilter === 'paid' ? 'No paid expense bills found' : 'No pending expense bills found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {viewFilter === 'pending' ? (
          <div className="payment-action-bar">
            <div className="selected-info">
              {selectedIds.length > 0 ? (
                <>
                  <span className="selected-count">
                    <FontAwesomeIcon icon={faCheckCircle} /> {selectedIds.length} bill(s) selected
                    <span className="selected-total"> | Total: {formatCurrency(totalSelectedBalance)}</span>
                  </span>
                  {selectedPayeeNames.length === 1 ? (
                    <span className="payee-status valid">✓ Payee: <strong>{selectedPayeeNames[0]}</strong></span>
                  ) : selectedPayeeNames.length > 1 ? (
                    <span className="payee-status invalid">
                      <FontAwesomeIcon icon={faExclamationTriangle} /> Multiple payees selected ({selectedPayeeNames.join(', ')})
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="selected-count"><FontAwesomeIcon icon={faReceipt} /> Select bill(s) to pay, or select one to raise a Credit Note</span>
              )}
            </div>
            <button className="btn-pay" onClick={handleOpenPaymentModal} disabled={isLoading}>
              <FontAwesomeIcon icon={faMoneyBillWave} /> Pay
            </button>
          </div>
        ) : (
          <div className="payment-action-bar">
            <div className="selected-info">
              <span className="selected-count">
                <FontAwesomeIcon icon={faCheckCircle} />
                {selectedIds.length === 1
                  ? '1 expense detail selected - use the Credit Note button above'
                  : 'Select one expense detail to raise a Credit Note'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Payee overpayments - credit kept for a payee until it is settled */}
      {(() => {
        const visible = overpayments.filter(o => showUsedOverpayments || parseFloat(o.remaining_credit) > 0);
        const totalAvailable = overpayments.reduce((sum, o) => sum + (parseFloat(o.remaining_credit) || 0), 0);
        if (overpayments.length === 0) return null;
        return (
          <div className="card" style={{ padding: 'var(--spacing-lg)', marginTop: 'var(--spacing-lg)' }}>
            <div className="form-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-md)' }}>
              <span><FontAwesomeIcon icon={faMoneyBillWave} /> Overpayments <small style={{ color: '#6b7280' }}>| Available: {formatCurrency(totalAvailable)}</small></span>
              <label style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={showUsedOverpayments} onChange={(e) => setShowUsedOverpayments(e.target.checked)} />
                Show fully used
              </label>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Payee / Supplier</th>
                    <th>Payment Date</th>
                    <th>Overpayment</th>
                    <th>Used</th>
                    <th>Available Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length > 0 ? visible.map(o => (
                    <tr key={o.id}>
                      <td className="payee-cell">{o.payee_name}</td>
                      <td className="date-cell">{o.payment_date || '-'}</td>
                      <td className="amount-cell">{formatCurrency(o.amount)}</td>
                      <td className="amount-cell">{formatCurrency(o.used_amount)}</td>
                      <td className="amount-cell total">{formatCurrency(o.remaining_credit)}</td>
                      <td>
                        <span className={`payment-status-badge ${parseFloat(o.remaining_credit) > 0 ? 'pending' : 'paid'}`}>
                          <span className="status-dot"></span>{o.status}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="6" className="empty-row">No available overpayments</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Payment history for one bill */}
      {historyBill && (
        <div className="payment-modal-overlay" onClick={handleClosePaymentHistory}>
          <div className="payment-modal-content payment-history-modal" onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3><FontAwesomeIcon icon={faHistory} /> Payment History
                <span className="payment-count">{historyBill.bill_number || `#${historyBill.id}`} - {historyBill.payee_name}</span>
              </h3>
              <button className="payment-modal-close" onClick={handleClosePaymentHistory}></button>
            </div>
            <div className="payment-modal-body">
              <div className="expense-summary-row">
                <span className="summary-label">Total Bill Amount</span>
                <span className="summary-value">{formatCurrency(historyBill.total_bill_amount)}</span>
              </div>
              <div className="expense-summary-row">
                <span className="summary-label">Paid</span>
                <span className="summary-value">{formatCurrency(historyBill.paid_amount)}</span>
              </div>
              <div className="expense-summary-row balance-row">
                <span className="summary-label">Remaining</span>
                <span className="summary-value balance-amount">{formatCurrency(historyBill.balance)}</span>
              </div>
              <div className="payment-history-table-wrap">
                <table className="report-table payment-history-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Applied to Bill</th>
                      <th>Overpayment Used</th>
                      <th>Overpayment Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoadingHistory ? (
                      <tr><td colSpan="6" className="loading-row"><FontAwesomeIcon icon={faSpinner} spin /> Loading...</td></tr>
                    ) : historyRows.length > 0 ? historyRows.map(h => (
                      <tr key={`${h.payment_id}-${h.amount}`}>
                        <td className="date-cell">{h.payment_date}</td>
                        <td>{h.payment_type}</td>
                        <td>{h.cheque_number || h.voucher_number || h.reference_number || '-'}</td>
                        <td className="amount-cell">{formatCurrency(h.amount)}</td>
                        <td className="amount-cell">{parseFloat(h.overpayment_used_amount) > 0 ? formatCurrency(h.overpayment_used_amount) : '-'}</td>
                        <td className="amount-cell">{parseFloat(h.overpayment_amount) > 0 ? formatCurrency(h.overpayment_amount) : '-'}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="6" className="empty-row">No payments recorded yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="payment-modal-footer">
              <button type="button" className="btn-secondary" onClick={handleClosePaymentHistory}>
                <FontAwesomeIcon icon={faTimes} /> Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Details Modal */}
      {showPaymentModal && (
        // Form popups below: the backdrop is inert so an outside click does not discard what was typed.
        <div className="payment-modal-overlay">
          <div className="payment-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3>
                <FontAwesomeIcon icon={faCreditCard} /> Payment Details
                <span className="payment-count">{selectedForPayment.length} bill(s)</span>
              </h3>
              <button className="payment-modal-close" onClick={handleClosePaymentModal}>×</button>
            </div>

            <div className="payment-modal-body">
              <div className="payment-details-section">
                <div className="payment-section-title">Payment Details</div>

                <div className="payment-form-row">
                  <div className="payment-form-group">
                    <label>Payment Date <span className="required">*</span></label>
                    <input
                      type="date" name="payment_date" value={paymentForm.payment_date}
                      onChange={handlePaymentFormChange} className="payment-input" required
                    />
                  </div>
                  <div className="payment-form-group">
                    <label>Payee Name</label>
                    <input type="text" value={paymentForm.payee_name} readOnly className="payment-input" />
                  </div>
                </div>

                <div className="payment-form-row">
                  <div className="payment-form-group">
                    <label>Payment Type <span className="required">*</span></label>
                    <select
                      name="payment_type_id" value={paymentForm.payment_type_id}
                      onChange={handlePaymentTypeChange} className="payment-input" required
                    >
                      <option value="">Select Payment Type</option>
                      {paymentTypes.map(pt => (
                        <option key={pt.id} value={pt.id}>{pt.name}</option>
                      ))}
                    </select>
                  </div>

                  {needsBank && (
                    <div className="payment-form-group">
                      <label>Bank <span className="required">*</span></label>
                      <div className="custom-select-container">
                        <div className="custom-select-trigger" onClick={() => setIsBankDropdownOpen(!isBankDropdownOpen)}>
                          <input
                            type="text" placeholder="Search or select bank..." value={bankSearchTerm}
                            onChange={(e) => { setBankSearchTerm(e.target.value); setPaymentForm(prev => ({ ...prev, bank_name: e.target.value, bank_id: '' })); }}
                            onFocus={() => setIsBankDropdownOpen(true)} className="custom-select-input" autoComplete="off" required
                          />
                          <FontAwesomeIcon icon={isBankDropdownOpen ? faChevronUp : faChevronDown} className="dropdown-icon" />
                        </div>
                        {isBankDropdownOpen && (
                          <div className="custom-select-dropdown">
                            {filteredBanks.length > 0 ? (
                              filteredBanks.map(bank => (
                                <div key={bank.id} className="dropdown-item" onClick={() => handleBankSelect(bank)}>
                                  <FontAwesomeIcon icon={faBuildingColumns} className="dropdown-icon-sm" /> {bank.bank_name}
                                </div>
                              ))
                            ) : (
                              <div className="dropdown-empty">No banks found</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="payment-form-row">
                  {isCheque && (
                    <div className="payment-form-group">
                      <label>Cheque Number <span className="required">*</span></label>
                      <input
                        type="text" name="cheque_number" value={paymentForm.cheque_number}
                        onChange={handlePaymentFormChange} className="payment-input"
                        placeholder="Enter cheque number" required
                      />
                      <div style={{ padding: '6px 10px', background: '#fef3c7', color: '#92400e', borderRadius: '6px', fontSize: '12px', marginTop: '6px', borderLeft: '4px solid #f59e0b' }}>
                        ℹ️ <strong>Cheque Payment:</strong> Remains <strong>Pending / Unreleased</strong>. Ledger balance is deducted only upon Cheque Release.
                      </div>
                    </div>
                  )}
                  {isBankLike && (
                    <div className="payment-form-group">
                      <label>Voucher Number <span className="required">*</span></label>
                      <input
                        type="text" name="voucher_number" value={paymentForm.voucher_number}
                        onChange={handlePaymentFormChange} className="payment-input"
                        placeholder="Enter voucher number" required
                      />
                    </div>
                  )}
                  <div className="payment-form-group">
                    <label>Reference Number</label>
                    <input
                      type="text" name="reference_number" value={paymentForm.reference_number}
                      onChange={handlePaymentFormChange} className="payment-input" placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="payment-form-row">
                  <div className="payment-form-group full-width">
                    <label>Description</label>
                    <input
                      type="text" name="description" value={paymentForm.description}
                      onChange={handlePaymentFormChange} className="payment-input" placeholder="Optional"
                    />
                  </div>
                </div>
              </div>

              <div className="online-details-section">
                <div className="payment-section-title">Bill Details</div>

                {selectedForPayment.length > 0 && (
                  <div className="online-expense-summary">
                    {selectedForPayment.map((bill, index) => (
                      <div key={bill.id} className="expense-summary-item">
                        <div className="expense-summary-row">
                          <span className="summary-label">Bill Date</span>
                          <span className="summary-value">{bill.bill_date}</span>
                        </div>
                        <div className="expense-summary-row">
                          <span className="summary-label">Bill Number</span>
                          <span className="summary-value">{bill.bill_number || '-'}</span>
                        </div>
                        <div className="expense-summary-row">
                          <span className="summary-label">Outstanding</span>
                          <span className="summary-value">{formatCurrency(bill.balance)}</span>
                        </div>
                        {paymentCents > 0 && (
                          <>
                            <div className="expense-summary-row">
                              <span className="summary-label">This Payment</span>
                              <span className="summary-value">{formatCurrency(billAllocationPreview[bill.id]?.paying || 0)}</span>
                            </div>
                            <div className="expense-summary-row">
                              <span className="summary-label">Remaining</span>
                              <span className="summary-value" style={(billAllocationPreview[bill.id]?.remaining || 0) > 0 ? { color: '#b45309' } : undefined}>
                                {formatCurrency(billAllocationPreview[bill.id]?.remaining || 0)}
                              </span>
                            </div>
                          </>
                        )}
                        {index < selectedForPayment.length - 1 && <hr className="expense-divider" />}
                      </div>
                    ))}
                  </div>
                )}

                <div className="expense-summary-row total-row">
                  <span className="summary-label">Outstanding Amount</span>
                  <span className="summary-value total-amount">{formatCurrency(totalBillAmountForPayment)}</span>
                </div>

                {payeeOverpayment.total_available > 0 && (
                  <div style={{ margin: '10px 0', padding: '10px 12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderLeft: '4px solid #10b981', borderRadius: '6px' }}>
                    <div className="expense-summary-row" style={{ marginBottom: '6px' }}>
                      <span className="summary-label">Available Overpayment Balance <small>({paymentForm.payee_name})</small></span>
                      <span className="summary-value" style={{ color: '#047857', fontWeight: 600 }}>{formatCurrency(payeeOverpayment.total_available)}</span>
                    </div>
                    <div className="payment-form-group" style={{ margin: 0 }}>
                      <label>Settle from Overpayment</label>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="number" name="use_overpayment" value={paymentForm.use_overpayment}
                          onChange={handlePaymentFormChange} className="payment-input"
                          placeholder="0.00" min="0" max={fromCents(maxUsableOverpaymentCents)} step="0.01"
                        />
                        <button
                          type="button" className="btn-secondary"
                          onClick={() => setPaymentForm(prev => ({
                            ...prev,
                            use_overpayment: fromCents(maxUsableOverpaymentCents).toFixed(2),
                            // Overpayment covers what it can; only the rest needs to be paid.
                            transfer_amount: fromCents(Math.max(0, outstandingCents - maxUsableOverpaymentCents)).toFixed(2)
                          }))}
                        >
                          Use max
                        </button>
                      </div>
                      {overpaymentUsedInvalid && (
                        <small style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                          Cannot exceed {formatCurrency(fromCents(maxUsableOverpaymentCents))} (available overpayment / outstanding amount)
                        </small>
                      )}
                    </div>
                  </div>
                )}

                <div className="payment-form-group transfer-row">
                  <label>Payment Amount (Transfer) <span className="required">*</span></label>
                  <input
                    type="number" name="transfer_amount" value={paymentForm.transfer_amount}
                    onChange={handlePaymentFormChange} className="payment-input transfer-input"
                    placeholder="0.00" min="0" step="0.01" required
                  />
                  <small style={{ color: '#6b7280', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    Enter any amount: less than the outstanding amount is a partial payment, more is recorded as an overpayment.
                  </small>
                </div>

                {paymentKind === 'partial' && (
                  <>
                    <div className="expense-summary-row balance-row">
                      <span className="summary-label">Remaining Amount</span>
                      <span className="summary-value balance-amount" style={{ color: '#b45309' }}>{formatCurrency(remainingAmount)}</span>
                    </div>
                    <div style={{ padding: '6px 10px', background: '#fef3c7', color: '#92400e', borderRadius: '6px', fontSize: '12px', marginTop: '6px', borderLeft: '4px solid #f59e0b' }}>
                      <strong>Partial Payment:</strong> {formatCurrency(remainingAmount)} stays in the <strong>Pending Payment</strong> tab. Payment is applied to the oldest bills first.
                    </div>
                  </>
                )}
                {paymentKind === 'full' && (
                  <div style={{ padding: '6px 10px', background: '#ecfdf5', color: '#065f46', borderRadius: '6px', fontSize: '12px', marginTop: '6px', borderLeft: '4px solid #10b981' }}>
                    <strong>Full Payment:</strong> outstanding amount becomes {formatCurrency(0)} and the bill(s) are marked Paid.
                  </div>
                )}
                {paymentKind === 'overpayment' && (
                  <>
                    <div className="expense-summary-row balance-row">
                      <span className="summary-label">Overpayment <small>({paymentForm.payee_name})</small></span>
                      <span className="summary-value balance-amount" style={{ color: '#856404' }}>
                        {formatCurrency(overpayment)}
                      </span>
                    </div>
                    <div style={{ padding: '6px 10px', background: '#fef3c7', color: '#92400e', borderRadius: '6px', fontSize: '12px', marginTop: '6px', borderLeft: '4px solid #f59e0b' }}>
                      <strong>Overpayment:</strong> the bill(s) are settled in full and {formatCurrency(overpayment)} is kept as credit for <strong>{paymentForm.payee_name}</strong>, ready to settle against a future payment for the same payee.
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="payment-modal-footer">
              <button type="button" className="btn-secondary" onClick={handleClosePaymentModal} disabled={isLoading}>
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
              <button type="button" className="btn-pay" onClick={handleProcessPayment} disabled={isLoading || !paymentValid}>
                <FontAwesomeIcon icon={isLoading ? faSpinner : faMoneyBillWave} spin={isLoading} />
                {isLoading ? 'Processing...' : 'Submit Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Note - create / view modal (one Credit Note per Expense Detail) */}
      {showCreditNoteModal && creditNoteSourceBill && (
        <div className="payment-modal-overlay cn-modal">
          <div className="payment-modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3><FontAwesomeIcon icon={faFileInvoice} /> Credit Note</h3>
              <button className="payment-modal-close" onClick={handleCloseCreditNoteModal}>×</button>
            </div>
            <div className="payment-modal-body">
              {isCheckingExistingCreditNote ? (
                <div className="loading-row"><FontAwesomeIcon icon={faSpinner} spin /> Checking this expense detail...</div>
              ) : creditNoteModalMode === 'view' && creditNoteExisting ? (
                <div className="payment-details-section">
                  <div className="expense-summary-row">
                    <span className="summary-label">Expense Detail</span>
                    <span className="summary-value">{creditNoteSourceBill.bill_number || `#${creditNoteSourceBill.id}`}</span>
                  </div>
                  <p className="cn-note-banner">
                    This expense detail already has a Credit Note. Only one Credit Note can be raised per expense detail.
                  </p>
                  <div className="expense-summary-row">
                    <span className="summary-label">Credit Note No</span>
                    <span className="summary-value">{creditNoteExisting.credit_note_number}</span>
                  </div>
                  <div className="expense-summary-row">
                    <span className="summary-label">Status</span>
                    <span className="summary-value">{creditNoteExisting.status}</span>
                  </div>
                  <div className="expense-summary-row">
                    <span className="summary-label">Total Amount</span>
                    <span className="summary-value">{formatCurrency(creditNoteExisting.total_amount)}</span>
                  </div>
                  <div className="expense-summary-row balance-row">
                    <span className="summary-label">Remaining Balance</span>
                    <span className="summary-value balance-amount">{formatCurrency(creditNoteExisting.remaining_credit)}</span>
                  </div>
                </div>
              ) : creditNoteForm ? (
                <div className="payment-details-section">
                  <div className="payment-form-row">
                    <div className="payment-form-group">
                      <label>Date <span className="required">*</span></label>
                      <input
                        type="date" name="credit_note_date" value={creditNoteForm.credit_note_date}
                        onChange={handleCreditNoteFormChange} className="payment-input" required
                      />
                    </div>
                    <div className="payment-form-group">
                      <label>Supplier Name</label>
                      <input type="text" value={creditNoteForm.payee_name} readOnly className="payment-input" />
                    </div>
                  </div>
                  <div className="payment-form-row">
                    <div className="payment-form-group">
                      <label>Company</label>
                      <input type="text" value={creditNoteForm.company_name || '-'} readOnly className="payment-input" />
                    </div>
                  </div>
                  <div className="payment-form-row">
                    <div className="payment-form-group">
                      <label>Amount Before VAT <span className="required">*</span></label>
                      <input
                        type="number" name="without_vat_amount" value={creditNoteForm.without_vat_amount}
                        onChange={handleCreditNoteFormChange} className="payment-input" min="0" step="0.01"
                      />
                    </div>
                    <div className="payment-form-group">
                      <label>VAT Amount</label>
                      <input
                        type="number" name="vat_amount" value={creditNoteForm.vat_amount}
                        onChange={handleCreditNoteFormChange} className="payment-input" min="0" step="0.01"
                      />
                    </div>
                  </div>
                  <div className="payment-form-row">
                    <div className="payment-form-group">
                      <label>Total Credit Note Amount</label>
                      <input type="text" value={creditNoteForm.total_amount} readOnly className="payment-input total-amount" />
                    </div>
                  </div>
                  <div className="payment-form-row">
                    <div className="payment-form-group full-width">
                      <label>Notes</label>
                      <input
                        type="text" name="notes" value={creditNoteForm.notes}
                        onChange={handleCreditNoteFormChange} className="payment-input" placeholder="Optional"
                      />
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="payment-modal-footer">
              <button type="button" className="btn-secondary" onClick={handleCloseCreditNoteModal} disabled={isLoading}>
                <FontAwesomeIcon icon={faTimes} /> {creditNoteModalMode === 'view' ? 'Close' : 'Cancel'}
              </button>
              {creditNoteModalMode === 'create' && !isCheckingExistingCreditNote && creditNoteForm && (
                <button type="button" className="btn-pay" onClick={handleSaveCreditNote} disabled={isLoading}>
                  <FontAwesomeIcon icon={isLoading ? faSpinner : faSave} spin={isLoading} />
                  {isLoading ? 'Saving...' : 'Create Credit Note'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Credit Note - apply (set-off) modal */}
      {showApplyCreditNoteModal && applyCreditNoteBill && (
        <div className="payment-modal-overlay cn-modal cn-modal-wide">
          <div className="payment-modal-content" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3><FontAwesomeIcon icon={faRightLeft} /> Apply Credit Note</h3>
              <button className="payment-modal-close" onClick={handleCloseApplyCreditNoteModal}>×</button>
            </div>
            <div className="payment-modal-body">
              <div className="payment-details-section">
                <div className="expense-summary-row">
                  <span className="summary-label">Supplier</span>
                  <span className="summary-value">{applyCreditNoteBill.payee_name}</span>
                </div>
                <div className="expense-summary-row">
                  <span className="summary-label">Bill Balance</span>
                  <span className="summary-value">{formatCurrency(applyCreditNoteBill.balance)}</span>
                </div>

                <div className="payment-section-title" style={{ marginTop: '12px' }}>Available Credit Notes</div>
                {isLoadingCreditNotes ? (
                  <div className="loading-row"><FontAwesomeIcon icon={faSpinner} spin /> Loading credit notes...</div>
                ) : availableCreditNotes.length === 0 ? (
                  <div className="dropdown-empty">No available credit notes for this supplier and company.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="cn-credit-table">
                      <thead>
                        <tr>
                          <th>Credit Note No</th>
                          <th>Date</th>
                          <th>Available</th>
                          <th>Amount to Apply</th>
                        </tr>
                      </thead>
                      <tbody>
                        {availableCreditNotes.map(cn => (
                          <tr key={cn.id}>
                            <td>{cn.credit_note_number}</td>
                            <td>{cn.credit_note_date}</td>
                            <td className="amount-cell">{formatCurrency(cn.remaining_credit)}</td>
                            <td>
                              <input
                                type="number" min="0" step="0.01" max={cn.remaining_credit}
                                value={creditNoteApplyAmounts[cn.id] || ''}
                                onChange={(e) => handleCreditNoteApplyAmountChange(cn.id, e.target.value)}
                                className="payment-input" style={{ width: '110px' }}
                                placeholder="0.00"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {totalCreditNoteApplyAmount > 0 && (
                  <div className="expense-summary-row balance-row" style={{ marginTop: '10px' }}>
                    <span className="summary-label">Total to Apply</span>
                    <span className="summary-value balance-amount">{formatCurrency(totalCreditNoteApplyAmount)}</span>
                  </div>
                )}
                {totalCreditNoteApplyAmount > parseFloat(applyCreditNoteBill.balance || 0) && (
                  <small style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    Total applied amount cannot exceed the bill balance
                  </small>
                )}
              </div>
            </div>
            <div className="payment-modal-footer">
              <button type="button" className="btn-secondary" onClick={handleCloseApplyCreditNoteModal} disabled={isLoading}>
                <FontAwesomeIcon icon={faTimes} /> Cancel
              </button>
              <button
                type="button" className="btn-pay" onClick={handleSubmitApplyCreditNote}
                disabled={isLoading || availableCreditNotes.length === 0 || totalCreditNoteApplyAmount <= 0}
              >
                <FontAwesomeIcon icon={isLoading ? faSpinner : faRightLeft} spin={isLoading} />
                {isLoading ? 'Applying...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick-add Payee modal */}
      {showAddPayee && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-content" style={{ maxWidth: '380px' }} onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3>Add Payee</h3>
              <button className="payment-modal-close" onClick={() => setShowAddPayee(false)}>×</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div className="payment-form-group">
                <label>Payee Name <span className="required">*</span></label>
                <input
                  type="text" value={newPayeeName} onChange={(e) => setNewPayeeName(e.target.value)}
                  className="payment-input" placeholder="Enter payee name" autoFocus
                />
              </div>
            </div>
            <div className="payment-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowAddPayee(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleQuickAddPayee}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Quick-add Expense Type modal */}
      {showAddType && (
        <div className="payment-modal-overlay">
          <div className="payment-modal-content" style={{ maxWidth: '380px' }} onClick={(e) => e.stopPropagation()}>
            <div className="payment-modal-header">
              <h3>Add Expense Type</h3>
              <button className="payment-modal-close" onClick={() => setShowAddType(false)}>×</button>
            </div>
            <div style={{ padding: '20px' }}>
              <div className="payment-form-group">
                <label>Type Name <span className="required">*</span></label>
                <input
                  type="text" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)}
                  className="payment-input" placeholder="Enter expense type" autoFocus
                />
              </div>
            </div>
            <div className="payment-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowAddType(false)}>Cancel</button>
              <button type="button" className="btn-primary" onClick={handleQuickAddType}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Three-dot action menu rendered via portal so it floats cleanly above the table without clipping */}
      {openActionMenuId && menuPosition && createPortal(
        <div
          ref={actionMenuDropdownRef}
          className={`action-menu-dropdown portal-dropdown ${menuPosition.openUpward ? 'open-upward' : 'open-downward'}`}
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            right: `${menuPosition.right}px`,
            zIndex: 99999
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="action-menu-item"
            onClick={() => {
              const targetBill = menuPosition.bill;
              setOpenActionMenuId(null);
              setMenuPosition(null);
              handleOpenApplyCreditNoteModal(targetBill);
            }}
          >
            <FontAwesomeIcon icon={faRightLeft} />
            <span>Apply Credit Note</span>
          </button>
          <button
            type="button"
            className="action-menu-item"
            onClick={() => {
              const targetBill = menuPosition.bill;
              setOpenActionMenuId(null);
              setMenuPosition(null);
              handleOpenPaymentHistory(targetBill);
            }}
          >
            <FontAwesomeIcon icon={faHistory} />
            <span>Payment History</span>
          </button>
          <button
            type="button"
            className="action-menu-item"
            onClick={() => {
              const targetBill = menuPosition.bill;
              setOpenActionMenuId(null);
              setMenuPosition(null);
              handleEdit(targetBill);
            }}
          >
            <FontAwesomeIcon icon={faEdit} />
            <span>Edit</span>
          </button>
          <button
            type="button"
            className="action-menu-item danger"
            onClick={() => {
              const targetBillId = menuPosition.bill.id;
              setOpenActionMenuId(null);
              setMenuPosition(null);
              handleDelete(targetBillId);
            }}
          >
            <FontAwesomeIcon icon={faTrash} />
            <span>Delete</span>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
};

export default NewExpenses;
