# BSMS – Popup, Modal & Overlay Inventory

Companion to [bsms-ui-ux-css-audit.md](bsms-ui-ux-css-audit.md) (date 2026-10-15). Issue IDs (UI-xxx) refer to the register in §15 of that report.

## Verification levels

| Level | Meaning |
|---|---|
| **1** | Found in source code |
| **2** | Opened in the browser through its real trigger |
| **3** | Visually inspected / measured (position, size, fit) |
| **4** | Measured at more than one viewport size (1024 px and 375 px unless stated) |
| **5** | Interaction tested (close, Escape, focus, backdrop, validation) |
| **6** | Form submission tested in a safe environment – **no popup reached this level** (no data was written) |

A popup is never "fully verified" below level 6. "—" = not tested.

## Legend for result columns

* **Desktop / Mobile:** ✓ fits and primary action reachable · ⚠ usable with a problem · ✗ broken
* **Esc / Backdrop / Focus / Lock:** behaviour observed in the browser (B) or read from source (S)
* **Backdrop "discards"** = one click/mousedown outside closes the popup and loses entered data

---

## G – Shared and global

| ID | Popup | Trigger | Component / CSS | Type | Desktop | Mobile | Esc / Backdrop / Focus / Lock | A11y | Issues | Level |
|---|---|---|---|---|---|---|---|---|---|---|
| G-01 | Shared dialog shell `<Modal>` | Used by G-02, MG-01, MG-02, CU-01, CU-07, AD-01, AD-02 | [common/ui/Modal.jsx](../client/src/components/common/ui/Modal.jsx) · `ui.css` | Shell (sm/md/lg/xl/drawer) | ✓ | ✓ | ✓ / inert by default ✓ / first field ✓ / ✓ (B) | role, aria-modal, labelled ✓; **no Tab trap** (B) | UI-017 (Tab trap), UI-033 (onClose identity, suspected), UI-027 (z 1050) | 5 |
| G-02 | Confirmation dialog (`useConfirm` / `ConfirmDialog`) | Delete / deactivate / approve actions in 28 files (Items, Suppliers, RM lists, Payees, Bank details, Bank charges, Cash/Hidden expenses, Petty cash, Receive types, Other ledgers, Card rates, Payment methods, Employees, Cutlery ×5, Recipes, Purchase history, Cash ledger, Analyst income …) | [ConfirmProvider.jsx](../client/src/components/common/ui/ConfirmProvider.jsx) · `ui.css` | Confirm | ✓ | ✓ | ✓ / – / dialog focused ✓ / ✓ (B) | ✓ | Items wording (UI-037); would render under legacy/route popups if ever nested (UI-027, suspected) | 5 (RM Type delete, Item delete, Payment-method delete; cancelled) |
| G-03 | Global notification popup | `showPopup()` after saves/errors in most pages | [common/Popup.jsx](../client/src/components/common/Popup.jsx) · `Popup.css` (z 2147483647) | Blocking alert | — | — | S: no Esc; backdrop closes; auto-closes after 4.5 s (success) / 5.5 s (error) | role=dialog + aria-live; focus not moved (S) | UI-026 (blocking for success, errors vanish); destroyed by reload on failed login (UI-008) | 1 |
| G-04 | Route popup shell `RouteModal` | Any `ModalLink` / `state.backgroundLocation` link (see R-xx) | [common/RouteModal.jsx](../client/src/components/common/RouteModal.jsx) · `RouteModal.css` (z 2147483000) | Shell | ⚠ | ✓ (bottom-sheet ≤ 700 px) | Esc ✓ but also fires from inside dropdowns ✗ / mousedown **discards** ✗ / focus stays behind ✗ / ✓ (B) | role on overlay, name on inner section | UI-004, 005, 006, 007, 024 | 5 |
| G-05 | Phone navigation drawer | ≡ strip (`.mobile-nav-toggle`) at ≤ 767 px | [NavigationBar.jsx:404](../client/src/components/NavigationBar.jsx:404) · `NavigationBar.css` | Side drawer | n/a | ⚠ | no Esc / backdrop closes ✓ / focus not moved / – (B) | toggle has aria-label + aria-expanded; headers not keyboard-operable | UI-011, UI-014 | 5 (375 px) |
| G-06 | View-only 403 alert | Any write blocked for QB | [api.js:27](../client/src/api.js:27) | `window.alert` | — | — | native | native | UI-028 | 1 |
| G-07 | Native `alert()` messages (27 call sites) | Report generate/export with no data or no dates; Cutlery forms; Issuance "login again"; "PDF generation feature coming soon!" | Reports, Cutlery, Issuance, OpeningBalanceHistory, PurchaseDetails | `window.alert` | — | — | native | native | UI-026 | 1 |
| G-08 | Native date pickers | All `<input type="date|time|datetime-local">` | browser | Picker | ✓ (rendered) | ✓ | native | label association missing on most (UI-013) | – | 3 |
| G-09 | react-select menus (portaled) | Item/supplier selects in purchase, issuance, return, wastage, stores-balance forms | `menuPortalTarget=document.body`, zIndex 9999/10000 | Dropdown overlay | ✓ on full pages; **✗ inside route popups** | — | – | – | UI-004 | 5 (Add New Purchase) |

