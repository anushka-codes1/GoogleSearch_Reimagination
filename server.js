/**
 * Express API Server for Decision-Aware Search
 * 
 * Provides REST endpoints for searching with profile-based ranking
 * Exposes the ranking logic to both browser and API clients
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files (HTML, CSS, client JS)

// Import ranking logic
const rankingEngine = require('./ranking-engine');

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'Decision-Aware Search API' });
});

/**
 * Main search endpoint
 * 
 * Query Parameters:
 *   q (string, required) - Search query
 *   profile (string, optional) - User profile: student, shopper, researcher, casual (default: casual)
 *   budget (boolean, optional) - Apply budget constraint (default: false)
 *   budgetAmount (number, optional) - Budget amount in specified currency
 *   currency (string, optional) - Currency code: USD, EUR, GBP, INR, JPY, CAD, AUD, SGD, HKD, MXN (default: USD)
 *   readingTime (number, optional) - Max reading time in minutes
 *   skillLevel (string, optional) - Skill level: beginner, intermediate, advanced
 * 
 * Example:
 *   GET /api/search?q=machine+learning&profile=student&budget=true&budgetAmount=50&currency=USD&skillLevel=beginner
 * 
 * Response:
 *   {
 *     success: true,
 *     query: "machine learning",
 *     profile: "student",
 *     totalResults: 5,
 *     results: [
 *       {
 *         id: 1,
 *         title: "...",
 *         url: "...",
 *         summary: "...",
 *         score: 0.92,
 *         explanations: ["...", "..."],
 *         ...
 *       }
 *     ],
 *     metadata: {
 *       searchTime: "2026-01-20T10:30:00Z",
 *       responseTime: 145
 *     }
 *   }
 */
