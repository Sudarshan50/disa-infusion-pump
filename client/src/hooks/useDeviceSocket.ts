import { useState, useEffect, useCallback, useRef } from 'react';
import socketService, { DeviceStreamData, SocketEventCallbacks } from '../lib/socketService';

interface DeviceProgress {
  timeRemainingMin: number;
  volumeRemainingMl: number;
  timestamp: string;
}

interface DeviceError {
  type: string;
  message: string;
  timestamp: string;
}

interface DeviceStatus {
  status: string;
  lastPing: string;
  timestamp: string;
}

interface InfusionConfirmation {
  confirmed: boolean;
  infusionId: string;
  confirmedAt: string;
  parameters?: {
    flowRateMlMin: number;
    plannedTimeMin: number;
    plannedVolumeMl: number;
  };
}

export interface UseDeviceSocketOptions {
  autoConnect?: boolean;
  baseUrl?: string;
}

export interface DeviceSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  progress: DeviceProgress | null;
  deviceError: DeviceError | null;
  status: DeviceStatus | null;
  infusionConfirmation: InfusionConfirmation | null;
}

export const useDeviceSocket = (deviceId?: string, options: UseDeviceSocketOptions = {}) => {
  const [state, setState] = useState<DeviceSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    progress: null,
    deviceError: null,
    status: null,
    infusionConfirmation: null,
  });

  const { autoConnect = true, baseUrl } = options;
  const isSubscribed = useRef(false);
  const currentDeviceId = useRef(deviceId);

  // Update device ID ref when it changes
  useEffect(() => {
    currentDeviceId.current = deviceId;
  }, [deviceId]);

  // Connect to Socket.IO server (memoized to prevent unnecessary reconnections)
  const connect = useCallback(async () => {
    if (state.isConnected || state.isConnecting) return;

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const callbacks: SocketEventCallbacks = {
        onConnect: () => {
          setState(prev => ({ 
            ...prev, 
            isConnected: true, 
            isConnecting: false, 
            error: null 
          }));
        },
        onDisconnect: () => {
          setState(prev => ({ 
            ...prev, 
            isConnected: false, 
            isConnecting: false 
          }));
          isSubscribed.current = false;
        },
        onReconnect: () => {
          setState(prev => ({ 
            ...prev, 
            isConnected: true, 
            isConnecting: false, 
            error: null 
          }));
          // Re-subscribe to device if we were subscribed before
          if (currentDeviceId.current && isSubscribed.current) {
            socketService.subscribeToDevice(currentDeviceId.current);
          }
        },
        onProgress: (receivedDeviceId, progress) => {
          if (!currentDeviceId.current || receivedDeviceId === currentDeviceId.current) {
            setState(prev => ({ ...prev, progress }));
          }
        },
        onError: (receivedDeviceId, deviceError) => {
          if (!currentDeviceId.current || receivedDeviceId === currentDeviceId.current) {
            setState(prev => ({ ...prev, deviceError }));
          }
        },
        onStatus: (receivedDeviceId, status) => {
          if (!currentDeviceId.current || receivedDeviceId === currentDeviceId.current) {
            setState(prev => ({ ...prev, status }));
          }
        },
        onInfusionConfirmed: (receivedDeviceId, infusionConfirmation) => {
          console.log('🔔 Socket received infusion confirmation:', { receivedDeviceId, infusionConfirmation, targetDeviceId: currentDeviceId.current });
          if (!currentDeviceId.current || receivedDeviceId === currentDeviceId.current) {
            setState(prev => ({ ...prev, infusionConfirmation }));
          }
        },
      };

      await socketService.connect(callbacks);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect';
      setState(prev => ({ 
        ...prev, 
        isConnecting: false, 
        error: errorMessage 
      }));
    }
  }, [state.isConnected, state.isConnecting]); // Removed deviceId from dependencies

  // Subscribe to device data
  const subscribeToDevice = useCallback((targetDeviceId: string) => {
    if (!socketService.getConnectionStatus()) {
      throw new Error('Socket not connected');
    }

    socketService.subscribeToDevice(targetDeviceId);
    isSubscribed.current = true;
  }, []);

  // Unsubscribe from device data
  const unsubscribeFromDevice = useCallback((targetDeviceId: string) => {
    if (socketService.getConnectionStatus()) {
      socketService.unsubscribeFromDevice(targetDeviceId);
    }
    isSubscribed.current = false;
  }, []);

  // Wait for device confirmation
  const waitForDeviceConfirmation = useCallback(async (targetDeviceId: string, timeout = 30000) => {
    if (!socketService.getConnectionStatus()) {
      throw new Error('Socket not connected');
    }

    return await socketService.waitForDeviceConfirmation(targetDeviceId, timeout);
  }, []);

  // Disconnect from Socket.IO server
  const disconnect = useCallback(() => {
    socketService.disconnect();
    isSubscribed.current = false;
    setState({
      isConnected: false,
      isConnecting: false,
      error: null,
      progress: null,
      deviceError: null,
      status: null,
      infusionConfirmation: null,
    });
  }, []);

  // Auto-connect effect with better error handling
  useEffect(() => {
    if (autoConnect && !state.isConnected && !state.isConnecting) {
      console.log('🔄 Auto-connecting to socket service...');
      connect().catch(err => {
        console.error('Auto-connect failed:', err);
        // Don't automatically retry here, let the component handle retries
      });
    }
  }, [autoConnect, state.isConnected, state.isConnecting, connect]);

  // Auto-subscribe to device when connected
  useEffect(() => {
    if (deviceId && state.isConnected && !isSubscribed.current) {
      subscribeToDevice(deviceId);
    }
  }, [deviceId, state.isConnected, subscribeToDevice]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (currentDeviceId.current && isSubscribed.current) {
        if (socketService.getConnectionStatus()) {
          socketService.unsubscribeFromDevice(currentDeviceId.current);
        }
        isSubscribed.current = false;
      }
    };
  }, []); // Empty dependency array - only run on mount/unmount

  // Stable utility functions
  const clearProgress = useCallback(() => setState(prev => ({ ...prev, progress: null })), []);
  const clearError = useCallback(() => setState(prev => ({ ...prev, deviceError: null })), []);
  const clearInfusionConfirmation = useCallback(() => setState(prev => ({ ...prev, infusionConfirmation: null })), []);

  return {
    // Connection state
    isConnected: state.isConnected,
    isConnecting: state.isConnecting,
    connectionError: state.error,

    // Device data
    progress: state.progress,
    deviceError: state.deviceError,
    status: state.status,
    infusionConfirmation: state.infusionConfirmation,

    // Actions
    connect,
    disconnect,
    subscribeToDevice,
    unsubscribeFromDevice,
    waitForDeviceConfirmation,

    // Utils
    clearProgress,
    clearError,
    clearInfusionConfirmation,
  };
};

export default useDeviceSocket;