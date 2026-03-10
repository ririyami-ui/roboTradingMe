// Simple test for technical indicators
import { analyzeTechnicalIndicators } from '../src/utils/technicalIndicators.js';

const mockOversoldPrices = [
    100, 98, 95, 92, 88, 85, 82, 80, 78, 75,
    72, 70, 68, 65, 63, 60, 58, 55, 53, 50 // Sharp drop to trigger RSI < 45
];

const signal = analyzeTechnicalIndicators(mockOversoldPrices);
console.log('--- Technical Indicator Test ---');
console.log('Input Prices:', mockOversoldPrices.slice(-5));
console.log('Resulting Signal:', signal);

if (signal === 'STRONG_BUY' || signal === 'POTENTIAL_BUY') {
    console.log('✅ PASS: Correctly identified buying opportunity.');
} else {
    console.log('❌ FAIL: Failed to identify buying opportunity in oversold conditions.');
}
