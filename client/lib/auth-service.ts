"use client";

import { User } from 'firebase/auth';
import { makeAuthenticatedRequest } from '@/lib/api-client';
import axios from 'axios';

export class AuthService {
  private static instance: AuthService;

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Login user to backend (sync with server)
   */
  async loginUser(user: User, location?: { latitude: number; longitude: number }) {
    const token = await user.getIdToken();
    
    const data = {
      ...(location && {
        latitude: location.latitude,
        longitude: location.longitude,
      }),
    };

    return makeAuthenticatedRequest(
      (authToken) => axios.post(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/login`,
        data,
        { headers: { Authorization: `Bearer ${authToken}` } }
      ),
      token
    );
  }

  /**
   * Check if user token is valid by making a test API call
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      await axios.get(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/inventory`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000 
        }
      );
      return true;
    } catch (error: any) {
      if (error.response?.status === 401) {
        console.log('🔒 Token validation failed - unauthorized');
        return false;
      }
      // Network errors or other issues don't invalidate the token
      console.warn('Token validation network error:', error.message);
      return true; // Assume valid if we can't reach server
    }
  }

  /**
   * Get current location with fallback
   */
  async getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ latitude: 40.7128, longitude: -74.0060 }); // NYC fallback
        return;
      }

      const timeout = setTimeout(() => {
        resolve({ latitude: 40.7128, longitude: -74.0060 });
      }, 10000); // 10 second timeout

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeout);
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          clearTimeout(timeout);
          console.warn('Geolocation failed:', error);
          resolve({ latitude: 40.7128, longitude: -74.0060 }); // NYC fallback
        },
        { 
          timeout: 8000, 
          enableHighAccuracy: false, 
          maximumAge: 300000 // 5 minutes cache
        }
      );
    });
  }
}

export const authService = AuthService.getInstance();
