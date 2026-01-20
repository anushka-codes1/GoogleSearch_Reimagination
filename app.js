// DOM Elements
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const profileSelect = document.getElementById('profileSelect');
const budgetInput = document.getElementById('budgetInput');
const currencySelect = document.getElementById('currencySelect');
const readingTimeInput = document.getElementById('readingTimeInput');
const skillLevelInput = document.getElementById('skillLevelInput');
const resultsContainer = document.getElementById('resultsContainer');

// Global state
let mockResults = [];
let lastSearchContext = null;

/**
 * Profile-based ranking weights
 * Maps user profiles to metric weights (0-1 scale)
 * 
 * IMPORTANT: These weights ONLY affect personalization scoring (30% of final score)
 * They do NOT change result categories or introduce unrelated result types.
 * Query intent + relevance score (70% of final score) always determines result types.
 * 
 * Profile examples:
 * - Shopper: Boosts price & reviews within relevant products (doesn't show courses)
 * - Student: Boosts simplicity within relevant learning materials (doesn't show papers)
 * - Researcher: Boosts citations & depth within relevant academic content (no tutorials)
 * - Casual: Boosts recency & quick reads within relevant results (no restrictions)
 */
const profileWeights = {
    student: {
        simplicity: 0.30,      // Easy to understand concepts
        relevance: 0.25,       // Must be relevant
        recency: 0.15,         // Recent knowledge preferred
        reviews: 0.15,         // Trust credibility of source
        depth: 0.10,           // Some depth for learning
        price: 0.05,           // Cost matters but less critical
        citations: 0.00,       // Less important for students
        readingTime: -0.05     // Shorter is better (negative bonus)
    },
    shopper: {
        // These weights ONLY affect ranking among results that matched query intent
        // A shopper searching "machine learning" won't see prices boosting non-products
        // Relevance filter (70%) ensures only relevant products shown first
        price: 0.35,           // Cost is primary concern (within relevant products only)
        reviews: 0.30,         // Trust other buyers
        relevance: 0.20,       // Must match what they want
        simplicity: 0.10,      // Easy purchasing info
        recency: 0.05,         // Recent prices/availability
        depth: 0.00,
        citations: 0.00,
        readingTime: 0.00
    },
    researcher: {
        // These weights ONLY affect ranking among results that matched query intent
        // A researcher searching "learn machine learning" will get courses, not just papers
        // But among courses, researcher won't prefer them due to low depth
        // Relevance filter (70%) determines result type, profile (30%) refines order
        citations: 0.35,       // Academic impact matters most (within relevant results)
        depth: 0.30,           // Detailed analysis needed
        relevance: 0.20,       // Must be on-topic
        reviews: 0.10,         // Peer credibility
        recency: 0.05,         // Recent research preferred
        simplicity: 0.00,      // Complexity acceptable
        price: 0.00,
        readingTime: 0.00
    },
    casual: {
        relevance: 0.35,       // Must match search intent
        recency: 0.25,         // Want current information
        readingTime: -0.15,    // Prefer quick reads
        simplicity: 0.20,      // Easy to understand
        reviews: 0.10,         // General trustworthiness
        price: 0.05,           // Some price awareness
        depth: 0.00,
        citations: 0.00
    }
};

/**
 * Calculate normalized reading time penalty/bonus
 * Shorter = better, longer = worse
 * Returns a 0-1 score based on reading time
 */
function getReadingTimeScore(readingTime) {
    // Treat anything over 60 minutes as max penalty
    // Anything under 5 minutes as perfect
    const maxTime = 60;
    const minTime = 5;
    
    if (readingTime <= minTime) return 1.0;
    if (readingTime >= maxTime) return 0.0;
    
    return 1.0 - ((readingTime - minTime) / (maxTime - minTime));
}

/**
 * Compute relevance score based on keyword/category matching
 * Measures how well the result matches the search query intent
 * 
 * CRITICAL: This score (70% weight) determines which result TYPES are shown.
 * Results must have category or tag matches to score well here.
 * Profile weights have NO effect on result type selection.
 * 
 * @param {Object} result - Search result object
 * @param {Array} queryKeywords - Extracted keywords from search query
 * @returns {number} - Relevance score (0-1) - determines result type
 */
