# Purchase Form - Responsive Design Visual Guide

## Layout Transformation Across Devices

### 1️⃣ SMALL MOBILE (≤ 480px)
```
┌──────────────────────────┐
│  Edit Purchase    ← Back │  ← Stacked button
├──────────────────────────┤
│ Basic Information        │
├──────────────────────────┤
│ Purchase Date  [input]   │
│ Supplier       [select]  │
│ VAT Number     [input]   │
├──────────────────────────┤
│ Payment Method [select]  │
│ Company        [select]  │
│ Invoice #      [input]   │
├──────────────────────────┤
│ Remarks        [textarea]│
├──────────────────────────┤
│ Purchased Items          │
├──────────────────────────┤
│ Items Table (1 col)      │ ← Hidden: Prev Price, Unit Price
├──────────────────────────┤
│ + Add item               │
├──────────────────────────┤
│ VAT Calculation          │
├──────────────────────────┤
│ Subtotal     Rs. 0.00    │
│ VAT Rate     18%         │
│ VAT Amount   Rs. 0.00    │
│ Total        Rs. 0.00    │
├──────────────────────────┤
│ Payment                  │
│ Paid Amount [input]      │
├──────────────────────────┤
│ Summary Card             │
├──────────────────────────┤
│ Subtotal     Rs. 0.00    │
│ VAT          Rs. 0.00    │
│ Total Bill   Rs. 0.00    │
│ Paid         Rs. 0.00    │
│ Balance      Rs. 0.00    │
├──────────────────────────┤
│     [Cancel] [Submit]    │ ← Full-width stacked
└──────────────────────────┘

Font Sizes:
  h2: 1.125rem (18px)
  h3: 0.95rem (15px)
  label: 0.7rem (11px)
  input: 0.85rem (14px)

Spacing:
  Padding: 0.75rem (all containers)
  Gap: 0.75rem (form rows)
```

---

### 2️⃣ MOBILE (481px - 768px)
```
┌────────────────────────────────────────┐
│  Edit Purchase         [← Back Button] │  ← Inline button
├────────────────────────────────────────┤
│ Basic Information                      │
├────────────────────────────────────────┤
│ Purchase Date  [input]                 │
│ Supplier       [select]                │
│ VAT Number     [input]                 │
├────────────────────────────────────────┤
│ Payment Method [select] Company [select]
│ Invoice #      [input]                 │
├────────────────────────────────────────┤
│ Remarks        [textarea full-width]   │
├────────────────────────────────────────┤
│ Purchased Items                        │
├────────────────────────────────────────┤
│ Items Table                            │
│ ┌────────────────────────────────────┐ │
│ │ Item | Qty | Unit | Total      | × │ │ ← Col 2,5 hidden
│ ├────────────────────────────────────┤ │
│ │ Flour | 10 | kg  | Rs. 500.00 | × │ │
│ └────────────────────────────────────┘ │
├────────────────────────────────────────┤
│ + Add item                             │
├────────────────────────────────────────┤
│ VAT Calculation                        │
│ Subtotal (excl. VAT)     Rs. 0.00     │
│ VAT Rate                 18%           │
│ VAT Amount               Rs. 0.00     │
│ ────────────────────────────────      │
│ Total (incl. VAT)        Rs. 0.00     │
├────────────────────────────────────────┤
│ Payment                                │
│ Paid Amount (Rs.)    [input]           │
├────────────────────────────────────────┤
│ Summary                                │
│ Subtotal             Rs. 0.00          │
│ VAT (18%)            Rs. 0.00          │
│ Total Bill           Rs. 0.00          │
│ Paid                 Rs. 0.00          │
│ Balance / Due        Rs. 0.00          │
├────────────────────────────────────────┤
│ [Cancel]                 [Submit]      │ ← Stacked at bottom
└────────────────────────────────────────┘

Font Sizes:
  h2: 1.325rem (21px)
  h3: 1rem (16px)
  label: 0.75rem (12px)
  input: 0.9rem (14px)

Spacing:
  Padding: 1.25rem (containers)
  Gap: 1rem (form rows)

Grid: 1 column (auto-fit deactivated)
```

