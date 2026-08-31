// src/components/FGProduction/FGRecipesReports.jsx
//
// FG - Finished Goods Production (NEW, INDEPENDENT MODULE)
// -----------------------------------------------------------------------
// Shows only records belonging to the new FG Production module.
// Existing Finished Goods records are never displayed here.
// -----------------------------------------------------------------------

import React, { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChartBar, faSearch, faBoxOpen, faFlask } from '@fortawesome/free-solid-svg-icons';
import Select from 'react-select';
import { usePopup } from '../context/PopupContext';
import api from '../../api';
import './FGProduction.css';
import { UTILITY_COST_RATE } from './fgProductionConstants';

const ALLOWED_FG_DEPARTMENTS = ['Bakery', 'Cake', 'Pastry', 'Restaurant', 'Savory'];

const FGRecipesReports = () => {
  const { showPopup } = usePopup();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [departmentFilter, setDepartmentFilter] = useState(null);
  const [search, setSearch] = useState('');

  const fetchReport = useCallback(async (deptId) => {
    try {
      setLoading(true);
      const res = await api.get('/fg-production/reports/recipes', {
        params: deptId ? { department_id: deptId } : {}
      });
      setRows(res.data || []);
    } catch (err) {
      console.error(err);
      showPopup('error', 'Failed to load FG Recipes Report');
    } finally {
      setLoading(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchReport();
    api.get('/departments')
      .then(res => setDepartments((res.data || []).filter(d => ALLOWED_FG_DEPARTMENTS.includes(d.name))))
      .catch(err => console.error(err));
  }, [fetchReport]);

  useEffect(() => {
    fetchReport(departmentFilter?.value);
  }, [departmentFilter, fetchReport]);

  const departmentOptions = departments.map(d => ({ value: d.id, label: d.name }));

  const filteredRows = rows
    .filter(r => r.fg_item_name.toLowerCase().includes(search.toLowerCase()))
    .map(r => {
      const outputQty = parseFloat(r.recipe_output_quantity) || 0;
      const rmCost = parseFloat(r.rm_cost) || 0;

      const utilityPercentage = Number.parseFloat(r.utility_cost_percentage);
      const configuredUtilityPercentage = Number.isFinite(utilityPercentage)
        ? utilityPercentage
        : UTILITY_COST_RATE * 100;
      // Utility Cost = RM Cost × configured utility percentage
      const utilityCost = rmCost * (configuredUtilityPercentage / 100);
      // Total Production Cost = RM Cost + Utility Cost
      const totalProductionCost = rmCost + utilityCost;
      // Production Cost Per Piece = Total Production Cost ÷ Recipe Output Quantity
      const productionCostPerPiece = outputQty > 0 ? totalProductionCost / outputQty : null;

      const rmCostPerPiece = outputQty > 0 ? rmCost / outputQty : null;
      const sellingPrice = r.selling_price !== null && r.selling_price !== undefined
        ? parseFloat(r.selling_price)
        : null;
      const grossProfitPerPiece = (sellingPrice !== null && productionCostPerPiece !== null)
        ? sellingPrice - productionCostPerPiece
        : null;
      const grossMarginPct = (grossProfitPerPiece !== null && sellingPrice > 0)
        ? (grossProfitPerPiece / sellingPrice) * 100
        : null;

      return {
        ...r,
        rmCostPerPiece,
        productionCostPerPiece,
        grossProfitPerPiece,
        grossMarginPct
      };
    });

  const grandTotalCost = filteredRows.reduce((sum, r) => sum + (parseFloat(r.rm_cost) || 0), 0);
  const totalActiveRmRecipes = filteredRows.reduce((sum, r) => sum + (parseInt(r.rm_recipes_count) || 0), 0);

  return (
    <div className="fgprod-container">
      <div className="fgprod-header">
        <div>
          <h1 className="fgprod-title">
            <FontAwesomeIcon icon={faChartBar} /> FG Recipes Reports
          </h1>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="fgprod-summary-grid">
        <div className="fgprod-summary-card">
          <div className="fgprod-summary-icon">
            <FontAwesomeIcon icon={faBoxOpen} />
          </div>
          <div className="fgprod-summary-info">
            <span className="fgprod-summary-label">Total FG Recipes</span>
            <h4 className="fgprod-summary-val">{filteredRows.length}</h4>
          </div>
        </div>
        <div className="fgprod-summary-card">
          <div className="fgprod-summary-icon">
            <FontAwesomeIcon icon={faFlask} />
          </div>
          <div className="fgprod-summary-info">
            <span className="fgprod-summary-label">Active RM Recipes</span>
            <h4 className="fgprod-summary-val">{totalActiveRmRecipes}</h4>
          </div>
        </div>
        <div className="fgprod-summary-card">
          <div className="fgprod-summary-icon">
            <FontAwesomeIcon icon={faChartBar} />
          </div>
          <div className="fgprod-summary-info">
            <span className="fgprod-summary-label">Total RM Cost</span>
            <h4 className="fgprod-summary-val">Rs. {grandTotalCost.toFixed(2)}</h4>
          </div>
        </div>
      </div>

      <div className="fgprod-card">
        <div className="fgprod-picker-row" style={{ marginBottom: '1.5rem' }}>
          <div className="fgprod-search-box">
            <FontAwesomeIcon icon={faSearch} />
            <input
              placeholder="Search by FG item name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="fgprod-select-wrap" style={{ maxWidth: 280 }}>
            <Select
              classNamePrefix="react-select"
              options={departmentOptions}
              value={departmentFilter}
              onChange={setDepartmentFilter}
              isClearable
              placeholder="Filter by department..."
            />
          </div>
        </div>

        {loading ? (
          <div className="fgprod-loading">
            <div className="fgprod-spinner"></div>
            <span>Loading report...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="fgprod-empty">
            <FontAwesomeIcon icon={faBoxOpen} size="3x" />
            <h3>No FG Production items found</h3>
          </div>
        ) : (
          <div className="fgprod-table-wrapper">
            <table className="fgprod-table fgprod-recipes-report-table">
              <colgroup>
                <col className="fgprod-recipes-col-item" />
                <col className="fgprod-recipes-col-department" />
                <col className="fgprod-recipes-col-output" />
                <col className="fgprod-recipes-col-recipes" />
                <col className="fgprod-recipes-col-cost-batch" />
                <col className="fgprod-recipes-col-cost-piece" />
                <col className="fgprod-recipes-col-production" />
                <col className="fgprod-recipes-col-selling" />
                <col className="fgprod-recipes-col-profit" />
                <col className="fgprod-recipes-col-margin" />
              </colgroup>
              <thead>
                <tr>
                  <th>FG Item Name</th>
                  <th>Department</th>
                  <th className="fgprod-report-center">Output (Pcs)</th>
                  <th className="fgprod-report-center">RM Recipes</th>
                  <th className="fgprod-report-currency">RM Cost</th>
                  <th className="fgprod-report-currency">RM Cost for Piece</th>
                  <th className="fgprod-report-currency">Production Cost for Piece</th>
                  <th className="fgprod-report-currency">Selling Price</th>
                  <th className="fgprod-report-currency">Gross Profit / Piece</th>
                  <th className="fgprod-report-center">Gross Margin %</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => (
                  <tr key={row.id}>
                    <td className="fgprod-bold" title={row.fg_item_name} style={{ color: 'var(--fgprod-text)' }}>{row.fg_item_name}</td>
                    <td>{row.department_name || '-'}</td>
                    <td className="fgprod-report-center">{parseFloat(row.recipe_output_quantity || 0).toFixed(0)}</td>
                    <td className="fgprod-report-center" style={{ fontWeight: 500 }}>{row.rm_recipes_count}</td>
                    <td className="fgprod-report-currency fgprod-bold" style={{ color: 'var(--fgprod-primary)' }}>
                      Rs. {parseFloat(row.rm_cost).toFixed(2)}
                    </td>
                    <td className="fgprod-report-currency fgprod-bold" style={{ color: 'var(--fgprod-primary)' }}>
                      {row.rmCostPerPiece !== null
                        ? `Rs. ${row.rmCostPerPiece.toFixed(2)}`
                        : 'N/A'}
                    </td>
                    <td className="fgprod-report-currency fgprod-bold" style={{ color: 'var(--fgprod-primary)' }}>
                      {row.productionCostPerPiece !== null
                        ? `Rs. ${row.productionCostPerPiece.toFixed(2)}`
                        : 'N/A'}
                    </td>
                    <td className="fgprod-report-currency fgprod-bold" style={{ color: 'var(--fgprod-primary)' }}>
                      {row.selling_price !== null && row.selling_price !== undefined
                        ? `Rs. ${parseFloat(row.selling_price).toFixed(2)}`
                        : 'N/A'}
                    </td>
                    <td
                      className="fgprod-report-currency fgprod-bold"
                      style={{ color: row.grossProfitPerPiece === null ? 'inherit' : (row.grossProfitPerPiece >= 0 ? '#1a9c4b' : '#d32f2f') }}
                    >
                      {row.grossProfitPerPiece !== null
                        ? `Rs. ${row.grossProfitPerPiece.toFixed(2)}`
                        : 'N/A'}
                    </td>
                    <td
                      className="fgprod-report-center fgprod-bold"
                      style={{ color: row.grossMarginPct === null ? 'inherit' : (row.grossMarginPct >= 0 ? '#1a9c4b' : '#d32f2f') }}
                    >
                      {row.grossMarginPct !== null
                        ? `${row.grossMarginPct.toFixed(1)}%`
                        : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredRows.length > 0 && (
          <div className="fgprod-count">
            Showing {filteredRows.length} of {rows.length} FG Production item(s)
            {search && ` for "${search}"`}
          </div>
        )}
      </div>
    </div>
  );
};

export default FGRecipesReports;