function computeRelevanceScore(result, queryKeywords) {
    let score = 0;
    let factors = 0;
    
    // Factor 1: Direct relevance metric from data (base score)
    score += (result.relevance || 0) * 0.6;
    factors += 0.6;
    
    // Factor 2: Category match to query intent
    if (result.category && queryKeywords && queryKeywords.length > 0) {
        const categoryMatch = queryKeywords.some(keyword => 
            result.category.toLowerCase().includes(keyword) || 
            keyword.includes(result.category.toLowerCase())
        );
        if (categoryMatch) {
            score += 0.25;
        }
        factors += 0.25;
    }
    
    // Factor 3: Tag match to query intent
    if (result.tags && queryKeywords && queryKeywords.length > 0) {
        const matchingTags = result.tags.filter(tag => 
            queryKeywords.some(keyword => 
                tag.toLowerCase().includes(keyword) || 
                keyword.includes(tag.toLowerCase())
            )
        );
        const tagMatchRatio = matchingTags.length / Math.max(1, result.tags.length);
        score += tagMatchRatio * 0.15;
        factors += 0.15;
    }
    
    // Normalize score to 0-1 range
    const normalizedScore = factors > 0 ? score / factors : result.relevance || 0;
    return Math.max(0, Math.min(1, normalizedScore));
}

/**
 * Compute personalization score based on user profile and constraints
 * Measures how well the result fits the user's preferences
 * 
 * IMPORTANT: This score (30% weight) ONLY refines ranking within result types.
 * Profile weights boost preferred attributes but CANNOT introduce new result categories.
 * 
 * Examples:
 * - Shopper: Among relevant products, boosts those with high price score & reviews
 * - Student: Among relevant learning materials, boosts simpler explanations
 * - Researcher: Among relevant papers, boosts highly cited & detailed content
 * 
 * @param {Object} result - Search result object
 * @param {string} profile - User profile type (student, shopper, researcher, casual)
 * @param {Object} constraints - User constraints (budget, readingTime, skillLevel)
 * @returns {number} - Personalization score (0-1) - refines ranking within types
 */
function computePersonalizationScore(result, profile, constraints = {}) {
    // Get profile weights for personalization metrics
    const weights = profileWeights[profile];
    if (!weights) {
        return 0.5; // Default middle score for unknown profile
    }
    
    // Calculate reading time score
    const readingTimeScore = getReadingTimeScore(result.readingTime || 15);
    
    // Build personalization metrics (exclude relevance which is handled separately)
    const metrics = {
        simplicity: result.simplicity || 0,
        price: result.price || 0,
        reviews: result.reviews || 0,
        citations: result.citations || 0,
        depth: result.depth || 0,
        recency: result.recency || 0,
        readingTime: readingTimeScore
    };
    
    // Calculate profile-weighted score
    let profileScore = 0;
    let totalWeight = 0;
    
    for (const [metric, weight] of Object.entries(weights)) {
        // Skip relevance metric (it's handled in relevanceScore)
        if (metric === 'relevance' || !metrics.hasOwnProperty(metric)) {
            continue;
        }
        
        if (weight !== 0) {
            profileScore += metrics[metric] * weight;
            totalWeight += Math.abs(weight);
        }
    }
    
    // Normalize profile score
    let normalizedProfileScore = totalWeight > 0 ? profileScore / totalWeight : 0.5;
    
    // Apply constraint adjustments
    const constraintBonus = applyConstraintAdjustments(result, constraints);
    normalizedProfileScore += constraintBonus;
    
    // Clamp to 0-1 range
    return Math.max(0, Math.min(1, normalizedProfileScore));
}

/**
 * Show empty state message when no results match
 */
