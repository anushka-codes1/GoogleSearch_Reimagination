/**
 * Ranking Engine Module
 * 
 * Core ranking logic extracted for use by both client-side and server-side code.
 * Provides pure functions for scoring and ranking search results based on profile and constraints.
 */

const fs = require('fs');
const path = require('path');

// Cache for loaded mock results
let mockResults = null;

/**
 * Profile-based ranking weights
 * Maps user profiles to metric weights (0-1 scale)
 * 
 * IMPORTANT: These weights ONLY affect personalization scoring (30% of final score)
 * They do NOT change result categories or introduce unrelated result types.
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
        price: 0.35,           // Cost is primary concern
        reviews: 0.30,         // Trust other buyers
        relevance: 0.20,       // Must match what they want
        simplicity: 0.10,      // Easy purchasing info
        recency: 0.05,         // Recent prices/availability
        depth: 0.00,
        citations: 0.00,
        readingTime: 0.00
    },
    researcher: {
        citations: 0.35,       // Academic impact matters most
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
 * Get profile weights
 */
function getProfileWeights() {
    return profileWeights;
}

/**
 * Load mock results from data/results.json
 */
function getMockResults() {
    if (!mockResults) {
        try {
            const dataPath = path.join(__dirname, 'data', 'results.json');
            const data = fs.readFileSync(dataPath, 'utf8');
            mockResults = JSON.parse(data).results;
            console.log(`✓ Loaded ${mockResults.length} mock results`);
        } catch (error) {
            console.error('✗ Error loading mock results:', error.message);
            mockResults = getDefaultResults();
        }
    }
    return mockResults;
}

/**
 * Get default fallback results if data file not found
 */
function getDefaultResults() {
    return [
        {
            id: 1,
            title: "Comprehensive Guide to Machine Learning",
            url: "https://example.com/ml-guide",
            summary: "A complete introduction to machine learning concepts",
            category: "course",
            tags: ["machine learning", "course", "tutorial", "learning"],
            relevance: 0.95,
            simplicity: 0.85,
            price: 0.3,
            reviews: 0.92,
            citations: 0.7,
            depth: 0.88,
            recency: 0.75,
            readingTime: 20
        }
    ];
}

/**
 * Calculate normalized reading time penalty/bonus
 */
function getReadingTimeScore(readingTime) {
    const maxTime = 60;
    const minTime = 5;
    
    if (readingTime <= minTime) return 1.0;
    if (readingTime >= maxTime) return 0.0;
    
    return 1.0 - ((readingTime - minTime) / (maxTime - minTime));
}

/**
 * Extract keywords from search query
 */
function extractKeywords(query) {
    return query
        .toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 3)
        .slice(0, 5);
}

/**
 * Compute relevance score based on keyword/category matching
 * Measures how well the result matches the search query intent (70% weight)
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
 * Measures how well the result fits the user's preferences (30% weight)
 */
function computePersonalizationScore(result, profile, constraints = {}) {
    const weights = profileWeights[profile];
    if (!weights) {
        return 0.5;
    }
    
    const readingTimeScore = getReadingTimeScore(result.readingTime || 15);
    
    const metrics = {
        simplicity: result.simplicity || 0,
        price: result.price || 0,
        reviews: result.reviews || 0,
        citations: result.citations || 0,
        depth: result.depth || 0,
        recency: result.recency || 0,
        readingTime: readingTimeScore
    };
    
    let profileScore = 0;
    let totalWeight = 0;
    
    for (const [metric, weight] of Object.entries(weights)) {
        if (metric === 'relevance' || !metrics.hasOwnProperty(metric)) {
            continue;
        }
        
        if (weight !== 0) {
            profileScore += metrics[metric] * weight;
            totalWeight += Math.abs(weight);
        }
    }
    
    let normalizedProfileScore = totalWeight > 0 ? profileScore / totalWeight : 0.5;
    
    // Apply constraint adjustments
    const constraintBonus = applyConstraintAdjustments(result, constraints);
    normalizedProfileScore += constraintBonus;
    
    return Math.max(0, Math.min(1, normalizedProfileScore));
}

