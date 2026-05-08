import { useEffect, useState } from 'react';
import { fetchSaleStatus, type SaleStatus as SaleStatusType } from '../api';

export function SaleStatus() {
  const [sale, setSale] = useState<SaleStatusType | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchSaleStatus();
        setSale(data);
        setError(false);
      } catch {
        setError(true);
      }
    };

    load();
    const interval = setInterval(load, 3000);
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        Unable to connect to server. Make sure the backend is running.
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="text-gray-500 animate-pulse">Loading sale status...</div>
    );
  }

  const statusConfig = {
    upcoming: {
      label: 'Upcoming',
      color: 'bg-blue-100 text-blue-800 border-blue-200',
      icon: '🕐',
    },
    active: {
      label: 'Live Now!',
      color: 'bg-green-100 text-green-800 border-green-200',
      icon: '🟢',
    },
    ended: {
      label: 'Ended',
      color: 'bg-gray-100 text-gray-600 border-gray-200',
      icon: '🔴',
    },
  };

  const cfg = statusConfig[sale.status];

  return (
    <div className="space-y-4">
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium ${cfg.color}`}>
        <span>{cfg.icon}</span>
        <span>{cfg.label}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-gray-500">Starts</div>
          <div className="font-medium text-gray-900">
            {new Date(sale.startsAt).toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-gray-500">Ends</div>
          <div className="font-medium text-gray-900">
            {new Date(sale.endsAt).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <div className="text-gray-500 text-sm">Stock Remaining</div>
        <div className="text-3xl font-bold text-gray-900">
          {sale.stockRemaining}
        </div>
      </div>
    </div>
  );
}