## R – Route popups (rendered inside G-04 when opened from a list)

Opened as full pages from the sidebar; as popups from `ModalLink`s on Purchase History, Outstanding Bills, Items, Opening Balance History, Cutlery Assets/Transfers and the Adjustment tabs.

| ID | Popup (title) | Route | Opened from | Component | Type | Desktop | Mobile | Esc / Backdrop / Focus | Issues | Level |
|---|---|---|---|---|---|---|---|---|---|---|
| R-01 | Add New Purchase | `/purchase/new` | Purchase History "New" | [NewPurchase.jsx](../client/src/components/purchase/NewPurchase.jsx) | Line-item form | ✗ item menu hidden | — | ✓ / discards / ✗ (B) | **UI-004, UI-005**, UI-006, UI-007 | 5 |
| R-02 | Edit Purchase | `/purchase/edit/:id` | Purchase History, Adjustment tabs | [EditPurchase.jsx](../client/src/components/purchase/EditPurchase.jsx) | Line-item form | — | — | S: as R-01 | UI-004 (S), UI-005–007 | 1 |
| R-03 | Purchase Details | `/purchase/:id` | Purchase History "View" | [PurchaseDetails.jsx](../client/src/components/purchase/PurchaseDetails.jsx) | Details | ⚠ duplicate header + back arrow | — | ✓ / discards n/a / ✗ (B) | UI-007 (24 s blank on close), UI-024, "PDF coming soon" (UI-026) | 5 |
| R-04 | Add New Item | `/items/add` | Items "Add" | [AddNewItems.jsx](../client/src/components/Items/AddNewItems.jsx) | Form | ⚠ | ⚠ duplicate header + full-width × | ✓ / **discards (B)** / ✗ | UI-006, UI-024, 5 of 7 fields unlabelled | 5 (375 px) |
| R-05 | Edit Item | `/items/edit/:id` | Items "Edit" | [EditItem.jsx](../client/src/components/Items/EditItem.jsx) | Form | — | — | S: as R-04 | 12 classes without CSS (UI-012) | 1 |
| R-06 | Add Opening Balance | `/opening/add` | Opening Balance History "+ Add New" | [AddOpeningBalance.jsx](../client/src/components/OpeningBalance/AddOpeningBalance.jsx) | Form | ⚠ unstyled submit (page) | — | S | **UI-003**, UI-012 (`ob-*` classes have no CSS) | 3 (as page) |
| R-07 | Add New Issuance | `/issuance/issue` | (sidebar = page) | [IssueToDepartment.jsx](../client/src/components/issuance/IssueToDepartment.jsx) | Line-item form | ⚠ unstyled "Save Issuance", narrow item column | ✓ | S | UI-012, UI-035, UI-004 if opened as popup | 3 (as page) |
| R-08 | Edit Issuance | `/issuance/edit/:id` | Issuance adjustment tab | [EditIssuance.jsx](../client/src/components/issuance/EditIssuance.jsx) | Line-item form | — | — | S | UI-004 (z 9999), UI-012 | 1 |
| R-09 | Add New Wastage | `/wastage/add` | (sidebar = page) | [AddWastage.jsx](../client/src/components/wastage/AddWastage.jsx) | Line-item form | ⚠ unstyled Save | ✗ clipped (745/358) | S | **UI-003**, UI-009, UI-012 | 4 (as page) |
| R-10 | Edit Wastage | `/wastage/edit/:id` | Wastage adjustment tab | [EditWastage.jsx](../client/src/components/wastage/EditWastage.jsx) | Line-item form | — | — | S | UI-012 (76 `erp-*` classes without CSS – whole screen unstyled) | 1 |
| R-11 | Add New Return | `/returns/add` | (sidebar = page) | [AddReturn.jsx](../client/src/components/returns/AddReturn.jsx) | Line-item form | ⚠ unstyled Save | ✗ clipped (906/358) | S | **UI-003**, UI-009, UI-012 | 4 (as page) |
| R-12 | Add New Purchase Return | `/purchase-returns/add` | (sidebar = page) | [AddPurchaseReturn.jsx](../client/src/components/purchasereturn/AddPurchaseReturn.jsx) | Line-item form | ✓ | ✓ | S | Unnamed back button; 17 classes without CSS | 4 (as page) |
| R-13 | Asset Details | `/cutlery/assets/view/:id` | Cutlery Assets "view" | [ViewAsset.jsx](../client/src/components/Cutlery/Assets/ViewAsset.jsx) | Details | — | — | S | 15 classes without CSS | 1 |
| R-14 | Edit Asset | `/cutlery/assets/edit/:id` | Cutlery Assets "edit" | [EditAsset.jsx](../client/src/components/Cutlery/Assets/EditAsset.jsx) | Form + image | — | — | S | 8 classes without CSS | 1 |
| R-15 | Transfer Details | `/cutlery/transfer/view/:id` | Cutlery Transfers | [ViewTransfer.jsx](../client/src/components/Cutlery/Transfers/ViewTransfer.jsx) | Details | — | — | S | 40 classes without CSS | 1 |
| R-16 | Edit Adjustment | `/adjustments/edit/:id` | Stores Adjustments | [EditAdjustment.jsx](../client/src/components/adjustments/EditAdjustment.jsx) | Form | — | — | S | – | 1 |