function showEmptyState() {
    const resultsContainer = document.getElementById('results');
    resultsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: #5f6368;">
            <p style="font-size: 18px; margin-bottom: 10px;">No results found</p>
            <p style="font-size: 14px;">Try adjusting your search terms or relax the constraints.</p>
        </div>
    `;
}

/**
 * Extract keywords from search query
 * @param {string} query - Search query string
 * @returns {Array} - Array of lowercase keywords
 */
function extractKeywords(query) {
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3) // Filter out small words
        .slice(0, 5); // Limit to first 5 keywords
}

/**
 * Filter results by query intent - only include results with matching tags/category
 * @param {Array} results - Search results array
 * @param {string} query - Search query
 * @returns {Array} - Filtered results matching query intent
 */
function filterByQueryIntent(results, query) {
    const keywords = extractKeywords(query);
    
    if (keywords.length === 0) {
        console.log('⚠ No keywords extracted from query, returning all results');
        return results;
    }
    
    console.log(`\n🔍 Query Intent Filter:`);
    console.log(`Keywords: ${keywords.join(', ')}`);
    
    const filteredResults = results.filter(result => {
        // Get all tags for this result (combine category + tags array)
        const resultTags = [
            result.category || '',
            ...(result.tags || [])
        ].map(tag => tag.toLowerCase());
        
        // Check if any keyword matches any tag
        const matches = keywords.some(keyword => 
            resultTags.some(tag => tag.includes(keyword) || keyword.includes(tag))
        );
        
        if (matches) {
            console.log(`✓ "${result.title}" - matches: ${resultTags.join(', ')}`);
        }
        
        return matches;
    });
    
    console.log(`📊 Results: ${filteredResults.length}/${results.length} match query intent\n`);
    
    return filteredResults;
}

/**
 * Get Google brand color for a profile type
 * @param {string} profile - User profile type
 * @returns {Object} - Object with color name and CSS variable
 */
function getProfileColor(profile) {
    const profileColors = {
        student: { name: 'blue', variable: '--google-blue', hex: '#4285F4' },
        shopper: { name: 'green', variable: '--google-green', hex: '#34A853' },
        researcher: { name: 'red', variable: '--google-red', hex: '#EA4335' },
        casual: { name: 'yellow', variable: '--google-yellow', hex: '#FBBC04' }
    };
    
    return profileColors[profile] || profileColors.casual;
}

/**
 * Get CSS class name for profile-specific styling
 * @param {string} profile - User profile type
 * @returns {string} - CSS class name
 */
function getProfileClass(profile) {
    return `profile-${profile}`;
}

/**
 * Generate human-readable explanations for why a result ranked well
 * @param {Object} result - The search result object
 * @param {string} profile - User profile type
 * @param {Object} constraints - User constraints
 * @param {number} score - Final score for the result
 * @returns {Array} - Array of explanation strings
 */
/**
 * Generate human-readable explanations based on what actually contributed to the score
 * Only shows reasons that meaningfully contributed to why this result ranked well
 * @param {Object} result - The search result object
 * @param {string} profile - User profile type
 * @param {Object} constraints - User constraints
 * @param {Array} queryKeywords - Keywords extracted from query
 * @param {number} relevanceScore - Computed relevance score (0-1)
 * @param {number} personalizationScore - Computed personalization score (0-1)
 * @returns {Array} - Array of explanation strings
 */
function generateExplanations(result, profile, constraints, queryKeywords, relevanceScore, personalizationScore) {
    const explanations = [];
    const weights = profileWeights[profile];
    const scoreContributionThreshold = 0.6; // Only explain factors >= this threshold
    
    // ===== RELEVANCE REASONS (70% of score) =====
    
    // 1. Category Match - Strong indicator this is the right type
    if (result.category && queryKeywords && queryKeywords.length > 0) {
        const categoryMatch = queryKeywords.some(keyword => 
            result.category.toLowerCase().includes(keyword) || 
            keyword.includes(result.category.toLowerCase())
        );
        if (categoryMatch) {
            explanations.push(`✓ Matches "${result.category}" result type you're looking for`);
        }
    }
    
    // 2. Tag Matches - Shows specific relevance
    if (result.tags && queryKeywords && queryKeywords.length > 0) {
        const matchingTags = result.tags.filter(tag => 
            queryKeywords.some(keyword => 
                tag.toLowerCase().includes(keyword) || 
                keyword.includes(tag.toLowerCase())
            )
        );
        if (matchingTags.length > 0) {
            const tagList = matchingTags.slice(0, 3).join(', ');
            explanations.push(`✓ Matches your interests: ${tagList}${matchingTags.length > 3 ? ' ...' : ''}`);
        }
    }
    
    // 3. High Relevance Score - Only show if score is high
    if (relevanceScore >= scoreContributionThreshold) {
        explanations.push(`✓ Highly relevant to your search (${Math.round(relevanceScore * 100)}% match)`);
    }
    
    // ===== PERSONALIZATION REASONS (30% of score) =====
    
    // Get list of factors that contributed to personalization
    const contributingFactors = [];
    
    if (weights.simplicity > 0.2 && result.simplicity > scoreContributionThreshold) {
        contributingFactors.push({ metric: 'simplicity', value: result.simplicity, text: 'Easy to understand' });
    }
    
    if (weights.price > 0.2 && result.price > scoreContributionThreshold) {
        contributingFactors.push({ metric: 'price', value: result.price, text: 'Affordable' });
    }
    
    if (weights.reviews > 0.2 && result.reviews > scoreContributionThreshold) {
        contributingFactors.push({ metric: 'reviews', value: result.reviews, text: 'Highly reviewed' });
    }
    
    if (weights.citations > 0.2 && result.citations > scoreContributionThreshold) {
        contributingFactors.push({ metric: 'citations', value: result.citations, text: 'Highly cited' });
    }
    
    if (weights.depth > 0.2 && result.depth > scoreContributionThreshold) {
        contributingFactors.push({ metric: 'depth', value: result.depth, text: 'Comprehensive and detailed' });
    }
    
    if (weights.recency > 0.15 && result.recency > scoreContributionThreshold) {
        contributingFactors.push({ metric: 'recency', value: result.recency, text: 'Recently updated' });
    }
    
    // 4. Reading Time Constraint - Only show if it helped
    if (constraints.readingTime) {
        const maxTime = parseInt(constraints.readingTime);
        if (result.readingTime && result.readingTime <= maxTime) {
            explanations.push(`✓ Fits your ${maxTime}-minute reading time limit (${result.readingTime} min)`);
        } else if (result.readingTime && result.readingTime > maxTime) {
            // Don't explain why it didn't fit
        }
    }
    
    // 5. Budget Constraint - Only show if it helped
    if (constraints.budget && result.price > scoreContributionThreshold) {
        explanations.push('✓ Respects your budget constraint');
    }
    
    // 6. Skill Level Constraint - Only show if it helped
    if (constraints.skillLevel) {
        if (constraints.skillLevel === 'beginner' && result.simplicity > scoreContributionThreshold) {
            explanations.push('✓ Appropriate for beginner level');
        } else if (constraints.skillLevel === 'intermediate' && result.depth > 0.4) {
            explanations.push('✓ Good depth for intermediate learners');
        } else if (constraints.skillLevel === 'advanced' && result.depth > scoreContributionThreshold) {
            explanations.push('✓ Sufficient depth for advanced learners');
        }
    }
    
    // 7. Show top profile-matching factors (max 2)
    if (contributingFactors.length > 0) {
        const topFactors = contributingFactors.slice(0, 2);
        const factorTexts = topFactors.map(f => f.text).join(', ');
        explanations.push(`✓ ${profile.charAt(0).toUpperCase() + profile.slice(1)} preference: ${factorTexts}`);
    }
    
    // If no specific explanations, provide generic but truthful message
    if (explanations.length === 0) {
        if (relevanceScore >= 0.5) {
            explanations.push(`✓ Relevant match (${Math.round(relevanceScore * 100)}%)`);
        } else {
            explanations.push('✓ Best available match for your search');
        }
    }
    
    return explanations;
}

