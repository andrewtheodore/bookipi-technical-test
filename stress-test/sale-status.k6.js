import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

// Test: Hammer the sale status endpoint under heavy load
// Verifies the read-path stays fast while purchases are happening

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const statusErrors = new Counter('status_errors');

export const options = {
  scenarios: {
    status_polling: {
      executor: 'constant-vus',
      vus: 200,
      duration: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // Status endpoint should be fast
    status_errors: ['count<5'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/api/sale/status`);

  const passed = check(res, {
    'status is 200': (r) => r.status === 200,
    'has status field': () => {
      const body = JSON.parse(res.body);
      return ['upcoming', 'active', 'ended'].includes(body.status);
    },
    'has stockRemaining': () => {
      const body = JSON.parse(res.body);
      return typeof body.stockRemaining === 'number' && body.stockRemaining >= 0;
    },
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!passed) {
    statusErrors.add(1);
  }
}

export function handleSummary(data) {
  const totalRequests = data.metrics.http_reqs.values.count;
  const errors = data.metrics.status_errors
    ? data.metrics.status_errors.values.count
    : 0;
  const rps = data.metrics.http_reqs.values.rate.toFixed(0);

  const dur = data.metrics.http_req_duration ? data.metrics.http_req_duration.values : {};
  const p50 = (dur['p(50)'] || dur.med || 0).toFixed(2);
  const p95 = (dur['p(95)'] || 0).toFixed(2);
  const p99 = (dur['p(99)'] || 0).toFixed(2);
  const max = (dur.max || 0).toFixed(2);

  const summary = `
=== Sale Status Endpoint Stress Test ===
Duration:           30s
Virtual Users:      200
Total Requests:     ${totalRequests}
Requests/sec:       ${rps}
Errors:             ${errors}

Response Times:
  p50: ${p50}ms
  p95: ${p95}ms
  p99: ${p99}ms
  max: ${max}ms

Result: ${errors < 5 ? 'PASS - Status endpoint handles heavy polling!' : 'FAIL - Too many errors under load!'}
==========================================
`;

  console.log(summary);
  return { stdout: summary };
}