## PU – Purchasing

| ID | Popup | Trigger | Component · CSS | Type | Desktop | Mobile | Esc / Backdrop / Focus / Lock | A11y | Issues | Level |
|---|---|---|---|---|---|---|---|---|---|---|
| PU-01 | Purchase details (VAT report) | VAT Report row | [PurchaseDetailsModal.jsx](../client/src/components/purchase/PurchaseDetailsModal.jsx) · reuses `route-modal` classes | Details | — | — | S: Esc ✓ | role/aria-modal ✓ | – | 1 |
| PU-02 | Make Payment | Outstanding Bills "Make Payment" | [PaymentModal.jsx](../client/src/components/purchase/PaymentModal.jsx) · `PaymentModal.css` (2-line stub) | Payment form | — (trigger hidden ≤ 1440 px) | — | S: no Esc / **discards** / – / – | no role | **UI-001** (trigger unreachable), UI-006, 16 classes without CSS | 1 |
| PU-03 | Pay Now | Pending invoices; Advance Payment page | [PayNowModal.jsx](../client/src/components/purchase/PayNowModal.jsx) · `PayNowModal.css` (defines `.ipm-*`) | Payment form | — | — | S: no Esc / – / – / – | no role; unnamed × on Advance Payment page (B) | UI-032 (crossed CSS), UI-017 | 1 |
| PU-04 | Invoice Payment | Pending invoices | [InvoicePaymentModal.jsx](../client/src/components/purchase/InvoicePaymentModal.jsx) · `PayNowModal.css`/`InvoicePaymentModal.css` | Payment allocation | — | — | S: no Esc / **discards** (line 228) | no role | UI-006, UI-032 | 1 |
| PU-05 | Settle Now | Pending invoices | [SettleNowModal.jsx](../client/src/components/purchase/SettleNowModal.jsx) · `SettleNowModal.css` (z 9000) | Settlement | — | — | S: no Esc / **discards** (line 125) | no role | UI-006, UI-027 | 1 |
| PU-06 | Create Purchase Order | Orders → "Order" (low-stock row) | [CreateOrderModal.jsx](../client/src/components/purchase/Orders/CreateOrderModal.jsx) · `OrdersPage.css` (z 1000) | Form | ✓ 520 × 559 | — | no Esc / closes unless submitting / ✗ / ✗ (B) | no role; 3 of 3 fields unlabelled; 17 trigger buttons all named "Order" | UI-013, UI-017, UI-022 | 5 |
| PU-07 | Order complete / cancel confirmation | Orders → Pending → "Order Complete" / "Cancel Order" | [ConfirmOrderModal.jsx](../client/src/components/purchase/Orders/ConfirmOrderModal.jsx) | Confirm | — | — | S: no Esc | no role | UI-017 | 1 |
| PU-08 | Mobile filter sheet / FAB | Purchase History at phone width | [PurchaseHistory.jsx](../client/src/components/purchase/PurchaseHistory.jsx) | Bottom sheet | — | — | – | – | UI-012 (`mobile-filter-sheet`, `mobile-overlay`, `mobile-fab` have no CSS) | 1 |
| PU-09 | Purchase return details | Purchase Returns History "View details" | [PurchaseReturnHistory.jsx](../client/src/components/purchasereturn/PurchaseReturnHistory.jsx) · `modal-overlay` | Details | ✓ 600 × 691, inner h-scroll | ✓ 351 × 731, inner h-scroll | no Esc / closes / ✗ / ✗ (B) | no role/name; close "×" | UI-017; 43 classes without CSS; trigger column hidden at 1024 (UI-010) | 5 |
| PU-10 | Settlement (purchase return) | Purchase Returns History "Settle" | [SettlementModalForReturn.jsx](../client/src/components/purchasereturn/SettlementModalForReturn.jsx) | Allocation form | — | — | S: no Esc; backdrop inert; confirm button not disabled while saving | no role | UI-012 (24 classes) | 1 |
| PU-11 | Settlement (unused) | none | [SettlementModal.jsx](../client/src/components/purchasereturn/SettlementModal.jsx) | – | – | – | – | – | UI-032 dead file importing a missing CSS file | 1 |

