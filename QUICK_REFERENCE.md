# Purchase Form CSS Quick Reference

## Quick Start

### Main Container
```jsx
<div className="purchase-container">
  {/* All purchase form content goes here */}
</div>
```

---

## Form Structure Template

```jsx
<div className="purchase-container">
  {/* Header with Back Button */}
  <div className="header-with-actions">
    <h2>Edit Purchase</h2>
    <button type="button" className="btn-secondary" onClick={handleBack}>
      ← Back
    </button>
  </div>

  <form onSubmit={handleSubmit}>
    {/* Section 1: Basic Info - 3 Columns */}
    <div className="form-section">
      <h3>Basic Information</h3>
      <div className="form-row">
        <div className="form-group">
          <label>Purchase Date <span className="required">*</span></label>
          <input type="date" required />
        </div>
        <div className="form-group">
          <label>Supplier <span className="required">*</span></label>
          <select required>
            <option value="">Select supplier…</option>
          </select>
        </div>
        <div className="form-group">
          <label>VAT Number</label>
          <input type="text" readOnly className="vat-display" />
        </div>
      </div>
    </div>

    {/* Section 2: Full Width */}
    <div className="form-section">
      <h3>Remarks</h3>
      <div className="form-row full">
        <div className="form-group">
          <label>Remarks</label>
          <textarea placeholder="Additional notes…" rows="3"></textarea>
        </div>
      </div>
    </div>

    {/* Section 3: Items Table */}
    <div className="form-section">
      <h3>Purchased Items</h3>
      <div className="items-table-wrapper">
        <table className="items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Prev. Price</th>
              <th>Quantity</th>
              <th>Unit</th>
              <th>Unit Price</th>
              <th>Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {/* Rows here */}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn-add-item">+ Add item</button>
    </div>

    {/* Section 4: Calculations */}
    <div className="form-section">
      <h3>VAT Calculation</h3>
      <div className="vat-calculation-section">
        <div className="calculation-row">
          <span className="label">Subtotal (excl. VAT)</span>
          <span className="value">Rs. 1000.00</span>
        </div>
        <div className="calculation-row total-row">
          <span className="label">Total (incl. VAT)</span>
          <span className="value">Rs. 1180.00</span>
        </div>
      </div>
    </div>

    {/* Section 5: Payment */}
    <div className="form-section">
      <h3>Payment</h3>
      <div className="form-row">
        <div className="form-group">
          <label>Paid Amount <span className="required">*</span></label>
          <input type="number" required />
        </div>
      </div>
    </div>

    {/* Summary Card */}
    <div className="summary-section">
      <div className="summary-card">
        <div className="summary-row">
          <span>Subtotal</span>
          <span>Rs. 1000.00</span>
        </div>
        <div className="summary-row total">
          <span>Total Bill</span>
          <span>Rs. 1180.00</span>
        </div>
        <div className="summary-row balance">
          <span>Balance / Due</span>
          <span className={dueAmount > 0 ? 'due-amount' : ''}>
            Rs. {dueAmount.toFixed(2)}
          </span>
        </div>
      </div>
    </div>

    {/* Action Buttons */}
    <div className="form-actions">
      <button type="button" className="btn-secondary" onClick={handleCancel}>
        Cancel
      </button>
      <button type="submit" className="btn-primary" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save Purchase'}
      </button>
    </div>
  </form>
</div>
```

---

## CSS Classes Reference

### Container Classes
| Class | Purpose | Width |
|-------|---------|-------|
| `.purchase-container` | Main wrapper | Max 1400px |
| `.form-section` | Card container | Full width |
| `.form-row` | Form fields row | Auto-fit grid |
| `.form-row.full` | Full-width row | 1 column |

### Input Classes
| Class | Element | Purpose |
|-------|---------|---------|
| `.form-group` | wrapper | Field container |
| `.form-group label` | label | Field label |
| `.form-group input` | input | Text/number input |
| `.form-group select` | select | Dropdown select |
| `.form-group textarea` | textarea | Multi-line text |
| `.vat-display` | input | Read-only VAT field |
| `.required` | span | Required indicator (red) |