/**
 * Score a single result based on constraints
 * @param {Object} result - The search result object
 * @param {Object} constraints - User constraints (budget, readingTime, skillLevel)
 * @returns {number} - Constraint adjustment bonus/penalty (-0.15 to +0.15)
 */
function applyConstraintAdjustments(result, constraints) {
    let adjustment = 0;
    const maxAdjustment = 0.15; // Maximum impact of constraints
    
    // Budget constraint: prefer results with good price match
    if (constraints.budget) {
        // If user has budget constraint, reward results with high price score
        // (price score 1.0 = free/cheap, 0.0 = expensive)
        adjustment += result.price * (maxAdjustment * 0.4);
    }
    
    // Reading time constraint: prefer simpler, shorter content
    if (constraints.readingTime) {
        const maxReadingTime = parseInt(constraints.readingTime);
        const resultReadingTime = result.readingTime || 15;
        
        // Bonus for content within reading time limit
        if (resultReadingTime <= maxReadingTime) {
            adjustment += maxAdjustment * 0.3;
        } else {
            // Penalty for content exceeding reading time
            adjustment -= (maxAdjustment * 0.2);
        }
        
        // Bonus for simplicity when time-constrained
        adjustment += result.simplicity * (maxAdjustment * 0.1);
    }
    
    // Skill level constraint: adjust based on learner level
    if (constraints.skillLevel) {
        if (constraints.skillLevel === 'beginner') {
            // Beginners prefer simpler, more accessible content
            adjustment += result.simplicity * (maxAdjustment * 0.5);
            // Slightly penalize very deep content
            adjustment -= result.depth * (maxAdjustment * 0.1);
        } else if (constraints.skillLevel === 'intermediate') {
            // Intermediate: balanced approach, slight bias to depth
            adjustment += result.depth * (maxAdjustment * 0.15);
        } else if (constraints.skillLevel === 'advanced') {
            // Advanced users prefer depth and citations
            adjustment += result.depth * (maxAdjustment * 0.3);
            adjustment += result.citations * (maxAdjustment * 0.2);
            // Less concern for simplicity
            adjustment -= result.simplicity * (maxAdjustment * 0.05);
        }
    }
    
    // Clamp adjustment to acceptable range
    return Math.max(-maxAdjustment, Math.min(maxAdjustment, adjustment));
}