## ST – Stock history and report details

| ID | Popup | Trigger | Component · CSS | Desktop | Mobile | Esc / Backdrop / Focus / Lock | A11y | Issues | Level |
|---|---|---|---|---|---|---|---|---|---|
| ST-01 | Issuance details | Issuance History row | [IssuanceHistory.jsx](../client/src/components/issuance/IssuanceHistory.jsx) `ModalPortal` · `Issuance.css` | — (no "View" trigger found by the probe) | — | S: Esc ✓ / closes | no role | – | 1 |
| ST-02 | Wastage details | Wastage History "View Details" | [WastageHistory.jsx](../client/src/components/wastage/WastageHistory.jsx) · `modal-overlay` | ✓ 600 × 487, inner h-scroll | ✓ 351 × 453 | no Esc / closes / ✗ / ✗ (B) | no role/name; close button has no accessible name | UI-017, UI-022 | 5 |
| ST-03 | Wastage details (report) | Wastage Report "View Details" | [WastageReport.jsx](../client/src/components/report/WastageReport/WastageReport.jsx) | ✓ 600 × 487 | — | no Esc / closes / ✗ / ✗ (B) | as ST-02 | UI-017 | 5 |
| ST-04 | Department return details | Returns History "View" | [ReturnsHistory.jsx](../client/src/components/returns/ReturnsHistory.jsx) · `modal-overlay` | ✓ 992 × 655 | ✓ 343 × 708 | no Esc / closes / ✗ / ✗ (B) | no role; close "✕" | UI-017 | 5 |
| ST-05 | Stock transactions (item-wise) | Item-wise Stock Report row | [StockReportByRangeAndItem.jsx](../client/src/components/report/StockReportByRangeAndItem.jsx) · `modern-modal` | — | — | S: no Esc | no role | 11 classes without CSS | 1 |

## MG – Management

| ID | Popup | Trigger | Component · CSS | Desktop | Mobile | Esc / Backdrop / Focus / Lock | A11y | Issues | Level |
|---|---|---|---|---|---|---|---|---|---|
| MG-01 | Add / Edit name (RM Type, Department, Company, Expense Type, Bank Charges Type, Receive Type …) | "Add …" / edit icon in `RMManagementList` | [AddSimpleNameForm.jsx](../client/src/components/RawMaterial/common/AddSimpleNameForm.jsx) · shared `<Modal>` | ✓ 418 × 251 | — | ✓ / inert / ✓ / ✓ (B) | ✓; Tab escapes dialog | UI-017 (Tab trap) | 5 |
| MG-02 | Add / Edit Payee | Payees "Add Payee" | [AddPayeeForm.jsx](../client/src/components/RawMaterial/ExpensePayees/AddPayeeForm.jsx) · `<Modal>` | ✓ 420 × 334 | ✓ (S: same shell) | ✓ / inert / ✓ / ✓ (B) | ✓ | – | 5 |
| MG-03 | Add Employee | Employees "Add Employee" | [EmployeeManagement.jsx:449](../client/src/components/Employees/EmployeeManagement.jsx:449) · `EmployeeManagement.css` (z 1070) | ✓ 640 × 660 | ⚠ 351 × 731, Save at y 996 (scroll) | no Esc / inert / ✗ / ✗ (B) | no role/name; 9 of 9 fields unlabelled | UI-013, UI-017, UI-036 | 5 |
| MG-04 | Edit Employee | Employee row edit | EmployeeManagement.jsx:592 | — | — | S: as MG-03 | as MG-03 | as MG-03 | 1 |
| MG-05 | View Employee | Employee row view | EmployeeManagement.jsx:730 | — | — | S: as MG-03 | – | – | 1 |