/**
 * Apply constraint adjustments to personalization score
 * Constraints reduce scores but never remove results completely
 * 
 * Budget: Down-ranks expensive results (price score 0.0)
 * Reading Time: Down-ranks long articles if constraint is tight
 * Skill Level: Down-ranks content mismatch (too advanced for beginners, etc.)
 * 
 * Adjustments range from -0.25 (severe penalty) to +0.15 (bonus)
 */
function applyConstraintAdjustments(result, constraints) {
    let adjustment = 0;
    const maxPenalty = -0.25;    // Maximum penalty for constraint violations
    const maxBonus = 0.15;       // Maximum bonus for meeting constraints
    
    // ===== BUDGET CONSTRAINT =====
    // Down-rank expensive items (low price scores) when budget is a concern
    if (constraints.budget) {
        const priceScore = result.price || 0;
        // Price score 1.0 = free/cheap (bonus), 0.0 = expensive (penalty)
        // Penalty for expensive items: -0.25 × (1 - priceScore)
        const budgetPenalty = (1 - priceScore) * maxPenalty * 0.8;
        adjustment += budgetPenalty;
    }
    
    // ===== READING TIME CONSTRAINT =====
    // Down-rank long articles when time-constrained
    if (constraints.readingTime) {
        const maxReadingTime = parseInt(constraints.readingTime);
        const resultReadingTime = result.readingTime || 15;
        
        // Bonus for content within reading time
        if (resultReadingTime <= maxReadingTime) {
            adjustment += maxBonus * 0.4;
        } else {
            // Penalty for long content: proportional to how much it exceeds limit
            const overageRatio = Math.min(1, (resultReadingTime - maxReadingTime) / maxReadingTime);
            const readingTimePenalty = overageRatio * maxPenalty * 0.5;
            adjustment += readingTimePenalty;
        }
        
        // Additional bonus for simple content when time-constrained
        adjustment += result.simplicity * (maxBonus * 0.15);
    }
    
    // ===== SKILL LEVEL CONSTRAINT =====
    // Down-rank content mismatch for skill level
    if (constraints.skillLevel) {
        if (constraints.skillLevel === 'beginner') {
            // Boost simple content
            adjustment += result.simplicity * (maxBonus * 0.6);
            
            // Penalize very advanced/deep content for beginners
            // Penalty: -0.20 × (depth score)
            const advancedPenalty = result.depth * maxPenalty * 0.5;
            adjustment += advancedPenalty;
        } 
        else if (constraints.skillLevel === 'intermediate') {
            // Intermediate learners prefer moderate depth
            const depthOptimal = result.depth > 0.3 ? result.depth : 0.3;
            adjustment += depthOptimal * (maxBonus * 0.2);
        } 
        else if (constraints.skillLevel === 'advanced') {
            // Advanced users prefer depth and citations
            adjustment += result.depth * (maxBonus * 0.4);
            adjustment += result.citations * (maxBonus * 0.3);
            
            // Slightly penalize overly simple content for advanced users
            const simplePenalty = (1 - result.depth) * maxPenalty * 0.1;
            adjustment += simplePenalty;
        }
    }
    
    // Clamp adjustment to range [-0.25, +0.15]
    // Penalties can be stronger than bonuses to enforce constraints
    return Math.max(maxPenalty, Math.min(maxBonus, adjustment));
}

/**
 * Filter results by query intent
 */
function filterByQueryIntent(results, query) {
    const keywords = extractKeywords(query);
    
    if (keywords.length === 0) {
        return results;
    }
    
    return results.filter(result => {
        const resultTags = [
            result.category || '',
            ...(result.tags || [])
        ].map(tag => tag.toLowerCase());
        
        return keywords.some(keyword => 
            resultTags.some(tag => tag.includes(keyword) || keyword.includes(tag))
        );
    });
}

/**
 * Score a single result using 70% relevance + 30% personalization
 */
function scoreResult(result, profile, context = {}) {
    const queryKeywords = context.queryKeywords || extractKeywords(context.query || '');
    const constraints = context.constraints || {};
    
    const relevanceScore = computeRelevanceScore(result, queryKeywords);
    const personalizationScore = computePersonalizationScore(result, profile, constraints);
    
    // 70% relevance, 30% personalization
    const finalScore = (0.7 * relevanceScore) + (0.3 * personalizationScore);
    
    return finalScore;
}

/**
 * Generate explanations for why a result ranked well
 * Only shows reasons that meaningfully contributed (>= 0.6 threshold)
 */