### Table Classes
| Class | Purpose |
|-------|---------|
| `.items-table-wrapper` | Table container |
| `.items-table` | Main table |
| `.items-table thead` | Sticky header |
| `.items-table th` | Header cells |
| `.items-table td` | Data cells |
| `.item-select` | Item dropdown |
| `.quantity-input` | Quantity field |
| `.price-input` | Price field |
| `.unit-display` | Unit field (read-only) |
| `.previous-price` | Previous price cell |
| `.item-total` | Total calculation cell |
| `.btn-remove` | Remove row button |

### Calculation Classes
| Class | Purpose |
|-------|---------|
| `.vat-calculation-section` | VAT display card |
| `.calculation-row` | Calculation row |
| `.calculation-row.total-row` | Total row (bold) |
| `.calculation-row .label` | Label text |
| `.calculation-row .value` | Value text (monospace) |

### Summary Classes
| Class | Purpose |
|-------|---------|
| `.summary-section` | Summary wrapper |
| `.summary-card` | Summary card |
| `.summary-row` | Summary row |
| `.summary-row.total` | Total row (bold, blue) |
| `.summary-row.paid` | Paid amount row |
| `.summary-row.balance` | Balance row |
| `.due-amount` | Due amount (red) |

### Button Classes
| Class | Usage | Appearance |
|-------|-------|------------|
| `.btn-primary` | Submit/Save | Blue gradient |
| `.btn-secondary` | Cancel/Back | White with border |
| `.btn-add-item` | Add row | Blue border |
| `.btn-remove` | Delete row | Light red |

### Utility Classes
| Class | Purpose |
|-------|---------|
| `.required` | Red asterisk |
| `.full-width` | Full-width element |
| `.loading-container` | Loading state |
| `.loading-spinner` | Spinner animation |

---

## Responsive Breakpoints

```css
/* Small Mobile */
@media (max-width: 480px) { }

/* Mobile */
@media (max-width: 768px) { }

/* Tablet */
@media (max-width: 1024px) { }

/* Desktop onwards */
@media (min-width: 1441px) { }
```

---

## Color Quick Reference

```css
--primary-color: #3b82f6      /* Blue */
--primary-dark: #2563eb       /* Dark Blue */
--danger-color: #ef4444       /* Red */
--success-color: #10b981      /* Green */
--warning-color: #f97316      /* Orange */

--bg-primary: #ffffff         /* White */
--bg-secondary: #f8fafc       /* Very Light Gray */
--bg-tertiary: #f1f5f9        /* Light Gray */

--text-primary: #0f172a       /* Near Black */
--text-secondary: #475569     /* Dark Gray */
--text-tertiary: #64748b      /* Medium Gray */

--border-color: #cbd5e1       /* Border Gray */
--border-light: #e2e8f0       /* Light Border */
```

---

## Common Patterns

### Loading State
```jsx
{loading ? (
  <div className="loading-container">
    <div className="loading-spinner"></div>
    <p>Loading…</p>
  </div>
) : (
  // Form content
)}
```

### Table Row with Remove Button
```jsx
<tr>
  <td>
    <Select options={options} value={selected} onChange={handleChange} />
  </td>
  <td className="previous-price">Rs. 50.00</td>
  <td>
    <input className="quantity-input" type="number" value={quantity} />
  </td>
  <td>
    <input className="unit-display" type="text" value={unit} readOnly />
  </td>
  <td>
    <input className="price-input" type="number" value={price} />
  </td>
  <td className="item-total">Rs. 500.00</td>
  <td>
    <button className="btn-remove" onClick={handleRemove}>×</button>
  </td>
</tr>
```

### Summary Display
```jsx
<div className="summary-section">
  <div className="summary-card">
    <div className="summary-row">
      <span>Subtotal</span>
      <span>Rs. 1000.00</span>
    </div>
    <div className="summary-row total">
      <span>Total Bill</span>
      <span>Rs. 1180.00</span>
    </div>
    <div className="summary-row balance">
      <span>Balance / Due</span>
      <span className={dueAmount > 0 ? 'due-amount' : ''}>
        Rs. {dueAmount.toFixed(2)}
      </span>
    </div>
  </div>
</div>
```