## EX – Expenses

| ID | Popup | Trigger | Component · CSS | Desktop | Mobile | Esc / Backdrop / Focus / Lock | A11y | Issues | Level |
|---|---|---|---|---|---|---|---|---|---|
| EX-01 | Payment history | New Expenses row | [NewExpenses.jsx:1451](../client/src/components/Expenses/NewExpenses.jsx:1451) · `OnlineExpenses.css` (z 1000) | — | — | S: closes on backdrop | no role | – | 1 |
| EX-02 | Pay expense bill | New Expenses "Pay" | NewExpenses.jsx:1514 | — | — | S: **discards** | no role | UI-006 | 1 |
| EX-03 | Credit note | New Expenses | NewExpenses.jsx:1768 | — | — | S: **discards** | no role | UI-006 | 1 |
| EX-04 | Apply credit note | New Expenses | NewExpenses.jsx:1875 | — | — | S: **discards** | no role | UI-006 | 1 |
| EX-05 | Quick add payee | New Expenses form | NewExpenses.jsx:1961 | — | — | S: **discards** | no role | UI-006 | 1 |
| EX-06 | Quick add expense type | New Expenses form | NewExpenses.jsx:1986 | — | — | S: **discards** | no role | UI-006 | 1 |
| EX-07 | Row action menu | New Expenses "⋮" | `.action-menu-dropdown.portal-dropdown` (fixed, z 99999) | — | — | – | – | UI-027 | 1 |
| EX-08 | View petty-cash voucher | Petty Cash "View" | [PettyCash.jsx:694](../client/src/components/Expenses/PettyCash.jsx:694) · `modal-overlay` | — (probe did not open it) | — | S: closes on backdrop | no role | – | 1 |
| EX-09 | Sub-expense breakdown | Expense Summary Report row | [ExpenseSummaryReport.jsx](../client/src/components/Expenses/Reports/ExpenseSummaryReport.jsx) · `esr-modal` | — | — | S: Esc ✓ | role/aria-modal ✓ | – | 1 |

## FI – Finance