/**
 * Score a single search result based on user profile and constraints
 * Uses two-factor scoring: 70% relevance + 30% personalization
 * 
 * RESULT TYPE DETERMINATION:
 * The relevance score (70%) determines if a result is shown at all.
 * Profile weights (30%) only affect ranking ORDER within relevant result types.
 * 
 * Example:
 * - Query: "machine learning courses"
 * - Relevance 70%: Must have "course" category → Courses rank high, papers filtered
 * - Personalization 30%: Profile adjusts order → Student gets simpler course first
 * - Profile CANNOT show papers just because researcher prefers citations
 * 
 * @param {Object} result - The search result object
 * @param {string} profile - User profile type (student, shopper, researcher, casual)
 * @param {Object} context - Context with query and constraints {query, queryKeywords, constraints}
 * @returns {number} - Final weighted score (higher is better, 0-1)
 */
function scoreResult(result, profile, context = {}) {
    // Extract query keywords for relevance calculation
    const queryKeywords = context.queryKeywords || extractKeywords(context.query || '');
    const constraints = context.constraints || {};
    
    // Compute relevance score (keyword + category matching)
    const relevanceScore = computeRelevanceScore(result, queryKeywords);
    
    // Compute personalization score (profile + constraints)
    const personalizationScore = computePersonalizationScore(result, profile, constraints);
    
    // Combine scores: 70% relevance, 30% personalization
    // This ensures relevance always has higher weight
    const finalScore = (0.7 * relevanceScore) + (0.3 * personalizationScore);
    
    // Debug logging (enable by setting to true)
    if (false) {
        console.log(`  ${result.title}:`);
        console.log(`    Relevance: ${relevanceScore.toFixed(3)} (${Math.round(relevanceScore * 100)}%)`);
        console.log(`    Personalization: ${personalizationScore.toFixed(3)} (${Math.round(personalizationScore * 100)}%)`);
        console.log(`    Final: ${finalScore.toFixed(3)} (${Math.round(finalScore * 100)}%)`);
    }
    
    return finalScore;
}

/**
 * Load mock search results from data/results.json
 */
async function loadSearchResults() {
    try {
        const response = await fetch('data/results.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        mockResults = data.results;
        console.log('✓ Search results loaded:', mockResults);
        return mockResults;
    } catch (error) {
        console.error('✗ Error loading search results:', error);
        resultsContainer.innerHTML = '<div class="empty-state"><p>Error loading results. Please check the data file.</p></div>';
    }
}

/**
 * Collect user search input
 */
function getSearchInput() {
    return searchInput.value.trim();
}

/**
 * Collect selected user profile
 */
function getUserProfile() {
    return profileSelect.value;
}

/**
 * Collect optional constraints
 */
function getConstraints() {
    const budgetAmount = budgetInput.value.trim();
    const currency = currencySelect.value;
    const readingTime = readingTimeInput.value;
    const skillLevel = skillLevelInput.value;
    
    return {
        budget: budgetAmount ? true : false,  // Budget is a boolean flag - true if any amount entered
        budgetAmount: budgetAmount ? parseFloat(budgetAmount) : null,  // Convert to number
        currency: budgetAmount ? currency : null,  // Include currency code if budget specified
        readingTime: readingTime ? parseInt(readingTime) : null,  // Convert to number
        skillLevel: skillLevel || null  // Keep as string or null
    };
}

/**
 * Validate search input
 */
function isValidSearch() {
    const query = getSearchInput();
    if (!query) {
        console.warn('⚠ Search query is empty');
        return false;
    }
    return true;
}

/**
 * Display loading state
 */
function showLoadingState() {
    resultsContainer.innerHTML = '<div class="loading">Searching...</div>';
}

/**
 * Display empty results state
 */
function showEmptyState() {
    resultsContainer.innerHTML = '<div class="empty-state"><p>No results found. Try a different search.</p></div>';
}

/**
 * Collect all user inputs and call /api/search
 */
async function handleSearch() {
    console.log('\n=== SEARCH INITIATED ===');
    
    // Validate input
    if (!isValidSearch()) {
        console.error('Search validation failed');
        return;
    }

    // Collect all inputs
    const searchQuery = getSearchInput();
    const userProfile = getUserProfile();
    const constraints = getConstraints();

    // Log collected data
    console.log('📝 Search Query:', searchQuery);
    console.log('👤 User Profile:', userProfile);
    console.log('⚙️ Constraints:', constraints);
    console.log('\n--- Input Summary ---');
    console.table({
        'Query': searchQuery,
        'Profile': userProfile,
        'Budget': constraints.budget ? `${constraints.currency} ${constraints.budgetAmount}` : 'Not set',
        'Reading Time': constraints.readingTime ? `${constraints.readingTime} min` : 'Not set',
        'Skill Level': constraints.skillLevel || 'Not set'
    });

    // Show loading state
    showLoadingState();

    try {
        // Build query parameters
        const params = new URLSearchParams();
        params.append('q', searchQuery);
        params.append('profile', userProfile);
        
        if (constraints.budget && constraints.budgetAmount) {
            params.append('budget', 'true');
            params.append('budgetAmount', constraints.budgetAmount);
            params.append('currency', constraints.currency);
        }
        if (constraints.readingTime) {
            params.append('readingTime', constraints.readingTime);
        }
        if (constraints.skillLevel) {
            params.append('skillLevel', constraints.skillLevel);
        }

        // Call API
        console.log(`🌐 Fetching from /api/search?${params.toString()}`);
        const response = await fetch(`/api/search?${params.toString()}`);

        // Handle HTTP errors
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Parse response
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Search failed');
        }

        console.log(`✅ API Response: ${data.totalResults} results`);
        console.log('📊 Results:', data.results);

        // Store search context for profile-switching demo
        lastSearchContext = {
            query: searchQuery,
            profile: userProfile,
            constraints: constraints,
            timestamp: data.metadata.searchTime,
            apiSource: data.metadata.apiSource
        };

        // Display results (API results already have scores and explanations)
        if (data.totalResults === 0) {
            showEmptyState();
        } else {
            displayResults(data.results);
        }

    } catch (error) {
        console.error('❌ Search Error:', error.message);
        showErrorState(error.message);
    }
}

