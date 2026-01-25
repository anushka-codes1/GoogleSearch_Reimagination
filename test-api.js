/**
 * API Test Suite
 * Tests the Express API endpoints
 */

const http = require('http');

const tests = [
    {
        name: 'Health Check',
        method: 'GET',
        path: '/api/health',
        expected: { status: 'ok' }
    },
    {
        name: 'Search with Query Parameter',
        method: 'GET',
        path: '/api/search?q=machine+learning&profile=student',
        expected: { success: true }
    },
    {
        name: 'Search with Constraints',
        method: 'GET',
        path: '/api/search?q=machine+learning&profile=student&skillLevel=beginner&readingTime=30',
        expected: { success: true }
    },
    {
        name: 'Search Shopper Profile',
        method: 'GET',
        path: '/api/search?q=machine+learning&profile=shopper&budget=true',
        expected: { success: true }
    },
    {
        name: 'Get Profiles',
        method: 'GET',
        path: '/api/profiles',
        expected: { profiles: {} }
    },
    {
        name: 'Get Metrics',
        method: 'GET',
        path: '/api/metrics',
        expected: { metrics: [] }
    },
    {
        name: 'Missing Query Parameter',
        method: 'GET',
        path: '/api/search',
        expectedError: 'Query parameter'
    }
];

async function runTest(test) {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:8000${test.path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    
                    if (test.expectedError) {
                        const hasSought = json.error && json.error.includes(test.expectedError);
                        console.log(`  ${hasSought ? '✓' : '✗'} ${test.name}`);
                        if (!hasSought) console.log(`    Expected error containing: "${test.expectedError}", got: ${json.error}`);
                    } else {
                        let passed = true;
                        for (const [key, value] of Object.entries(test.expected)) {
                            if (typeof value === 'object' && value !== null) {
                                if (!(key in json)) {
                                    passed = false;
                                    break;
                                }
                            } else if (json[key] !== value) {
                                passed = false;
                                break;
                            }
                        }
                        console.log(`  ${passed ? '✓' : '✗'} ${test.name}`);
                        if (!passed) console.log(`    Response: ${data.substring(0, 100)}`);
                    }
                } catch (e) {
                    console.log(`  ✗ ${test.name} - Invalid JSON response`);
                }
                resolve();
            });
        });

        req.on('error', (err) => {
            console.log(`  ✗ ${test.name} - ${err.message}`);
            resolve();
        });
    });
}

async function runAllTests() {
    console.log('\n🧪 API Test Suite\n');
    
    for (const test of tests) {
        await runTest(test);
    }
    
    console.log('\n✅ Tests completed\n');
}

// Run tests
runAllTests();
