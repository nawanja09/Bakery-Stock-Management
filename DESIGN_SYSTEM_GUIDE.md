# Bakery Stock Management System - UI/UX Redesign Implementation Guide

## Overview

A comprehensive global design system has been created to standardize the entire application UI/UX across all pages. This document provides guidance for applying the design system to existing pages.

## Design System Structure

### CSS Files Created

Location: `src/css/design-system/`

1. **variables.css** - Global CSS variables for colors, spacing, typography, shadows, and layout dimensions
2. **reset.css** - Base HTML element resets and normalization
3. **typography.css** - Heading, body text, and label styles
4. **layout.css** - Container, grid, flexbox, and spacing utilities
5. **sidebar.css** - Navigation sidebar component styles
6. **forms.css** - Form, input, select, checkbox, textarea, and file input styles
7. **buttons.css** - Button variants (primary, secondary, success, danger, etc.) and sizes
8. **tables.css** - Data table, header, body, responsive table styles
9. **badges.css** - Status badge and indicator styles
10. **modals.css** - Modal, dialog, and overlay component styles
11. **cards-pagination.css** - Card layouts, summary cards, and pagination components
12. **responsive.css** - Responsive breakpoints and device-specific styles
13. **index.css** - Master index that imports all design system files

### CSS Variables Available

**Colors:**
- Primary: `--primary`, `--primary-dark`, `--primary-light`
- Neutrals: `--neutral-50` through `--neutral-900`
- Semantic: `--success`, `--warning`, `--danger`, `--info`
- Backgrounds: `--bg-main`, `--bg-card`, `--bg-sidebar`, `--bg-hover`
- Text: `--text-primary`, `--text-secondary`, `--text-muted`, `--text-inverse`

**Spacing:**
- `--spacing-1` (4px) through `--spacing-20` (80px)
- Standard: 4px, 8px, 12px, 16px, 20px, 24px, 32px, etc.

**Dimensions:**
- `--sidebar-width`: 272px
- `--sidebar-width-collapsed`: 80px
- `--header-height`: 64px
- `--input-height`: 40px
- `--btn-height`: 40px

**Borders & Shadows:**
- Radius: `--radius-sm` through `--radius-full`
- Shadows: `--shadow-xs` through `--shadow-xl`

## Component Classes

### Button Classes

```html
<!-- Primary button -->
<button class="btn btn-primary">Action</button>

<!-- Secondary button -->
<button class="btn btn-secondary">Cancel</button>

<!-- Success button -->
<button class="btn btn-success">Save</button>

<!-- Danger button -->
<button class="btn btn-danger">Delete</button>

<!-- Outline button -->
<button class="btn btn-outline">Edit</button>

<!-- Sizes -->
<button class="btn btn-sm">Small</button>
<button class="btn btn-lg">Large</button>

<!-- Icon button -->
<button class="btn btn-icon btn-primary">✓</button>

<!-- Block width -->
<button class="btn btn-primary btn-block">Full Width</button>
```

### Form Classes

```html
<!-- Form group -->
<div class="form-group">
  <label class="form-label label-required">Field Name</label>
  <input class="form-control" type="text" placeholder="Enter value">
  <span class="form-hint">Helper text here</span>
</div>

<!-- Two-column form -->
<div class="form-row">
  <div class="form-col">
    <div class="form-group">...</div>
  </div>
  <div class="form-col">
    <div class="form-group">...</div>
  </div>
</div>

<!-- Form actions -->
<div class="form-actions">
  <button class="btn btn-primary">Save</button>
  <button class="btn btn-secondary">Cancel</button>
</div>

<!-- Input states -->
<input class="form-control form-control-success">
<input class="form-control form-control-error">
<input class="form-control form-control-warning">
```

### Card Classes

```html
<!-- Basic card -->
<div class="card">
  <div class="card-header">
    <h2 class="card-header-title">Card Title</h2>
  </div>
  <div class="card-body">
    Content here...
  </div>
  <div class="card-footer">
    <button class="btn btn-primary">Action</button>
  </div>
</div>

<!-- Summary/KPI card -->
<div class="summary-card">
  <div class="summary-card-icon">📊</div>
  <div class="summary-card-label">Total Revenue</div>
  <div class="summary-card-value">$45,000</div>
  <div class="summary-card-change positive">+12% from last month</div>
</div>

<!-- Card variants with left border -->
<div class="card card-success">...</div>
<div class="card card-warning">...</div>
<div class="card card-danger">...</div>
```

### Table Classes

```html
<!-- Responsive table wrapper -->
<div class="table-wrapper">
  <table class="table table-striped">
    <thead>
      <tr>
        <th>Name</th>
        <th class="text-right">Amount</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Item 1</td>
        <td class="text-right currency">$1,000</td>
        <td class="table-actions">
          <button class="table-action-btn">Edit</button>
          <button class="table-action-btn danger">Delete</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>

<!-- Empty state -->
<div class="table-empty">
  <div class="table-empty-icon">📭</div>
  <div class="table-empty-message">No records found</div>
</div>
```