/**
 * Display error state with friendly message
 */
function showErrorState(errorMessage) {
    const errorText = errorMessage.includes('fetch') 
        ? 'Unable to connect to server. Make sure the API is running on port 8000.'
        : errorMessage;
    
    resultsContainer.innerHTML = `
        <div class="error-state">
            <p style="font-size: 18px; color: #d32f2f; margin-bottom: 10px;">❌ Search Error</p>
            <p style="color: #666; margin-bottom: 15px;">${errorText}</p>
            <p style="color: #999; font-size: 13px;">Try adjusting your query or check the API status.</p>
        </div>
    `;
}

/**
 * Handle Enter key press in search input
 */
function handleEnterKey(event) {
    if (event.key === 'Enter') {
        handleSearch();
    }
}

/**
 * Rank results based on user profile and constraints, then display them
 * @param {Object} searchContext - Contains query, profile, constraints, and results
 */
function rankAndDisplayResults(searchContext) {
    const { results, profile, constraints, query } = searchContext;
    
    // Step 1: Filter results by query intent
    const intentFilteredResults = filterByQueryIntent(results, query);
    
    if (intentFilteredResults.length === 0) {
        console.log('✗ No results match the search query intent');
        showEmptyState();
        return;
    }
    
    // Step 2: Extract query keywords once for efficiency
    const queryKeywords = extractKeywords(query);
    
    // Step 3: Score each result with profile AND constraints
    const scoredResults = intentFilteredResults.map(result => {
        const scoreContext = {
            query,
            queryKeywords,
            constraints
        };
        // Compute individual scores for better explanation generation
        const relevanceScore = computeRelevanceScore(result, queryKeywords);
        const personalizationScore = computePersonalizationScore(result, profile, constraints);
        const finalScore = (0.7 * relevanceScore) + (0.3 * personalizationScore);
        
        return {
            ...result,
            score: finalScore,
            profile: profile,
            explanations: generateExplanations(result, profile, constraints, queryKeywords, relevanceScore, personalizationScore)
        };
    });
    
    // Step 4: Sort by score (highest first)
    const allRankedResults = scoredResults.sort((a, b) => b.score - a.score);
    
    // Step 5: Keep only top 3 results
    const topResults = allRankedResults.slice(0, 3);
    
    // Log ranking details
    console.log(`\n=== RANKING RESULTS (${profile.toUpperCase()}) ===`);
    console.log(`Scoring: 70% Relevance + 30% Personalization`);
    console.log(`Profile Weights (Personalization):`, profileWeights[profile]);
    
    // Log constraint info if any
    const hasConstraints = Object.values(constraints).some(val => val);
    if (hasConstraints) {
        console.log(`Constraints Applied:`, constraints);
    }
    
    console.log(`\n--- Top 3 Ranked Results (out of ${allRankedResults.length}) ---`);
    
    topResults.forEach((result, index) => {
        console.log(`${index + 1}. ${result.title}`);
        console.log(`   Score: ${result.score.toFixed(3)} (${Math.round(result.score * 100)}%)`);
        console.log(`   URL: ${result.url}`);
        console.log(`   Why this result:`, result.explanations);
    });
    
    console.log('\n✨ Results ranked and displayed\n');
    
    // Display results
    if (topResults.length === 0) {
        showEmptyState();
    } else {
        displayResults(topResults);
    }
}

