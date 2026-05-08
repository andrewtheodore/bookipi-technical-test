import { SaleStatus } from './components/SaleStatus';
import { PurchaseForm } from './components/PurchaseForm';

function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Flash Sale</h1>
          <p className="text-gray-500 text-sm mt-1">
            Limited Edition Sneakers
          </p>
        </div>

        <SaleStatus />

        <hr className="border-gray-200" />

        <PurchaseForm />
      </div>
    </div>
  );
}

export default App;