function generateExplanations(result, profile, constraints, queryKeywords, relevanceScore, personalizationScore) {
    const explanations = [];
    const weights = profileWeights[profile];
    const scoreContributionThreshold = 0.6;
    
    // Category match
    if (result.category && queryKeywords && queryKeywords.length > 0) {
        const categoryMatch = queryKeywords.some(keyword => 
            result.category.toLowerCase().includes(keyword) || 
            keyword.includes(result.category.toLowerCase())
        );
        if (categoryMatch) {
            explanations.push(`✓ Matches "${result.category}" result type you're looking for`);
        }
    }
    
    // Tag matches
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
    
    // High relevance score
    if (relevanceScore >= scoreContributionThreshold) {
        explanations.push(`✓ Highly relevant to your search (${Math.round(relevanceScore * 100)}% match)`);
    }
    
    // Contributing factors
    const contributingFactors = [];
    
    if (weights.simplicity > 0.2 && result.simplicity > scoreContributionThreshold) {
        contributingFactors.push('Easy to understand');
    }
    if (weights.price > 0.2 && result.price > scoreContributionThreshold) {
        contributingFactors.push('Affordable');
    }
    if (weights.reviews > 0.2 && result.reviews > scoreContributionThreshold) {
        contributingFactors.push('Highly reviewed');
    }
    if (weights.citations > 0.2 && result.citations > scoreContributionThreshold) {
        contributingFactors.push('Highly cited');
    }
    if (weights.depth > 0.2 && result.depth > scoreContributionThreshold) {
        contributingFactors.push('Comprehensive and detailed');
    }
    if (weights.recency > 0.15 && result.recency > scoreContributionThreshold) {
        contributingFactors.push('Recently updated');
    }
    
    // Reading time
    if (constraints.readingTime) {
        const maxTime = parseInt(constraints.readingTime);
        if (result.readingTime && result.readingTime <= maxTime) {
            explanations.push(`✓ Fits your ${maxTime}-minute reading time limit (${result.readingTime} min)`);
        }
    }
    
    // Budget
    if (constraints.budget && result.price > scoreContributionThreshold) {
        explanations.push('✓ Respects your budget constraint');
    }
    
    // Skill level
    if (constraints.skillLevel) {
        if (constraints.skillLevel === 'beginner' && result.simplicity > scoreContributionThreshold) {
            explanations.push('✓ Appropriate for beginner level');
        } else if (constraints.skillLevel === 'intermediate' && result.depth > 0.4) {
            explanations.push('✓ Good depth for intermediate learners');
        } else if (constraints.skillLevel === 'advanced' && result.depth > scoreContributionThreshold) {
            explanations.push('✓ Sufficient depth for advanced learners');
        }
    }
    
    // Profile factors (top 2)
    if (contributingFactors.length > 0) {
        const topFactors = contributingFactors.slice(0, 2);
        const factorTexts = topFactors.join(', ');
        const profileName = profile.charAt(0).toUpperCase() + profile.slice(1);
        explanations.push(`✓ ${profileName} preference: ${factorTexts}`);
    }
    
    // Fallback
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
 * Main ranking function
 * Takes a search request and returns ranked results
 * 
 * @param {Object} request - Search request
 *   - query: string (required)
 *   - profile: string (default: 'casual')
 *   - constraints: object (default: {})
 *   - results: array (required)
 * @returns {Array} - Ranked results with scores and explanations
 */
function rankResults(request) {
    const { query, profile = 'casual', constraints = {}, results = [] } = request;
    
    if (!results || results.length === 0) {
        return [];
    }
    
    // Step 1: Filter by query intent
    const intentFilteredResults = filterByQueryIntent(results, query);
    
    if (intentFilteredResults.length === 0) {
        return [];
    }
    
    // Step 2: Extract query keywords
    const queryKeywords = extractKeywords(query);
    
    // Step 3: Score and rank results
    const scoredResults = intentFilteredResults.map(result => {
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
    scoredResults.sort((a, b) => b.score - a.score);
    
    return scoredResults;
}

// Exports
module.exports = {
    rankResults,
    getProfileWeights,
    getMockResults,
    extractKeywords,
    computeRelevanceScore,
    computePersonalizationScore,
    scoreResult,
    generateExplanations,
    filterByQueryIntent
};