/**
 * Display ranked results as cards
 * @param {Array} rankedResults - Ranked search results
 */
function displayResults(rankedResults) {
    resultsContainer.innerHTML = '';
    
    // Limit to 5 results
    const limitedResults = rankedResults.slice(0, 5);
    
    limitedResults.forEach((result, index) => {
        const resultCard = createResultCard(result, index + 1);
        resultsContainer.appendChild(resultCard);
    });
    
    // Show total results count
    if (rankedResults.length > 5) {
        const countInfo = document.createElement('div');
        countInfo.className = 'results-info';
        countInfo.textContent = `Showing 5 of ${rankedResults.length} results`;
        resultsContainer.appendChild(countInfo);
    }
}

/**
 * Create a result card DOM element
 * @param {Object} result - Search result with score and explanations
 * @param {number} position - Position in ranking
 * @returns {HTMLElement} - Result card element
 */
function createResultCard(result, position) {
    const card = document.createElement('div');
    card.className = 'result-card-wrapper';
    
    // Apply profile-specific CSS class for color branding
    const profileClass = getProfileClass(result.profile);
    const profileColor = getProfileColor(result.profile);
    
    console.log(`Card: ${result.title} → Profile: ${result.profile} → Color: ${profileColor.name}`);
    
    // Get decision label and colors
    const decisionLabel = getDecisionLabel(result, result.profile);
    const labelColors = getLabelColors(decisionLabel.category);
    
    // Calculate trust score and determine badge
    const trustScore = Math.round(result.reviews * 100);
    const trustBadge = getTrustBadge(trustScore);
    
    // Build explanations HTML
    const explanationsHTML = result.explanations && result.explanations.length > 0
        ? `
        <div class="why-match-section">
            <span class="why-match-title">Why this matches:</span>
            <ul class="why-match-list">
                ${result.explanations.map(exp => `<li>${exp}</li>`).join('')}
            </ul>
        </div>
        `
        : '';
    
    card.innerHTML = `
        <div class="result-card ${profileClass}">
            <!-- Position Indicator -->
            <div class="result-position">${position}</div>
            
            <!-- Main Content -->
            <div class="result-content">
                <!-- Title (Clickable) -->
                <a href="${result.url}" target="_blank" class="result-title-link">
                    <h3 class="result-title">${result.title}</h3>
                </a>
                
                <!-- URL -->
                <div class="result-url">🔗 ${result.url}</div>
                
                <!-- Description -->
                <p class="result-description">${result.summary}</p>
                
                <!-- Trust Badges Row -->
                <div class="trust-badges-row">
                    <div class="trust-badge ${trustBadge.class}">
                        <span class="badge-icon">${trustBadge.icon}</span>
                        <span class="badge-text">${trustScore}% Trusted</span>
                    </div>
                    <div class="metadata-inline">
                        <span class="meta-item">⏱️ ${result.readingTime}m</span>
                        <span class="meta-item">💰 ${getPriceLabel(result.price)}</span>
                        <span class="meta-item">📚 ${getDepthLabel(result.depth)}</span>
                    </div>
                </div>
                
                <!-- Why This Result Matches -->
                ${explanationsHTML}
                
                <!-- Decision Badge -->
                <div class="decision-badge-container">
                    <span class="decision-label" style="background-color: ${labelColors.bg}; color: ${labelColors.text};">
                        ${decisionLabel.label}
                    </span>
                </div>
            </div>
        </div>
    `;
    
    return card;
}

/**
 * Get trust badge info based on trust score
 * @param {number} trustScore - Trust score 0-100
 * @returns {Object} - Badge class and icon
 */