---

### 3️⃣ TABLET (769px - 1024px)
```
╔════════════════════════════════════════════════════════════════╗
║  Edit Purchase                               [← Back Button]   ║
╠════════════════════════════════════════════════════════════════╣
║ Basic Information                                              ║
╠════════════════════════════════════════════════════════════════╣
║ Purchase Date       │ Supplier           │ VAT Number         ║
║ [input]             │ [select]           │ [display]          ║
├─────────────────────┼────────────────────┼────────────────────┤
║ Payment Method      │ Company            │ Invoice Number     ║
║ [select]            │ [select]           │ [input]            ║
├──────────────────────────────────────────────────────────────┤
║ Remarks            [textarea - full width]                   ║
╠════════════════════════════════════════════════════════════════╣
║ Purchased Items                                              ║
╠════════════════════════════════════════════════════════════════╣
║ Items Table (desktop view with all columns)                 ║
║ ┌──────────────────────────────────────────────────────────┐ ║
║ │ Item | Prev.Price | Qty | Unit | Unit Price | Total | × │ ║
║ ├──────────────────────────────────────────────────────────┤ ║
║ │ Flour │ Rs.50.00 │ 10 │ kg │ Rs.50.00 │ Rs.500 │ × │ ║
║ └──────────────────────────────────────────────────────────┘ ║
╠════════════════════════════════════════════════════════════════╣
║ VAT Calculation                                              ║
║ ┌──────────────────────────────┬──────────────────────────┐ ║
║ │ Subtotal (excl. VAT)         │ Rs. 0.00                 │ ║
║ │ VAT Rate                     │ 18%                      │ ║
║ │ VAT Amount                   │ Rs. 0.00                 │ ║
║ ├──────────────────────────────┼──────────────────────────┤ ║
║ │ Total (incl. VAT)            │ Rs. 0.00                 │ ║
║ └──────────────────────────────┴──────────────────────────┘ ║
╠════════════════════════════════════════════════════════════════╣
║                       [Cancel]         [Submit]               ║
╚════════════════════════════════════════════════════════════════╝

Font Sizes: Intermediate scaling
Grid: 2-3 columns auto-fit (minmax 200px)
All table columns visible
Buttons: Inline with gap
```

---

### 4️⃣ DESKTOP (1025px - 1440px)
```
╔═══════════════════════════════════════════════════════════════════════════╗
║  Edit Purchase                                        [← Back Button]     ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ Basic Information                                                         ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ Purchase Date       │ Supplier           │ VAT Number         │ [space] ║
║ [input]             │ [select]           │ [display]          │         ║
├─────────────────────┼────────────────────┼────────────────────┼─────────┤
║ Payment Method      │ Company            │ Invoice Number     │ [space] ║
║ [select]            │ [select]           │ [input]            │         ║
├────────────────────────────────────────────────────────────────────────┤
║ Remarks                       [textarea - full width]                   ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ Purchased Items                                                          ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ Complete Items Table with All Columns                                   ║
║ ┌──────────────────────────────────────────────────────────────────────┐ ║
║ │ Item(32%) │ Prev.P(11%) │ Qty(10%) │ Unit(8%) │ Price(12%) │ Total(12%) │
║ ├──────────────────────────────────────────────────────────────────────┤ ║
║ │ Flour     │ Rs. 50.00  │ 10.000  │ kg      │ Rs. 50.00  │ Rs. 500.00 │
║ │ Sugar     │ Rs. 75.00  │ 5.000   │ kg      │ Rs. 75.00  │ Rs. 375.00 │
║ └──────────────────────────────────────────────────────────────────────┘ ║
║                                              [+ Add item]               ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ VAT Calculation                                                          ║
║ ┌────────────────────────────────────────────────────────────────────────┐
║ │ Subtotal (excl. VAT)      Rs. 875.00                                   │
║ │ VAT Rate                  18%                                          │
║ │ VAT Amount                Rs. 157.50                                   │
║ │ ─────────────────────────────────────────────────────────────────────│
║ │ Total (incl. VAT)         Rs. 1,032.50                               │
║ └────────────────────────────────────────────────────────────────────────┘
╠═══════════════════════════════════════════════════════════════════════════╣
║ Payment                                                                  ║
║ Paid Amount (Rs.)    [input with good width]                           ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ Summary Card                                                            ║
║ ┌────────────────────────────────────────────────────────────────────────┐
║ │ Subtotal                  Rs. 875.00                                   │
║ │ VAT (18%)                 Rs. 157.50                                   │
║ │ ────────────────────────────────────────────────────────────────────→ │
║ │ Total Bill                Rs. 1,032.50  (bold, large)                │
║ │ Paid                      Rs. 1,000.00                               │
║ │ Balance / Due             Rs. 32.50 (highlighted if > 0)            │
║ └────────────────────────────────────────────────────────────────────────┘
╠═══════════════════════════════════════════════════════════════════════════╣
║                                   [Cancel]              [Submit]        ║
╚═══════════════════════════════════════════════════════════════════════════╝

Grid: 3-4 columns auto-fit (minmax 250px)
All columns visible
Generous spacing
Maximum readability
```