| ID | Popup | Trigger | Component · CSS | Desktop | Mobile | Esc / Backdrop / Focus / Lock | A11y | Issues | Level |
|---|---|---|---|---|---|---|---|---|---|
| FI-01 | Cash Received | Cash Ledger "Cash Received" | [CashReceive.jsx](../client/src/components/Finance/CashReceive.jsx) · `StaffLoans.css` `sl-modal` (z 99999) | ✓ 440 × 691 | ✓ 343 × 731 (375), 288 × 576 (320) | ✗ / **discards (B)** / ✗ / ✗ | role ✓; 7 of 7 fields unlabelled; error out of view (B) | UI-006, 013, 017, 018, 019, 023 ("Rs. 387823.89") | 5 (+ validation) |
| FI-02 | Cash Issued | Cash Ledger "Cash Issued" | [CashIssuedModal.jsx](../client/src/components/Finance/CashIssuedModal.jsx) · `sl-modal` | ✓ 440 × 691 | — | ✗ / discards (S) / ✓ / ✗ (B) | 6 of 6 unlabelled | UI-006, 013, 017 | 5 |
| FI-03 | Bank Received | Bank Ledger "Bank Received" | [BankTransactionModal.jsx](../client/src/components/Finance/BankTransactionModal.jsx) · `sl-modal` | ✓ 440 × 691 | — | ✗ / discards (S) / ✓ / ✗ (B) | 8 of 8 unlabelled | UI-006, 013, 017 | 5 |
| FI-04 | Bank Issued | Bank Ledger "Bank Issued" | BankTransactionModal.jsx · `sl-modal` | ✓ 440 × 691 | — | ✗ / discards (S) / ✓ / ✗ (B) | 7 of 7 unlabelled | UI-006, 013, 017 | 5 |
| FI-05 | Receive Cash (staff loan) | Staff Loans "Receive Cash" | [StaffLoans.jsx:420](../client/src/components/Finance/StaffLoans.jsx:420) · `sl-modal` | ✓ 440 × 497 | ✓ 343 × 497 | ✗ / discards (S) / ✓ / ✗ (B) | labelled ✓ | UI-006, 017 | 5 |
| FI-06 | Repayment History | Staff Loans history icon | StaffLoans.jsx:498 · `sl-modal-wide` | ✓ 560 × 400 | — | ✗ / closes / ✗ / ✗ (B) | role ✓; trigger has no text name | UI-017, UI-022 | 5 |
| FI-07 | Realise card settlement | Card Ledger "Realise" (needs selected rows) | [CardLedger.jsx:713](../client/src/components/Finance/CardLedger.jsx:713) · `CardLedger.css` `cl-modal` (z 99999) | — (no selection made) | — | S: no Esc / **discards** | role ✓ | UI-006, 017 | 1 (trigger clicked; no popup without a selection) |
| FI-08 | Release Cheque | Cheque Registry "Release" | [ExpensesChequeRegistry.jsx](../client/src/components/Finance/ExpensesChequeRegistry.jsx) · `ecr-release-modal` (z 99999) | ✓ 440 × 429 | ✓ 375 × 450 (edge-to-edge) | ✗ / closes / ✗ / ✓ (B) | no role/name; 1 field unlabelled | UI-013, 017 | 5 |
| FI-09 | Add New Income | Income "New Income"; Analyst Income | [NewIncomeModal.jsx:72](../client/src/components/Income/NewIncomeModal.jsx:72) · `Income.css` (z 1050) | ✓ 560 × 350 | ✓ 351 × 500 | ✗ / **discards** (S) / ✗ / ✗ (B) | no role/name | UI-006, 017 | 5 |
| FI-10 | Opening-balance panel | Cash Ledger | [CashLedger.jsx](../client/src/components/Finance/CashLedger.jsx) `fl-opening-panel` | inline panel (not a popup) | — | – | – | 10 `fl-*` classes without CSS | 1 |
| FI-11 | Edit expense adjustment | Adjustments → record tab "Edit" | [RecordAdjustmentsTab.jsx:313](../client/src/components/adjustments/tabs/RecordAdjustmentsTab.jsx:313) · `modal-overlay` | — | — | S: **discards** on backdrop | role, aria-modal, aria-label ✓ | UI-006 | 1 |
| FI-12 | Edit financial receive adjustment | Adjustments → record tab "Edit" | RecordAdjustmentsTab.jsx:324 | — | — | S: **discards** on backdrop | ✓ | UI-006 | 1 |

## CO – Collection (not opened – see report §3.2)

| ID | Popup | Trigger | Component · CSS | Esc / Backdrop | A11y | Issues | Level |
|---|---|---|---|---|---|---|---|
| CO-01 | Approve & post collections | Pending → "Approve" (Accountant only) | [Collection.jsx:1023](../client/src/components/Collection/Collection.jsx:1023) · `CardLedger.css` `cl-modal` | S: no Esc / closes unless submitting ✓ | role, aria-modal ✓ | UI-017 | 1 |
| CO-02 | Card payment view | Card amount link | Collection.jsx:1113 | S: no Esc / closes | ✓ | UI-017 | 1 |
| CO-03 | Reject collections | Pending → "Reject" | Collection.jsx:1222 | S: no Esc / closes unless submitting ✓ | ✓ | UI-017 | 1 |

## CU – Cutlery

