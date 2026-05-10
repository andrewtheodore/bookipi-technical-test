import { useState } from 'react';
import { submitPurchase, fetchOrder, type PurchaseResult } from '../api';
import { ResultMessage } from './ResultMessage';

export function PurchaseForm() {
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PurchaseResult | null>(null);

  const checkExistingOrder = async () => {
    if (!userId.trim()) return;
    setChecking(true);
    try {
      const order = await fetchOrder(userId.trim());
      if (order.hasPurchased) {
        setResult({
          success: false,
          message: 'You have already purchased this item',
          reason: 'already_purchased',
          orderId: order.order?.id,
        });
      }
    } catch {
      // Ignore — user can still try to purchase
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!userId.trim() || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await submitPurchase(userId.trim());
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="userId"
            className="block text-sm font-medium text-gray-700 mb-1 text-left"
          >
            User ID
          </label>
          <input
            id="userId"
            type="text"
            value={userId}
            onChange={(e) => {
              setUserId(e.target.value);
              setResult(null);
            }}
            onBlur={checkExistingOrder}
            placeholder="Enter your username or email"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          disabled={!userId.trim() || loading || checking}
          className="w-full py-3 px-4 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Processing...
            </span>
          ) : (
            'Buy Now'
          )}
        </button>
      </form>

      {result && <ResultMessage result={result} />}
    </div>
  );
}