---

### 5️⃣ LARGE DESKTOP (1441px+)
```
╔═════════════════════════════════════════════════════════════════════════════╗
║  Edit Purchase                                          [← Back Button]     ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ Basic Information                                                           ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ Purchase Date  │ Supplier     │ VAT Number   │ [space]                    ║
║ [input]        │ [select]     │ [display]    │                            ║
├────────────────┼──────────────┼──────────────┼────────────────────────────┤
║ Payment Method │ Company      │ Invoice #    │ [spare column for balance] ║
║ [select]       │ [select]     │ [input]      │                            ║
├────────────────────────────────────────────────────────────────────────────┤
║ Remarks                       [textarea spanning 2+ columns]             ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ Purchased Items                                                           ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ Optimized Table with Perfect Column Distribution                         ║
║ ┌─────────────────────────────────────────────────────────────────────────┐
║ │ Item(28%) │ Prev.P(10%) │ Qty(9%) │ Unit(7%) │ Price(13%) │ Total(13%)│
║ ├─────────────────────────────────────────────────────────────────────────┤
║ │ All Flour │ Rs. 50.00  │ 10.000 │ kg      │ Rs. 50.00  │ Rs.500.00 │
║ │ Sugar     │ Rs. 75.00  │ 5.000  │ kg      │ Rs. 75.00  │ Rs.375.00 │
║ │ Butter    │ Rs. 250.00 │ 2.000  │ kg      │ Rs.250.00  │ Rs.500.00 │
║ │ Eggs      │ Rs. 8.00   │ 24.000 │ piece   │ Rs. 8.00   │ Rs.192.00 │
║ └─────────────────────────────────────────────────────────────────────────┘
║                                                    [+ Add item]           ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ VAT Calculation                                                           ║
║ ┌──────────────────────────────────────────────────────────────────────────┐
║ │ Subtotal (excl. VAT)      Rs. 1,567.00                                  │
║ │ VAT Rate                  18%                                           │
║ │ VAT Amount                Rs. 282.06                                    │
║ │ ──────────────────────────────────────────────────────────────────────  │
║ │ Total (incl. VAT)         Rs. 1,849.06                                 │
║ └──────────────────────────────────────────────────────────────────────────┘
╠═════════════════════════════════════════════════════════════════════════════╣
║ Payment                                                                   ║
║ Paid Amount (Rs.)    [input field with large width]                     ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ Summary Card (Maximum clarity and spacing)                               ║
║ ┌──────────────────────────────────────────────────────────────────────────┐
║ │ Subtotal                           Rs. 1,567.00                         │
║ │ VAT (18%)                          Rs. 282.06                           │
║ │ ────────────────────────────────────────────────────────────────────    │
║ │ Total Bill                         Rs. 1,849.06  (XL bold)            │
║ │ Paid                               Rs. 1,800.00                        │
║ │ Balance / Due                      Rs. 49.06 (Warning color if > 0)   │
║ └──────────────────────────────────────────────────────────────────────────┘
╠═════════════════════════════════════════════════════════════════════════════╣
║                                              [Cancel]  [Submit]           ║
╚═════════════════════════════════════════════════════════════════════════════╝

Grid: 4+ columns auto-fit (minmax 250px)
Maximum 1400px width maintained
Optimal reading width and spacing
High visual hierarchy
```

