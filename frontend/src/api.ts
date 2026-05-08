import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

export interface SaleStatus {
  status: 'upcoming' | 'active' | 'ended';
  startsAt: string;
  endsAt: string;
  stockRemaining: number;
}

export interface PurchaseResult {
  success: boolean;
  message: string;
  reason?: string;
  orderId?: number;
}

export interface OrderResult {
  hasPurchased: boolean;
  order: {
    id: number;
    productId: number;
    productName: string;
    createdAt: string;
  } | null;
}

export async function fetchSaleStatus(): Promise<SaleStatus> {
  const { data } = await api.get<SaleStatus>('/sale/status');
  return data;
}

export async function submitPurchase(userId: string): Promise<PurchaseResult> {
  try {
    const { data } = await api.post<PurchaseResult>('/purchase', { userId });
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data) {
      return err.response.data as PurchaseResult;
    }
    return { success: false, message: 'Network error. Please try again.', reason: 'network_error' };
  }
}

export async function fetchOrder(userId: string): Promise<OrderResult> {
  const { data } = await api.get<OrderResult>(`/order/${encodeURIComponent(userId)}`);
  return data;
}