| ID | Popup | Trigger | Component · CSS | Desktop | Mobile | Esc / Backdrop / Focus / Lock | A11y | Issues | Level |
|---|---|---|---|---|---|---|---|---|---|
| CU-01 | Add Location | "+ Add Location" | [AddLocationForm.jsx](../client/src/components/Cutlery/Locations/AddLocationForm.jsx) · `<Modal>` | ✓ 420 × 275 | ✓ 375 × 275 (bottom) | ✓ / inert / ✓ / ✓ (B) | ✓; validation via `alert()` | UI-026 | 5 |
| CU-02 | Add Asset | "+ Add Asset" | [AddAssetForm.jsx:78](../client/src/components/Cutlery/Assets/AddAssetForm.jsx:78) · `AddAssetForm.css` (no fixed positioning) | **✗ off-screen (top 768 px), body scroll locked** | — | ✓ / – / ✗ / ✓ (B) | no role | **UI-002** | 5 |
| CU-03 | Add Transfer | "Add Transfer" | [AddTransferForm.jsx](../client/src/components/Cutlery/Transfers/AddTransferForm.jsx) · `form-overlay` | ✗ inline block 647 × 1,427 | — | ✗ / – / ✗ / ✗ (B) | 2 unlabelled | UI-015 | 5 |
| CU-04 | Edit Transfer | Transfers edit icon | [EditTransfer.jsx](../client/src/components/Cutlery/Transfers/EditTransfer.jsx) · `edit-transfer-overlay` | — | — | S: same CSS gap as CU-03 | – | UI-015 | 1 |
| CU-05 | Add Purchase (cutlery) | "New Purchase" | [AddPurchaseForm.jsx](../client/src/components/Cutlery/Purchases/AddPurchaseForm.jsx) · `add-purchase-form-overlay` | ✗ inline at y 934 px | — | ✗ / – / ✗ / ✗ (B) | 9 of 9 unlabelled | UI-013, UI-015 | 5 |
| CU-06 | Edit Purchase (cutlery) | Purchases edit icon | [EditPurchase.jsx](../client/src/components/Cutlery/Purchases/EditPurchase.jsx) · `ep-overlay` | — | — | S: same CSS gap; 11 `ep-*` classes without CSS | – | UI-012, UI-015 | 1 |
| CU-07 | Purchase Details (cutlery) | Purchases "View" | [ViewPurchase.jsx](../client/src/components/Cutlery/Purchases/ViewPurchase.jsx) · `<Modal size="lg">` | ✓ 759 × 690 | ✓ 375 × 762 | ✓ / inert / ✓ / ✓ (B) | ✓ | – | 5 |
| CU-08 | Add Damage Record | "+ Add Damage" | [AddDamageForm.jsx](../client/src/components/Cutlery/Damages/AddDamageForm.jsx) · `add-damage-form-overlay` | ✗ inline block 647 × 1,203 | — | ✗ / – / ✗ / ✗ (B) | 4 unlabelled | UI-015 | 5 |
| CU-09 | Edit Damage | Damages ✏️ | [EditDamage.jsx](../client/src/components/Cutlery/Damages/EditDamage.jsx) | — | — | S: same CSS gap | emoji-only trigger | UI-015, UI-022 | 1 |
| CU-10 | View Damage | Damages 👁️ | [ViewDamage.jsx](../client/src/components/Cutlery/Damages/ViewDamage.jsx) | — | — | S: same CSS gap; 14 classes without CSS | emoji-only trigger | UI-015, UI-022 | 1 |

## FG – FG Production (not opened – see report §3.2)

| ID | Popup | Trigger | Component · CSS | Esc / Backdrop | Notes | Level |
|---|---|---|---|---|---|---|
| FG-01 | New / Edit FG Production Item | Recipes page | [Recipes.jsx](../client/src/components/FGProduction/Recipes.jsx) · `FGProduction.css` `fgprod-modal` (z modal+20) | S: Esc ✓ / closes on backdrop | Has a phone footer layout (stacked full-width buttons) – the only legacy popup with one | 1 |
| FG-02 | Add / Edit RM Recipe | Recipes page | Recipes.jsx · `fgprod-modal` | S: Esc ✓ | – | 1 |

## AD – Adjustments

