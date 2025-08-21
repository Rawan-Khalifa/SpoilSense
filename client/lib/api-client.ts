"use client";

import axios, { AxiosResponse, AxiosError } from 'axios';
import { toast } from '@/hooks/use-toast';

// Create axios instance with base configuration
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Types for better error handling
interface ApiError {
  message: string;
  status: number;
  code?: string;
}

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    // The auth token will be added by individual components
    // This allows for better token management per request
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for global error handling
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error: AxiosError) => {
    const apiError: ApiError = {
      message: 'An unexpected error occurred',
      status: error.response?.status || 500,
    };

    if (error.response) {
      // Server responded with error status
      const data = error.response.data as any;
      
      switch (error.response.status) {
        case 401:
          apiError.message = data?.error || 'Authentication required';
          apiError.code = 'UNAUTHORIZED';
          // Let components handle auth errors specifically
          break;
        case 403:
          apiError.message = data?.error || 'Access denied';
          apiError.code = 'FORBIDDEN';
          break;
        case 404:
          apiError.message = data?.error || 'Resource not found';
          apiError.code = 'NOT_FOUND';
          break;
        case 429:
          apiError.message = data?.error || 'Too many requests. Please try again later.';
          apiError.code = 'RATE_LIMITED';
          break;
        case 500:
          apiError.message = data?.error || 'Server error. Please try again.';
          apiError.code = 'SERVER_ERROR';
          break;
        default:
          apiError.message = data?.error || error.message || 'Unknown error occurred';
      }
    } else if (error.request) {
      // Network error
      apiError.message = 'Network error. Please check your connection.';
      apiError.code = 'NETWORK_ERROR';
    }

    // Add the structured error to the error object
    (error as any).apiError = apiError;
    
    return Promise.reject(error);
  }
);

// Helper function to make authenticated requests
export const makeAuthenticatedRequest = async <T>(
  requestFn: (token: string) => Promise<AxiosResponse<T>>,
  token: string | null,
  onAuthError?: () => void
): Promise<T> => {
  if (!token) {
    throw new Error('Authentication token required');
  }

  try {
    const response = await requestFn(token);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError & { apiError?: ApiError };
    
    if (axiosError.apiError?.code === 'UNAUTHORIZED') {
      // Token expired or invalid
      console.log('🔒 Authentication error detected');
      if (onAuthError) {
        onAuthError();
      }
    }
    
    throw error;
  }
};

// Helper to show error toasts consistently
export const handleApiError = (error: any, defaultMessage = 'An error occurred') => {
  const axiosError = error as AxiosError & { apiError?: ApiError };
  const message = axiosError.apiError?.message || defaultMessage;
  
  toast({
    title: 'Error',
    description: message,
    variant: 'destructive',
  });
  
  console.error('API Error:', axiosError.apiError || error);
};

export default apiClient;
