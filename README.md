# Decision-Aware Search: A Reimagined Google Search

A proof-of-concept search engine that ranks results based on **who you are** and **what you need**, not just keyword relevance.

---

## Problem Statement

Traditional search engines like Google optimize for a single metric: **relevance**. They treat all users the same, returning identical results regardless of context:

- A **student** searching "machine learning" wants tutorials and accessible overviews
- A **shopper** wants affordable products with good reviews
- A **researcher** needs academic papers with high citation counts
- A **casual user** wants quick, recent summaries

**The result?** Users must manually filter through irrelevant results to find what actually matters to them.

---

## Why Google Search Needs Reimagination

1. **One-Size-Fits-None Rankings** — Google's PageRank prioritizes authority and links, not user context
2. **Information Overload** — Users waste time evaluating results instead of finding answers
3. **Lost Opportunity Cost** — Students miss summaries, shoppers see premium options they can't afford, researchers miss citations
4. **Hidden Decision Criteria** — Why does a result rank high? No transparency

---

## What is Decision-Aware Search?

**Decision-Aware Search** reimagines ranking by asking: *"What decision is this user trying to make?"*

Instead of one relevance score, we evaluate results across **8 dimensions**:

- **Relevance** — Does it answer the query?
- **Simplicity** — How easy to understand?
- **Price** — What's the cost factor?
- **Reviews/Trust** — How credible?
- **Citations** — Academic impact?
- **Depth** — How comprehensive?
- **Recency** — How current?
- **Reading Time** — How quick?

Then, we **weight these dimensions** based on user profile and constraints, producing truly personalized rankings.

### Key Innovation: Transparency

Each result shows **"Why this result?"** — human-readable explanations of why it ranked well for *that specific user*.

---

## Personalized Experience Profiles

Users select their role, which determines ranking priorities:

### 👨‍🎓 Student Profile
- **Priorities:** Simplicity (30%), Relevance (25%), Recency (15%)
- **Goal:** Learn and understand quickly

### 🛍️ Shopper Profile
- **Priorities:** Price (35%), Reviews (30%), Relevance (20%)
- **Goal:** Find the best value

### 🔬 Researcher Profile
- **Priorities:** Citations (35%), Depth (30%), Relevance (20%)
- **Goal:** Build on existing knowledge

### 😎 Casual Profile
- **Priorities:** Relevance (35%), Recency (25%), Simplicity (20%)
- **Goal:** Quick answers

### Optional Constraints
- **Budget** — "Under $50"
- **Reading Time** — "5 minutes"
- **Skill Level** — "Beginner/Intermediate/Advanced"

---

## Technical Approach

### Simple Scoring, No Machine Learning

We use **transparent, rule-based scoring** instead of black-box ML models:

```javascript
score = (simplicity × w_simplicity) 
      + (citations × w_citations) 
      + (price × w_price)
      + ... [weighted sum for each dimension]

final_score = score + constraint_adjustments
```

**Why?**
- ✓ Explainable: Users understand why they see results
- ✓ Debuggable: Easy to fix biases
- ✓ Transparent: No hidden algorithms
- ✓ Fast: No training or model inference

### Key Features

| Feature | Benefit |
|---------|---------|
| Profile-based weights | Different ranking per user type |
| Constraint adjustments | Minor bonuses/penalties based on user needs |
| Top 3 results only | Focused, high-quality recommendations |
| Decision labels | "Best Budget Choice" instead of "82% score" |
| Explanations | Users understand *why* they see results |
| Profile switching demo | Results instantly re-rank when profile changes |

---

## How to Use

### Quick Start
1. Open `index.html` in a web browser
2. Enter a search query (e.g., "machine learning")
3. Select your user profile from the dropdown
4. (Optional) Set budget, reading time, or skill level
5. Click "Search"
6. View personalized results with explanations

### Testing Profile Switching (WOW Factor!)
1. Search once
2. Change the profile dropdown
3. Watch results **instantly re-rank** for the new profile
4. Open browser console (F12) to see detailed scoring logs

---

## Project Structure

```
decision-aware-search/
├── index.html           # Semantic HTML layout
├── styles.css           # Clean, responsive CSS
├── app.js               # Core ranking & UI logic
├── data/
│   └── results.json     # Mock search results (8 results × 9 metrics)
└── README.md            # This file
```

---

## Technical Specs

- **Language:** Vanilla JavaScript (no frameworks)
- **Styling:** Pure CSS
- **Data Format:** JSON
- **Browser Support:** All modern browsers
- **Dependencies:** None
- **File Size:** ~50KB total

---

## Key Insights

1. **Transparency Matters** — Users trust results more when they understand why
2. **Context is Everything** — Same result serves different purposes
3. **Simple > Complex** — Readable weights beat black-box algorithms
4. **Explainability is a Feature** — Not an afterthought, core to adoption

---

## Future Scalability

- **Phase 2:** Real data integration (search APIs)
- **Phase 3:** ML-enhanced metric prediction
- **Phase 4:** User history & contextual awareness
- **Phase 5:** B2B analytics & custom profiles
- **Phase 6:** Community-driven profile sharing

---

## Limitations

This is a **proof-of-concept**:
- ❌ Mock data only
- ❌ No user accounts
- ❌ Limited to 8 results
- ❌ Hardcoded weights

For production: Add real search pipeline, user auth, database, feedback loops, and performance optimization.

---

**Start searching smarter. Get results that match your decisions.**