app.get('/api/search', async (req, res) => {
    const startTime = Date.now();
    
    try {
        // Validate required parameters
        const query = req.query.q;
        if (!query || query.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Query parameter "q" is required'
            });
        }

        // Extract and validate optional parameters
        const profile = req.query.profile || 'casual';
        const validProfiles = ['student', 'shopper', 'researcher', 'casual'];
        
        if (!validProfiles.includes(profile)) {
            return res.status(400).json({
                success: false,
                error: `Invalid profile. Must be one of: ${validProfiles.join(', ')}`
            });
        }

        // Parse constraints with currency support
        const constraints = {
            budget: req.query.budget === 'true',
            budgetAmount: req.query.budgetAmount ? parseFloat(req.query.budgetAmount) : null,
            currency: req.query.currency || 'USD',
            readingTime: req.query.readingTime ? parseInt(req.query.readingTime) : null,
            skillLevel: req.query.skillLevel || null
        };

        console.log(`\n📡 API Search Request:`);
        console.log(`   Query: "${query}"`);
        console.log(`   Profile: ${profile}`);
        console.log(`   Constraints:`, constraints);

        // Try live Bing API, fall back to mock results
        let liveResults;
        let apiSource = 'mock';
        try {
            liveResults = await bingSearch(query);
            apiSource = 'bing';
            console.log(`✓ Bing API returned ${liveResults.length} results`);
        } catch (bingError) {
            console.log(`⚠ Bing API failed (${bingError.message}), using mock results`);
            liveResults = [];
        }

        // Use live results if available, otherwise use mock
        const mockResults = rankingEngine.getMockResults();
        const searchResults = liveResults.length ? liveResults : mockResults;

        // Rank results based on profile and constraints
        const rankedResults = rankingEngine.rankResults({
            query,
            profile,
            constraints,
            results: searchResults
        });

        const responseTime = Date.now() - startTime;

        res.json({
            success: true,
            query,
            profile,
            totalResults: rankedResults.length,
            results: rankedResults,
            metadata: {
                searchTime: new Date().toISOString(),
                responseTime: `${responseTime}ms`,
                apiSource
            }
        });

    } catch (error) {
        console.error('❌ Search API Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Search endpoint that accepts POST for more complex queries
 * 
 * Request Body:
 *   {
 *     query: "machine learning",
 *     profile: "student",
 *     constraints: {
 *       budget: true,
 *       budgetAmount: 50,
 *       currency: "USD",
 *       readingTime: 20,
 *       skillLevel: "beginner"
 *     }
 *   }
 */
app.post('/api/search', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { query, profile = 'casual', constraints = {} } = req.body;

        if (!query || query.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Query is required in request body'
            });
        }

        const validProfiles = ['student', 'shopper', 'researcher', 'casual'];
        if (!validProfiles.includes(profile)) {
            return res.status(400).json({
                success: false,
                error: `Invalid profile. Must be one of: ${validProfiles.join(', ')}`
            });
        }

        // Ensure constraints have currency info
        const constraintsWithCurrency = {
            ...constraints,
            currency: constraints.currency || 'USD'
        };

        console.log(`\n📡 POST Search Request:`);
        console.log(`   Query: "${query}"`);
        console.log(`   Profile: ${profile}`);
        console.log(`   Constraints:`, constraintsWithCurrency);

        // Try live Bing API, fall back to mock results
        let liveResults;
        let apiSource = 'mock';
        try {
            liveResults = await bingSearch(query);
            apiSource = 'bing';
            console.log(`✓ Bing API returned ${liveResults.length} results`);
        } catch (bingError) {
            console.log(`⚠ Bing API failed, using mock results`);
            liveResults = [];
        }

        // Use live results if available, otherwise use mock
        const mockResults = rankingEngine.getMockResults();
        const searchResults = liveResults.length ? liveResults : mockResults;

        // Rank results based on profile and constraints
        const rankedResults = rankingEngine.rankResults({
            query,
            profile,
            constraints: constraintsWithCurrency,
            results: searchResults
        });

        const responseTime = Date.now() - startTime;

        res.json({
            success: true,
            query,
            profile,
            totalResults: rankedResults.length,
            results: rankedResults,
            metadata: {
                searchTime: new Date().toISOString(),
                responseTime: `${responseTime}ms`,
                apiSource
            }
        });

    } catch (error) {
        console.error('❌ POST Search API Error:', error.message);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * Get available profiles and their descriptions
 */
app.get('/api/profiles', (req, res) => {
    res.json({
        profiles: {
            student: {
                description: 'Optimize for learning: simplicity, recency, and trustworthiness',
                weights: rankingEngine.getProfileWeights().student
            },
            shopper: {
                description: 'Optimize for purchasing: price, reviews, and relevant products',
                weights: rankingEngine.getProfileWeights().shopper
            },
            researcher: {
                description: 'Optimize for research: citations, depth, and academic credibility',
                weights: rankingEngine.getProfileWeights().researcher
            },
            casual: {
                description: 'General purpose: relevance, recency, and quick reads',
                weights: rankingEngine.getProfileWeights().casual
            }
        }
    });
});

/**
 * Get metrics used for ranking
 */
app.get('/api/metrics', (req, res) => {
    res.json({
        metrics: [
            { name: 'relevance', description: 'How well the result matches the search query', weight: 0.7 },
            { name: 'simplicity', description: 'Ease of understanding', weight: 'profile-dependent' },
            { name: 'price', description: 'Cost factor', weight: 'profile-dependent' },
            { name: 'reviews', description: 'Trustworthiness and credibility', weight: 'profile-dependent' },
            { name: 'citations', description: 'Academic impact and citations', weight: 'profile-dependent' },
            { name: 'depth', description: 'Comprehensiveness of content', weight: 'profile-dependent' },
            { name: 'recency', description: 'How current the content is', weight: 'profile-dependent' },
            { name: 'readingTime', description: 'Time required to consume', weight: 'profile-dependent' }
        ],
        notes: 'Final score = (0.7 × relevance) + (0.3 × personalization based on profile)'
    });
});

/**
 * Bing Search API integration using native fetch
 * Transforms Bing results to our standardized format
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum results to return (default 5)
 * @returns {Promise<Array>} - Array of search results
 */
async function bingSearch(query, maxResults = 5) {
    try {
        const endpoint = process.env.BING_ENDPOINT;
        const apiKey = process.env.BING_API_KEY;

        if (!endpoint || !apiKey) {
            console.log('⚠ BING_ENDPOINT or BING_API_KEY not configured, using fallback');
            throw new Error('Bing API credentials not configured');
        }

        const url = `${endpoint}?q=${encodeURIComponent(query)}&count=${maxResults}`;
        const response = await fetch(url, {
            headers: {
                'Ocp-Apim-Subscription-Key': apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`Bing API returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`✓ Bing API returned ${data.webPages?.value?.length || 0} results for "${query}"`);

        // Transform Bing results to our standardized format
        return (data.webPages?.value || []).map((item, index) => ({
            id: index + 1,
            title: item.name,
            url: item.url,
            summary: item.snippet,
            category: inferCategory(item),
            tags: inferTags(item),
            relevance: 0.8 + Math.random() * 0.2,
            simplicity: 0.7 + Math.random() * 0.3,
            price: 0.5 + Math.random() * 0.5,
            reviews: 0.6 + Math.random() * 0.4,
            citations: 0.3 + Math.random() * 0.4,
            depth: 0.6 + Math.random() * 0.4,
            recency: 0.7 + Math.random() * 0.3,
            readingTime: 5 + Math.floor(Math.random() * 40)
        }));

    } catch (error) {
        console.error('✗ Bing API error:', error.message);
        throw error;
    }
}

/**
 * Infer content category from URL
 */
function inferCategory(item) {
    const url = (item.url || '').toLowerCase();
    
    if (url.includes('course') || url.includes('udemy') || url.includes('coursera')) return 'course';
    if (url.includes('book') || url.includes('amazon') || url.includes('goodreads')) return 'book';
    if (url.includes('paper') || url.includes('arxiv') || url.includes('scholar')) return 'research';
    if (url.includes('github') || url.includes('documentation')) return 'code';
    if (url.includes('product') || url.includes('shop')) return 'product';
    if (url.includes('news') || url.includes('blog')) return 'article';
    
    return 'article'; // Default
}

/**
 * Infer relevant tags from content
 */
function inferTags(item) {
    const content = `${item.name || ''} ${item.snippet || ''}`.toLowerCase();
    const tags = [];
    
    // Common tech tags
    const tagKeywords = {
        'machine learning': ['machine learning', 'ml', 'ai', 'artificial intelligence'],
        'python': ['python'],
        'javascript': ['javascript', 'js', 'nodejs', 'node'],
        'web development': ['web', 'html', 'css', 'react', 'vue'],
        'data science': ['data science', 'data analytics', 'analytics'],
        'tutorial': ['tutorial', 'guide', 'how to', 'learn'],
        'documentation': ['documentation', 'docs', 'reference'],
        'example': ['example', 'code sample']
    };

    for (const [tag, keywords] of Object.entries(tagKeywords)) {
        if (keywords.some(keyword => content.includes(keyword))) {
            tags.push(tag);
        }
    }

    return tags.length > 0 ? tags : ['general'];
}

/**
 * 404 handler
 */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: [
            'GET /api/health',
            'GET /api/search?q=query&profile=student&budget=true&readingTime=30&skillLevel=beginner',
            'POST /api/search',
            'GET /api/profiles',
            'GET /api/metrics'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Decision-Aware Search API Server`);
    console.log(`📡 Listening on http://localhost:${PORT}`);
    console.log(`\n📚 API Endpoints:`);
    console.log(`   GET  /api/health              - Health check`);
    console.log(`   GET  /api/search              - Search with query parameters`);
    console.log(`   POST /api/search              - Search with request body`);
    console.log(`   GET  /api/profiles            - Available profiles`);
    console.log(`   GET  /api/metrics             - Available metrics`);
    console.log(`\n🌐 Web Interface: http://localhost:${PORT}`);
    console.log(`📖 Try: http://localhost:${PORT}?q=machine%20learning&profile=student\n`);
});

module.exports = app;
