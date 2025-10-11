# Google Sheets Formulas Reference

This document explains the formulas automatically added to your Google Sheets by the pipeline.

## Sales_Fact Sheet

### Column R: total_fees
**Formula**: `=M{row}+N{row}+O{row}+P{row}+Q{row}`

**Calculates**: Sum of all fee columns
- M: fulfillment_fee
- N: referral_fee
- O: transaction_fee
- P: storage_fee
- Q: other_fees

**Example**: If row 2 has:
- Fulfillment: $5.00
- Referral: $3.00
- Transaction: $0.50
- Storage: $0.25
- Other: $0.00

Then `total_fees` = $8.75

---

## Model_Profitability Sheet

### Column J: total_cost
**Formula**: `=I{row}*G{row}`

**Calculates**: Total product cost (model_cost × quantity)

**Example**: 
- Model cost (I): $15.00
- Quantity (G): 2
- Total cost (J): $30.00

### Column P: total_fees
**Formula**: `=K{row}+L{row}+M{row}+N{row}+O{row}`

**Calculates**: Sum of all fees
- K: fulfillment_fee
- L: referral_fee
- M: transaction_fee
- N: storage_fee
- O: other_fees

### Column T: gross_profit
**Formula**: `=H{row}-J{row}`

**Calculates**: Revenue minus total cost

**Example**:
- Revenue (H): $100.00
- Total cost (J): $30.00
- Gross profit (T): $70.00

### Column U: net_profit
**Formula**: `=T{row}-P{row}-S{row}`

**Calculates**: Gross profit minus fees and refunds

**Example**:
- Gross profit (T): $70.00
- Total fees (P): $15.00
- Refund (S): $0.00
- Net profit (U): $55.00

### Column V: gross_margin_%
**Formula**: `=IF(H{row}>0,T{row}/H{row}*100,0)`

**Calculates**: Gross profit as percentage of revenue

**Example**:
- Gross profit (T): $70.00
- Revenue (H): $100.00
- Gross margin (V): 70%

**Note**: Returns 0 if revenue is 0 to avoid division errors

### Column W: net_margin_%
**Formula**: `=IF(H{row}>0,U{row}/H{row}*100,0)`

**Calculates**: Net profit as percentage of revenue

**Example**:
- Net profit (U): $55.00
- Revenue (H): $100.00
- Net margin (W): 55%

**Note**: Returns 0 if revenue is 0 to avoid division errors

### Column X: unit_revenue
**Formula**: `=IF(G{row}>0,H{row}/G{row},0)`

**Calculates**: Revenue per unit sold

**Example**:
- Revenue (H): $100.00
- Quantity (G): 2
- Unit revenue (X): $50.00

**Note**: Returns 0 if quantity is 0 to avoid division errors

### Column Y: unit_profit
**Formula**: `=IF(G{row}>0,U{row}/G{row},0)`

**Calculates**: Net profit per unit sold

**Example**:
- Net profit (U): $55.00
- Quantity (G): 2
- Unit profit (Y): $27.50

**Note**: Returns 0 if quantity is 0 to avoid division errors

---

## Benefits of Using Formulas

### ✅ Transparency
You can see exactly how each metric is calculated by clicking on any cell

### ✅ Accuracy
Calculations are performed by Google Sheets, ensuring consistency

### ✅ Flexibility
You can manually adjust inputs (like model costs or fees) and see calculations update instantly

### ✅ Auditability
Easy to trace where numbers come from and verify calculations

### ✅ Protection Against Sync Issues
If the sync partially fails, formulas ensure remaining calculations are still correct

---

## Manual Adjustments

You can manually edit any calculated column if needed:

1. **To override a formula**: Simply type a new value
2. **To restore a formula**: Copy the formula from an adjacent row
3. **To adjust calculations**: Edit the source columns (model_cost, fees, etc.)

---

## Example Profitability Calculation

Here's a complete example showing all formulas in action:

| Column | Field | Value | Formula/Source |
|--------|-------|-------|----------------|
| A | date | 2025-10-11 | From orders |
| B | channel | Amazon | From orders |
| C | order_id | 123-4567890 | From orders |
| D | line_id | 45678901234 | From orders |
| E | sku | ABC-001 | From orders |
| F | title | Widget Pro | From orders |
| G | qty | 2 | From orders |
| H | revenue | $100.00 | From orders |
| I | model_cost | $15.00 | From Model_Costs sheet |
| **J** | **total_cost** | **$30.00** | **=I2\*G2** |
| K | fulfillment_fee | $8.00 | From Amazon API |
| L | referral_fee | $15.00 | From Amazon API |
| M | transaction_fee | $0.00 | N/A for Amazon |
| N | storage_fee | $0.50 | From Amazon API |
| O | other_fees | $0.00 | From Amazon API |
| **P** | **total_fees** | **$23.50** | **=K2+L2+M2+N2+O2** |
| Q | shipping | $5.00 | From orders |
| R | tax | $8.00 | From orders |
| S | refund | $0.00 | From orders |
| **T** | **gross_profit** | **$70.00** | **=H2-J2** |
| **U** | **net_profit** | **$46.50** | **=T2-P2-S2** |
| **V** | **gross_margin_%** | **70%** | **=T2/H2\*100** |
| **W** | **net_margin_%** | **46.5%** | **=U2/H2\*100** |
| **X** | **unit_revenue** | **$50.00** | **=H2/G2** |
| **Y** | **unit_profit** | **$23.25** | **=U2/G2** |
| Z | currency | USD | From orders |
| AA | region | US | From orders |

---

## Tips

1. **Don't sort in Excel/CSV**: Formulas reference specific rows, so sorting can break references. Always sort in Google Sheets or use the built-in sort feature in the pipeline.

2. **Copy formulas carefully**: When copying rows, make sure formulas are adjusted to the new row numbers.

3. **Freeze headers**: Consider freezing row 1 (View → Freeze → 1 row) for easier navigation.

4. **Use filters**: Apply filters to analyze specific channels, SKUs, or date ranges without affecting formulas.

---

This formula-based approach ensures your profitability analysis is always accurate and transparent! 📊✨