### Form Actions
```jsx
<div className="form-actions">
  <button type="button" className="btn-secondary" onClick={handleCancel}>
    Cancel
  </button>
  <button type="submit" className="btn-primary" disabled={isSubmitting}>
    {isSubmitting ? 'Saving…' : 'Save Purchase'}
  </button>
</div>
```

---

## Typography Scale

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| h2 | 1.875rem | 700 | Primary |
| h3 | 1.125rem | 600 | Secondary |
| label | 0.8125rem | 600 | Secondary |
| input | 0.95rem | 400 | Primary |
| .required | 0.95rem | 400 | Danger |

---

## Spacing Standards

### Padding
- Container: 1.5rem (desktop), 1rem (mobile)
- Section: 1.75rem (desktop), 1.25rem (mobile)
- Cells: 1rem (desktop), 0.75rem (mobile)

### Gap/Margin
- Between sections: 1.5rem
- Form row gap: 1.5rem (desktop), 1rem (mobile)
- Button gap: 1rem

---

## Border & Shadow

```css
Border:    1px solid var(--border-light)
Radius-sm: 6px
Radius-md: 8px
Radius-lg: 12px

Shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05)
Shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1)

Transition: all 0.2s ease
Focus-box: 0 0 0 3px rgba(59, 130, 246, 0.1)
```

---

## Mobile Optimization

### Columns Hidden on Mobile
- Column 2: Previous Price
- Column 5: Unit Price

### Table Optimization
- Font size: 0.8rem
- Padding: 0.625rem 0.5rem
- Single data per row on small mobile

### Layout Changes
- Form-row: 1 column (from auto-fit)
- Buttons: Full-width, stacked
- Spacing: Reduced by ~25%

---

## Performance Considerations

1. **CSS Variables** - Easy theming updates without multiple selects
2. **Grid Layout** - More efficient than flex for complex layouts
3. **Sticky Headers** - Better UX for long tables
4. **Minimal Animations** - 0.2s transitions for smooth feel
5. **Print Media** - Hidden interactive elements

---

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile Safari (iOS 14+)
- Chrome Mobile (Latest)

**Features Used:**
- ✅ CSS Grid
- ✅ CSS Custom Properties
- ✅ CSS Gradients
- ✅ Media Queries
- ✅ Focus-visible
- ✅ Sticky positioning

---

## Common Modifications

### Change Primary Color
```css
:root {
  --primary-color: #your-color;
  --primary-dark: #your-darker-color;
}
```

### Adjust Spacing
```css
.form-row {
  gap: 2rem; /* Increase gap */
}
```

### Modify Maximum Width
```css
.purchase-container {
  max-width: 1200px; /* Narrower */
}
```

### Change Header Size
```css
.purchase-container h2 {
  font-size: 2rem; /* Larger */
}
```

---

## Troubleshooting

### Table Overflow on Mobile
Check that `.items-table-wrapper` has `overflow-x: auto`
```css
.items-table-wrapper {
  overflow-x: auto;
}
```

### Buttons Not Full-Width on Mobile
Ensure form-actions uses `flex-direction: column-reverse`:
```css
.form-actions {
  flex-direction: column-reverse;
  gap: 0.75rem;
}
```

### Focus Outline Not Visible
Add to button/input:
```css
button:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
```

### React-Select Styling Not Applied
Make sure selector specificity is higher:
```css
.react-select__control {
  border-color: var(--border-color) !important;
}
```

---

## File Information

**File:** `client/src/components/purchase/Purchase.css`
**Size:** 875 lines
**Last Updated:** 2026-03-03
**Components Using:** EditPurchase.jsx, NewPurchase.jsx

---

## Additional Resources

- See `PURCHASE_FORM_CSS_UPDATE.md` for detailed documentation
- See `RESPONSIVE_DESIGN_GUIDE.md` for visual layout guide
- Check EditPurchase.jsx for implementation example

