import type { PurchaseResult } from '../api';

interface Props {
  result: PurchaseResult;
}

export function ResultMessage({ result }: Props) {
  if (result.success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <span className="text-green-600 text-xl">&#10003;</span>
          <div>
            <div className="font-medium text-green-800">{result.message}</div>
            {result.orderId && (
              <div className="text-sm text-green-600">
                Order #{result.orderId}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const colorMap: Record<string, string> = {
    already_purchased: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    sold_out: 'bg-red-50 border-red-200 text-red-800',
    sale_not_active: 'bg-blue-50 border-blue-200 text-blue-800',
  };

  const colors = colorMap[result.reason || ''] || 'bg-red-50 border-red-200 text-red-800';

  return (
    <div className={`border rounded-lg p-4 ${colors}`}>
      <div className="font-medium">{result.message}</div>
      {result.reason === 'already_purchased' && result.orderId && (
        <div className="text-sm mt-1">Order #{result.orderId}</div>
      )}
    </div>
  );
}