function getTrustBadge(trustScore) {
    if (trustScore >= 85) {
        return { class: 'badge-excellent', icon: '⭐⭐' };
    } else if (trustScore >= 70) {
        return { class: 'badge-good', icon: '⭐' };
    } else if (trustScore >= 50) {
        return { class: 'badge-fair', icon: '◐' };
    } else {
        return { class: 'badge-low', icon: '◑' };
    }
}

/**
 * Get human-readable price label
 * @param {number} price - Price score 0-1
 * @returns {string} - Price label
 */
function getPriceLabel(price) {
    if (price >= 0.8) return 'Free/Cheap';
    if (price >= 0.6) return 'Affordable';
    if (price >= 0.4) return 'Moderate Cost';
    return 'Expensive';
}

/**
 * Get human-readable depth label
 * @param {number} depth - Depth score 0-1
 * @returns {string} - Depth label
 */
function getDepthLabel(depth) {
    if (depth >= 0.8) return 'Very Deep';
    if (depth >= 0.6) return 'Comprehensive';
    if (depth >= 0.4) return 'Moderate Depth';
    return 'Surface Level';
}

/**
 * Generate a decision-focused label for the result
 * @param {Object} result - The search result
 * @param {string} profile - User profile type
 * @returns {Object} - Object with label text and category
 */
function getDecisionLabel(result, profile) {
    // Profile-based decisions
    if (profile === 'student') {
        if (result.simplicity > 0.8 && result.reviews > 0.75) {
            return { label: 'Best for Learning', category: 'student' };
        }
        if (result.simplicity > 0.75) {
            return { label: 'Easy to Understand', category: 'student' };
        }
    }
    
    if (profile === 'shopper') {
        if (result.price > 0.7 && result.reviews > 0.8) {
            return { label: 'Best Budget Choice', category: 'shopper' };
        }
        if (result.reviews > 0.85) {
            return { label: 'Highly Trusted', category: 'shopper' };
        }
    }
    
    if (profile === 'researcher') {
        if (result.citations > 0.85 && result.depth > 0.8) {
            return { label: 'Best for Research', category: 'researcher' };
        }
        if (result.citations > 0.8) {
            return { label: 'Academically Rigorous', category: 'researcher' };
        }
    }
    
    if (profile === 'casual') {
        if (result.recency > 0.85 && result.simplicity > 0.75) {
            return { label: 'Current & Easy Read', category: 'casual' };
        }
        if (result.recency > 0.8) {
            return { label: 'Fresh & Recent', category: 'casual' };
        }
    }
    
    // Universal high-quality label
    if (result.relevance > 0.9 && result.score > 0.8) {
        return { label: 'Top Match', category: 'universal' };
    }
    
    return { label: 'Recommended', category: 'universal' };
}

/**
 * Get color for decision label badge
 * @param {string} category - Label category
 * @returns {Object} - Object with background and text colors
 */
function getLabelColors(category) {
    const colors = {
        student: { bg: '#dbeafe', text: '#0c4a6e' },      // Light blue
        shopper: { bg: '#fce7f3', text: '#831843' },       // Light pink
        researcher: { bg: '#e0e7ff', text: '#3730a3' },    // Light indigo
        casual: { bg: '#dcfce7', text: '#166534' },        // Light green
        universal: { bg: '#f3f4f6', text: '#374151' }      // Light gray
    };
    return colors[category] || colors.universal;
}

/**
 * Handle profile change - re-rank and re-display results
 */
function handleProfileChange() {
    if (!lastSearchContext) {
        console.log('ℹ No previous search to re-rank');
        return;
    }
    
    const newProfile = getUserProfile();
    const previousProfile = lastSearchContext.profile;
    
    if (newProfile === previousProfile) {
        console.log('ℹ Same profile selected, no re-ranking needed');
        return;
    }
    
    console.log(`\n🔄 Profile switched from "${previousProfile}" to "${newProfile}"`);
    
    // Update search context with new profile
    lastSearchContext.profile = newProfile;
    
    // Re-rank and display
    rankAndDisplayResults(lastSearchContext);
}

/**
 * Initialize event listeners
 */
function initializeEventListeners() {
    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', handleEnterKey);
    profileSelect.addEventListener('change', handleProfileChange);
    
    console.log('✓ Event listeners initialized');
}

/**
 * Initialize the application
 */
async function initializeApp() {
    console.log('🚀 Initializing Decision-Aware Search...');
    
    // Load mock data
    await loadSearchResults();
    
    // Set up event listeners
    initializeEventListeners();
    
    console.log('✓ Application ready\n');
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);