### Badge Classes

```html
<!-- Status badges -->
<span class="badge badge-success">Active</span>
<span class="badge badge-danger">Inactive</span>
<span class="badge badge-warning">Pending</span>

<!-- Solid badges -->
<span class="badge badge-success-solid">Completed</span>
<span class="badge badge-danger-solid">Failed</span>

<!-- Icon badge -->
<span class="badge-icon">5</span>

<!-- Dot badge -->
<span class="badge-dot success"></span> Active
```

### Modal Classes

```html
<!-- Modal overlay -->
<div class="modal-overlay show">
  <!-- Modal container -->
  <div class="modal modal-md">
    <div class="modal-header">
      <h2 class="modal-title">Dialog Title</h2>
      <button class="modal-close-btn">&times;</button>
    </div>
    
    <div class="modal-body">
      Content here...
    </div>
    
    <div class="modal-footer">
      <button class="btn btn-secondary">Cancel</button>
      <button class="btn btn-primary">Save</button>
    </div>
  </div>
</div>

<!-- Confirm dialog -->
<div class="confirm-dialog modal">
  <div class="modal-body">
    <div class="confirm-icon danger">⚠️</div>
    <div class="confirm-message">Are you sure?</div>
    <div class="confirm-description">This action cannot be undone.</div>
  </div>
  <div class="modal-footer">
    <button class="btn btn-secondary">Cancel</button>
    <button class="btn btn-danger">Delete</button>
  </div>
</div>
```

### Pagination Classes

```html
<!-- Pagination -->
<div class="pagination">
  <button class="pagination-item" disabled>&laquo;</button>
  <button class="pagination-item active">1</button>
  <button class="pagination-item">2</button>
  <button class="pagination-item">3</button>
  <button class="pagination-item">&raquo;</button>
</div>

<!-- Pagination with info -->
<div class="pagination-info">
  <span class="pagination-showing">Showing 1 to 10 of 45 results</span>
  <div class="pagination">
    ...
  </div>
  <div class="pagination-selector">
    <label>Show</label>
    <select>
      <option>10</option>
      <option>25</option>
      <option>50</option>
    </select>
    <span>entries</span>
  </div>
</div>
```

### Utility Classes

```html
<!-- Spacing -->
<div class="mt-4">Margin top</div>
<div class="mb-6">Margin bottom</div>
<div class="p-8">Padding</div>

<!-- Flexbox -->
<div class="flex-between">...</div>
<div class="flex-center">...</div>
<div class="gap-4">Flex with gap</div>

<!-- Grid -->
<div class="grid grid-2">Two columns</div>
<div class="grid grid-3">Three columns</div>
<div class="grid grid-auto">Auto-fit columns</div>

<!-- Typography -->
<p class="text-body">Body text</p>
<p class="text-secondary">Secondary text</p>
<p class="text-muted">Muted text</p>
<p class="heading-3">Heading 3</p>
```

## Updating Existing Pages

### Step-by-Step Process

1. **Identify the page component file** (e.g., `Dashboard.jsx`, `NewExpenses.jsx`)

2. **Update the component structure:**
   ```jsx
   import './YourPage.css';
   
   export const YourPage = () => {
     return (
       <div className="page-content">
         {/* Page header with breadcrumb */}
         <div className="page-header">
           <h1 className="page-title">Page Title</h1>
           <div className="page-breadcrumb">
             <a href="/">Home</a>
             <span className="breadcrumb-separator">›</span>
             <span>Current Page</span>
           </div>
         </div>
         
         {/* Page body */}
         <div className="container">
           {/* Content cards */}
           <div className="card">
             <div className="card-header">
               <h2 className="card-header-title">Section Title</h2>
             </div>
             <div className="card-body">
               {/* Content */}
             </div>
           </div>
         </div>
       </div>
     );
   };
   ```

3. **Update component-specific CSS:**
   - Replace hardcoded colors with `var(--primary)`, `var(--text-primary)`, etc.
   - Use spacing variables: `var(--spacing-4)`, `var(--spacing-6)`, etc.
   - Remove duplicate styles that are now in the design system
   - Use the provided component classes instead of inline styles

4. **Apply responsive classes:**
   - Use `@media (max-width: 768px)` breakpoints
   - Apply `flex-col-mobile`, `hide-mobile`, `show-mobile` classes
   - Test on mobile, tablet, and desktop

5. **Update forms:**
   - Wrap form controls with `form-group`
   - Use `form-control` class on inputs
   - Apply `form-label label-required` to labels with required fields
   - Use `form-row` or `form-groups-2` for multi-column layouts