---

## Color Scheme Reference

### Primary Actions
```
Button BG:     #3b82f6 (Blue)
Button Hover:  #2563eb (Darker Blue)
Button Text:   #ffffff (White)
```

### Form States
```
Focus Border:  #3b82f6 (Blue)
Focus Shadow:  0 0 0 3px rgba(59, 130, 246, 0.1)
Disabled BG:   #f1f5f9 (Light Gray)
```

### Backgrounds
```
Primary (Cards):   #ffffff (White)
Secondary (Page):  #f8fafc (Very Light Gray)
Tertiary (Headers):#f1f5f9 (Light Gray)
```

### Text
```
Primary:   #0f172a (Near Black)
Secondary: #475569 (Dark Gray)
Tertiary:  #64748b (Medium Gray)
```

### Status Colors
```
Success:   #10b981 (Green)
Danger:    #ef4444 (Red)
Warning:   #f97316 (Orange)
```

---

## Interactive States

### Buttons
- **Default:** Full color with shadow
- **Hover:** Darker color, slight elevation
- **Active/Pressed:** Darker, no shadow
- **Disabled:** 60% opacity, no pointer

### Form Inputs
- **Default:** Light border, white background
- **Focus:** Blue border, blue glow shadow
- **Error:** Red border (if validation added)
- **Disabled:** Light gray background, no interaction

### Tables
- **Row Hover:** Subtle light gray background
- **Sticky Header:** Always visible when scrolling
- **Mobile Hidden:** columns 2 & 5 disappear on mobile

---

## Animation Timing

```
Transitions: 0.2s ease (default)
            0.15s ease (mobile - faster)
            
Spin Animation: 1s linear infinite (loading spinner)
```

---

## Typography Scale

```
Desktop:
  h2: 1.875rem (30px)
  h3: 1.125rem (18px)
  label: 0.8125rem (13px)
  body: 0.95rem (15px)

Tablet:
  h2: 1.5rem (24px)
  h3: 1.05rem (17px)
  label: 0.75rem (12px)
  body: 0.9rem (14px)

Mobile:
  h2: 1.325rem (21px)
  h3: 1rem (16px)
  label: 0.75rem (12px)
  body: 0.9rem (14px)

Small Mobile:
  h2: 1.125rem (18px)
  h3: 0.95rem (15px)
  label: 0.7rem (11px)
  body: 0.85rem (14px)
```

---

## Spacing Scale

```
Padding (All breakpoints):
  SmallMobile: 0.75rem
  Mobile:      1.25rem
  Tablet:      1.5rem
  Desktop:     1.75rem
  LargeDesktop: 2rem

Gap (Form Rows):
  SmallMobile: 0.75rem
  Mobile:      1rem
  Tablet:      1.25rem
  Desktop+:    1.5rem

Margin (Sections):
  SmallMobile: 0.75rem
  Mobile:      1rem
  Desktop+:    1.5rem
```

---

## Testing Recommendations

### Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Device Testing
- [ ] iPhone SE (375px)
- [ ] iPhone 12 (390px)
- [ ] iPhone 12 Pro Max (428px)
- [ ] iPad Mini (768px)
- [ ] iPad Pro (1024px)
- [ ] Desktop 1080p (1920x1080)
- [ ] Desktop 1440p (2560x1440)

### Interaction Testing
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Table scrolling on mobile
- [ ] Form submission flow
- [ ] Loading state display
- [ ] Button disabled state
- [ ] Print preview

