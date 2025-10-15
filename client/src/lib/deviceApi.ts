import api from './api';

export interface DeviceDetails {
  _id: string;
  deviceId: string;
  location: string;
  status: 'healthy' | 'issue' | 'running' | 'paused' | 'stopped' | 'degraded';
  notifications: unknown[];
  logs: unknown[];
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export interface DeviceApiResponse {
  success: boolean;
  message: string;
  data: {
    device: DeviceDetails;
  };
  timestamp: string;
}

export const deviceApi = {
  // Get device details by ID
  getDeviceDetails: async (deviceId: string): Promise<DeviceDetails> => {
    const response = await api.get<DeviceApiResponse>(`/device/${deviceId}`);
    return response.data.data.device;
  },

  // Start infusion
  startInfusion: async (deviceId: string, params: {
    flowRateMlMin: number;
    plannedTimeMin: number;
    plannedVolumeMl: number;
    bolus?: {
      enabled: boolean;
      volumeMl: number;
    };
  }) => {
    const response = await api.post(`/device/start/${deviceId}`, params);
    return response.data;
  },

  // Stop infusion
  stopInfusion: async (deviceId: string, params?: {
    reason?: string;
    emergency?: boolean;
  }) => {
    const response = await api.post(`/device/stop/${deviceId}`, params || {});
    return response.data;
  },

  // Pause infusion
  pauseInfusion: async (deviceId: string, params?: {
    reason?: string;
  }) => {
    const response = await api.post(`/device/pause/${deviceId}`, params || {});
    return response.data;
  },

  // Resume infusion
  resumeInfusion: async (deviceId: string) => {
    const response = await api.post(`/device/resume/${deviceId}`);
    return response.data;
  }
};