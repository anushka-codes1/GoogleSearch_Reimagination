# Multi-Currency Budget Support

## Overview
The budget input field now supports multiple currencies. Users can select their preferred currency and enter a budget amount.

## Supported Currencies

| Currency | Code | Symbol |
|----------|------|--------|
| US Dollar | USD | $ |
| Euro | EUR | € |
| British Pound | GBP | £ |
| Indian Rupee | INR | ₹ |
| Japanese Yen | JPY | ¥ |
| Canadian Dollar | CAD | C$ |
| Australian Dollar | AUD | A$ |
| Singapore Dollar | SGD | S$ |
| Hong Kong Dollar | HKD | HK$ |
| Mexican Peso | MXN | ₱ |

## UI Changes

### Frontend (index.html)
- **Currency Selector**: Added a dropdown with 10 currency options
- **Budget Input**: Changed from text input to number input for validation
- **Layout**: Horizontal flex layout with currency selector on the left, amount input on the right
- **Placeholder**: Updated to "e.g., 50" (just the amount, currency shown in selector)

### Example Usage
1. Select currency from dropdown (e.g., EUR)
2. Enter budget amount (e.g., 75)
3. Run search - system will include "EUR 75" in constraints

## API Changes

### GET /api/search Endpoint
New optional query parameters:
```
?q=python&profile=student&budget=true&budgetAmount=50&currency=EUR
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `budget` | boolean | Set to 'true' to enable budget constraint |
| `budgetAmount` | number | Budget amount (floating point) |
| `currency` | string | Currency code (defaults to USD) |

### POST /api/search Endpoint
Updated request body format:
```json
{
  "query": "machine learning",
  "profile": "student",
  "constraints": {
    "budget": true,
    "budgetAmount": 50,
    "currency": "EUR",
    "readingTime": 20,
    "skillLevel": "beginner"
  }
}
```

## Code Changes Summary

### Files Modified

1. **index.html** (Lines 50-75)
   - Added currency dropdown selector
   - Changed budget input type from text to number
   - Set up flex layout for side-by-side display

2. **app.js**
   - Added `currencySelect` DOM reference (Line 6)
   - Updated `getConstraints()` function to return:
     - `budget`: boolean flag
     - `budgetAmount`: numeric value
     - `currency`: currency code
   - Updated `handleSearch()` to pass `budgetAmount` and `currency` to API

3. **server.js**
   - Updated GET `/api/search` documentation to list new parameters
   - Updated POST `/api/search` documentation with currency examples
   - Modified constraints parsing in both endpoints to include:
     - `budgetAmount`: numeric value
     - `currency`: currency code (defaults to 'USD')

## Backward Compatibility

- Old API calls without currency parameters still work (defaults to USD)
- Budget boolean flag still functions as before
- Existing searches not specifying currency will default to USD

## Testing

### Example API Calls

**USD Budget:**
```bash
curl "http://localhost:8000/api/search?q=course&profile=student&budget=true&budgetAmount=50&currency=USD"
```

**EUR Budget:**
```bash
curl "http://localhost:8000/api/search?q=course&profile=student&budget=true&budgetAmount=75&currency=EUR"
```

**GBP Budget:**
```bash
curl "http://localhost:8000/api/search?q=programming&profile=shopper&budget=true&budgetAmount=100&currency=GBP"
```

### Console Output Example
```
--- Input Summary ---
┌──────────────┬─────────────────────┐
│ Query        │ course              │
│ Profile      │ student             │
│ Budget       │ EUR 75              │
│ Reading Time │ Not set             │
│ Skill Level  │ Not set             │
└──────────────┴─────────────────────┘
```

## Future Enhancements

- Add real-time exchange rate conversion (optional)
- Store user's preferred currency in local storage
- Add currency symbols in result pricing display
- Add price comparison across different currencies
