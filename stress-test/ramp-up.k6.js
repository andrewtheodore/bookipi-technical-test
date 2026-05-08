import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate } from 'k6/metrics';

// Test: Gradually ramp up traffic to find breaking point
// Simulates realistic traffic pattern: slow build-up before flash sale goes live

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const successCount = new Counter('ramp_success');
const failCount = new Counter('ramp_fail');
const errorCount = new Counter('ramp_errors');
const successRate = new Rate('ramp_success_rate');

export const options = {
  stages: [
    { duration: '10s', target: 50 },   // Warm up
    { duration: '10s', target: 200 },  // Ramp to moderate load
    { duration: '10s', target: 500 },  // Spike to high load
    { duration: '10s', target: 1000 }, // Peak flash sale traffic
    { duration: '10s', target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    ramp_errors: ['count<10'], // Less than 10 server errors
  },
};

export default function () {
  const userId = `ramp-user-${__VU}-${__ITER}-${Date.now()}`;

  const res = http.post(
    `${BASE_URL}/api/purchase`,
    JSON.stringify({ userId }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const body = JSON.parse(res.body);

  if (res.status === 200 && body.success) {
    successCount.add(1);
    successRate.add(true);
  } else if (res.status === 409) {
    failCount.add(1);
    successRate.add(false);
  } else {
    errorCount.add(1);
    successRate.add(false);
  }

  check(res, {
    'no server errors': (r) => r.status !== 500,
    'response is valid JSON': () => body.message !== undefined,
  });

  sleep(0.1); // Small delay between requests per VU
}

export function handleSummary(data) {
  const success = data.metrics.ramp_success
    ? data.metrics.ramp_success.values.count
    : 0;
  const failed = data.metrics.ramp_fail
    ? data.metrics.ramp_fail.values.count
    : 0;
  const errors = data.metrics.ramp_errors
    ? data.metrics.ramp_errors.values.count
    : 0;

  const dur = data.metrics.http_req_duration ? data.metrics.http_req_duration.values : {};
  const p50 = (dur['p(50)'] || dur.med || 0).toFixed(2);
  const p95 = (dur['p(95)'] || 0).toFixed(2);
  const p99 = (dur['p(99)'] || 0).toFixed(2);
  const max = (dur.max || 0).toFixed(2);

  const summary = `
=== Ramp-Up Stress Test Results ===
Stages: 50 → 200 → 500 → 1000 → 0 VUs over 50s

Successful Purchases: ${success}
Rejected (sold out):  ${failed}
Server Errors (5xx):  ${errors}
Total Requests:       ${success + failed + errors}

Response Times:
  p50: ${p50}ms
  p95: ${p95}ms
  p99: ${p99}ms
  max: ${max}ms

Result: ${errors < 10 ? 'PASS - System remained stable under ramp-up!' : 'FAIL - Too many server errors!'}
==========================================
`;

  console.log(summary);
  return { stdout: summary };
}
