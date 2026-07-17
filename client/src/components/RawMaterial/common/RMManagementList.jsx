import React, { useState, useEffect, useMemo } from 'react';
import { FiSearch } from 'react-icons/fi';
import api from '../../../api';
import { usePopup } from '../../context/PopupContext';
import AddSimpleNameForm from './AddSimpleNameForm';
import './ManagementList.css';

/**
 * Generic searchable list + "Add" modal page used by the Raw Material
 * management screens (RM Type, Department, Companies). Fetches records
 * from the given API path, renders them in a responsive/searchable table,
 * and lets the user add new records without a full page refresh.
 *
 * Props:
 *  - pageTitle: heading shown at the top, e.g. "RM Type"
 *  - subtitle: optional short description under the heading
 *  - apiPath: REST resource path relative to the API base, e.g. "/item-types"
 *  - nameField: the property on each record to display/search, e.g. "type_name"
 *  - nameColumnLabel: table column header for the name field, e.g. "RM Type Name"
 *  - createPayloadKey: key expected by the POST endpoint, e.g. "type_name"
 *  - addButtonLabel: text on the "Add" button
 *  - formTitle / formFieldLabel / formPlaceholder / formSubmitLabel / formNote:
 *      passed through to AddSimpleNameForm
 *  - searchPlaceholder: placeholder for the search input
 *  - emptyMessage: message shown when there is no data
 */
const RMManagementList = ({
  pageTitle,
  subtitle,
  apiPath,
  nameField,
  nameColumnLabel,
  createPayloadKey,
  addButtonLabel,
  formTitle,
  formFieldLabel,
  formPlaceholder,
  formSubmitLabel,
  formNote,
  searchPlaceholder,
  emptyMessage
}) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { showPopup } = usePopup();

  useEffect(() => {
    fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiPath]);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      const response = await api.get(apiPath);
      setRecords(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error(`Error fetching ${pageTitle}:`, err);
      showPopup('error', `Failed to load ${pageTitle}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (value) => {
    try {
      const response = await api.post(apiPath, { [createPayloadKey]: value });
      showPopup('success', response.data?.message || `${pageTitle} added successfully`);
      setShowAddForm(false);
      // Refresh automatically to display the newly added record
      await fetchRecords();
    } catch (err) {
      showPopup('error', err.response?.data?.error || `Failed to add ${pageTitle}`);
      // keep the modal open so the user can correct and retry
      throw err;
    }
  };

  const filteredRecords = useMemo(() => {
    if (!searchTerm.trim()) return records;
    const term = searchTerm.trim().toLowerCase();
    return records.filter((rec) =>
      String(rec[nameField] || '').toLowerCase().includes(term)
    );
  }, [records, searchTerm, nameField]);

  return (
    <div className="rm-mgmt-container">
      <div className="rm-mgmt-header">
        <div className="rm-mgmt-header-top">
          <div>
            <h2>{pageTitle}</h2>
            {subtitle && <p className="rm-mgmt-subtitle">{subtitle}</p>}
          </div>
          <button className="btn-add-rm" onClick={() => setShowAddForm(true)}>
            + {addButtonLabel}
          </button>
        </div>

        <div className="rm-mgmt-search">
          <FiSearch />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {showAddForm && (
        <AddSimpleNameForm
          title={formTitle}
          fieldLabel={formFieldLabel}
          placeholder={formPlaceholder}
          submitLabel={formSubmitLabel}
          note={formNote}
          onSubmit={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      <div className="rm-mgmt-table-container">
        {loading ? (
          <div className="rm-mgmt-loading">Loading {pageTitle}...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="rm-mgmt-no-data">
            <p>
              {records.length === 0
                ? emptyMessage
                : `No results found for "${searchTerm}".`}
            </p>
          </div>
        ) : (
          <table className="rm-mgmt-table">
            <thead>
              <tr>
                <th>{nameColumnLabel}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((rec) => (
                <tr key={rec.id}>
                  <td className="rm-name-cell">{rec[nameField]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && records.length > 0 && (
        <p className="rm-count-badge">
          Showing {filteredRecords.length} of {records.length} record{records.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
};

export default RMManagementList;