| ID | Popup | Trigger | Component · CSS | Desktop | Mobile | Esc / Backdrop / Focus / Lock | A11y | Issues | Level |
|---|---|---|---|---|---|---|---|---|---|
| AD-01 | Stores Balance confirmation | Stores Balance save/remove | [StoresBalance.jsx](../client/src/components/adjustments/StoresBalance.jsx) `ConfirmModal` on `<Modal>` | — | — | S: shared shell ✓ | ✓ | – | 1 |
| AD-02 | Stores Adjustments confirmation | Stores Adjustments actions | [StoresAdjustments.jsx](../client/src/components/adjustments/StoresAdjustments.jsx) `ConfirmModal` on `<Modal>` | — | — | S ✓ | ✓ | – | 1 |
| AD-03 | Adjustment details panel | Stores Adjustments row | StoresAdjustments.jsx:597 `details-panel slide-up` | — (probe found no trigger) | — | – | – | `details-panel`, `slide-up` have no CSS (UI-012) | 1 |
| AD-04 | New Inhand Entry | In-hand "New Inhand Entry" | [InhandEntryForm.jsx](../client/src/components/adjustments/InhandEntryForm.jsx) · `Adjustments.css` `ih-form-modal` (z 1070) | ✓ 680 × 659 | ✓ 355 × 763 | ✓ / closes on backdrop (target-checked) / ✗ / ✗ (B) | no role/name; 5 of 5 unlabelled | UI-013, UI-017 | 5 |
| AD-05 | In-hand entry details "drawer" | In-hand "View Details" | [InhandAdjustments.jsx](../client/src/components/adjustments/InhandAdjustments.jsx) · `ih-drawer` (no fixed positioning) | ✗ inline at top of page | — | ✗ / – / ✗ / ✗ (B) | no role | **UI-016**; `ih-drawer-body`, `ih-detail-*`, `ih-audit-*` without CSS | 5 |
| AD-06 | In-hand approve/cancel confirmation | In-hand row actions | InhandAdjustments.jsx:39 `ConfirmModal` · `modal-overlay` | — | — | S: no Esc | no role | `modal-icon`, `modal-title`, `modal-message`, `modal-actions` without CSS | 1 |
| AD-07 | In-hand audit log | Drawer "Show Audit Log" | [InhandAuditLog.jsx](../client/src/components/adjustments/InhandAuditLog.jsx) | — | — | – | – | 14 `ih-audit-*` classes without CSS | 1 |

---

## Totals

| Measure | Count |
|---|---|
| Popup / overlay entries in this inventory | **89** (G 9 · R 16 · PU 11 · ST 5 · MG 5 · EX 9 · FI 12 · CO 3 · CU 10 · FG 2 · AD 7 – of which G-07 groups 27 native `alert()` calls and G-02 groups confirmations in 28 files) |
| Opened through their real trigger, inspected and interaction-tested (level 5) | 30 popups – G-02, G-05, G-09, R-01, R-03, R-04, PU-06, PU-09, ST-02, ST-03, ST-04, MG-01, MG-02, MG-03, FI-01 – FI-06, FI-08, FI-09, CU-01, CU-02, CU-03, CU-05, CU-07, CU-08, AD-04, AD-05 – plus the shells G-01 and G-04 exercised through them |
| Inspected only as full pages (level 3–4) | 5 route forms – R-06, R-07, R-09, R-11, R-12; plus G-08 native date pickers |
| Measured at more than one viewport | 15 – G-04, R-09, R-11, R-12, PU-09, ST-02, ST-04, MG-03, FI-01 (1024/375/320), FI-05, FI-08, FI-09, CU-01, CU-07, AD-04 |
| Source only (level 1) | 51 |
| Submission tested (level 6) | 0 |

## Popup-specific defects (summary)

| ID | Priority | Defect | Popups |
|---|---|---|---|
| UI-002 | P0 | Off-screen and unreachable | CU-02 |
| UI-003 | P0 | No double-submit guard | R-06, R-09, R-11 |
| UI-004 | P1 | Dropdown menu renders behind popup | R-01 (B), R-02, R-08 (S) |
| UI-005 | P1 | Escape in dropdown closes popup and discards data | R-01 (B), all route forms (S) |
| UI-006 | P1 | Backdrop discards entered data | G-04/R-xx (B: R-04), FI-01 (B), FI-02–05, FI-07, FI-09, FI-11, FI-12, PU-02, PU-04, PU-05, EX-02–06 (S) |
| UI-007 | P1 | Page behind route popup unmounted and reloaded | All R-xx (B: R-03) |
| UI-015 | P2 | Rendered inline instead of as overlay | CU-03–CU-06, CU-08–CU-10 |
| UI-016 | P2 | Drawer rendered inline | AD-05 |
| UI-017 | P2 | No Escape / focus / scroll lock / Tab trap | 18 of 30 opened popups; Tab trap missing in G-01 |
| UI-018 | P2 | Validation message out of view | FI-01 (B) |
| UI-024 | P2 | Duplicate header / two close buttons | R-03, R-04 (B), other route forms (S) |
| UI-027 | P2 (suspected) | z-index conflicts between families | G-01/G-02 (1050) vs FI/EX legacy (99999) vs G-04 (2147483000) |
| UI-036 | P3 | Footer/primary action scrolls away on phone | MG-03 |