6. **Update tables:**
   - Wrap tables with `table-wrapper`
   - Apply `table table-striped` classes
   - Use `text-right` or `currency` classes for numeric columns
   - Add `table-actions` for action buttons

7. **Update buttons:**
   - Use `btn btn-primary`, `btn btn-secondary`, etc.
   - Use `btn-sm`, `btn-lg` for sizes
   - Use `btn-icon` for icon-only buttons
   - Use `btn-block` for full-width buttons

8. **Add status badges:**
   - Replace colored divs with `badge badge-success`, `badge badge-warning`, etc.
   - Use solid variants with `-solid` suffix for stronger emphasis

## Color Reference

The design system uses a warm orange/brown color palette suitable for a bakery system:

- **Primary**: #B96B1F (warm orange)
- **Primary Dark**: #9A5519
- **Primary Light**: #D47F30
- **Success**: #22C55E (green)
- **Warning**: #F59E0B (amber)
- **Danger**: #EF4444 (red)
- **Info**: #3B82F6 (blue)

## Responsive Breakpoints

The design system follows these breakpoints:

- **Mobile**: 0 - 767px
- **Tablet**: 768px - 991px
- **Desktop**: 992px - 1199px
- **Large Desktop**: 1200px+

All components automatically adapt to these breakpoints.

## Migration Checklist

For each page component:

- [ ] Import the updated CSS file
- [ ] Update HTML structure to use semantic classes
- [ ] Replace inline styles with CSS variables
- [ ] Apply form component classes
- [ ] Apply button component classes
- [ ] Apply table component classes
- [ ] Update modals with modal classes
- [ ] Add breadcrumb/page header
- [ ] Test on mobile devices
- [ ] Verify functionality is preserved
- [ ] Check for any console errors

## Files Already Updated

1. ✅ `src/css/design-system/` - Complete design system created
2. ✅ `src/index.css` - Updated to import design system
3. ✅ `src/components/Layout.css` - Updated to use design system variables

## Files Requiring Updates

**High Priority (User-facing pages):**
- Dashboard.jsx & Dashboard.css
- NewExpenses.jsx & Expenses.css
- NewPurchase.jsx & NewPurchase.css
- All Report pages (ExpensesReport, PurchasingReport, etc.)
- FinishedGoodsManagement & related pages
- RawMaterial management pages

**Medium Priority (Data management):**
- Suppliers.jsx
- ManageUsers.jsx
- CostCalculator pages
- Finance pages (BankTransfer, FundTransfer, etc.)
- Cutlery pages (Assets, Purchases, Damages, etc.)

**Lower Priority (Settings & Admin):**
- Settings/Admin pages
- Setup pages
- Configuration pages

## Testing Checklist

After updating a page:

1. **Visual Testing**
   - [ ] Desktop view (1920px, 1440px)
   - [ ] Tablet view (768px, 1024px)
   - [ ] Mobile view (375px, 480px)
   - [ ] Dark mode (if applicable)

2. **Functional Testing**
   - [ ] Form submissions work
   - [ ] Buttons trigger correct actions
   - [ ] Tables display correctly
   - [ ] Modals open/close properly
   - [ ] Pagination works
   - [ ] Filters and search work

3. **Browser Testing**
   - [ ] Chrome/Chromium
   - [ ] Firefox
   - [ ] Safari
   - [ ] Edge

4. **Performance**
   - [ ] Page loads quickly
   - [ ] No layout shifts
   - [ ] Smooth animations
   - [ ] No console errors

## Additional Resources

### CSS Variable Reference

All variables are defined in `src/css/design-system/variables.css` and can be used in any component CSS:

```css
.my-component {
  color: var(--text-primary);
  background-color: var(--bg-card);
  padding: var(--spacing-6);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  font-size: var(--text-base);
  font-weight: var(--font-medium);
  transition: all var(--transition-fast);
}
```

### Responsive Media Queries

Use these standard breakpoints:

```css
/* Desktop (1200px+) */
/* Default - write desktop-first styles here */

/* Tablet (768px - 991px) */
@media (max-width: 991px) {
  /* Tablet adjustments */
}

/* Mobile (767px and below) */
@media (max-width: 767px) {
  /* Mobile adjustments */
}
```

## Questions & Troubleshooting

### CSS Variables Not Working?
- Ensure `index.css` imports `design-system/index.css`
- Check that the CSS file is properly linked in your component
- Verify variable names match exactly (case-sensitive)

### Styles Not Applying?
- Check CSS specificity - ensure no conflicting styles from old CSS
- Use browser DevTools to inspect element styles
- Check for typos in class names
- Clear browser cache and rebuild

### Responsive Not Working?
- Verify media queries are after the base styles
- Test with actual device or DevTools device emulation
- Check for conflicting responsive styles in old CSS files
- Ensure viewport meta tag is in HTML head

---

**Last Updated**: 2026-09-01
**Design System Version**: 1.0
**Maintainer**: UI/UX Development Team
