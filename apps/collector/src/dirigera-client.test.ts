import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DirigeraClient, DirigeraDevice, OutletReading } from './dirigera-client.js';

// Mock https module
vi.mock('node:https', () => ({
  default: {
    request: vi.fn(),
  },
}));

import https from 'node:https';

const mockRequest = https.request as ReturnType<typeof vi.fn>;

function createMockResponse(statusCode: number, data: unknown) {
  return {
    statusCode,
    on: vi.fn((event: string, callback: (chunk?: string) => void) => {
      if (event === 'data') {
        callback(JSON.stringify(data));
      }
      if (event === 'end') {
        callback();
      }
    }),
  };
}

describe('DirigeraClient', () => {
  let client: DirigeraClient;

  beforeEach(() => {
    client = new DirigeraClient('10.0.0.1', 'test-token');
    vi.clearAllMocks();
  });

  describe('getHubStatus', () => {
    it('should return hub status', async () => {
      const mockData = {
        attributes: {
          customName: 'My Hub',
          firmwareVersion: '2.0.0',
        },
        apiVersion: '1.0',
      };

      mockRequest.mockImplementation((_url, _options, callback) => {
        callback(createMockResponse(200, mockData));
        return {
          on: vi.fn(),
          setTimeout: vi.fn(),
          end: vi.fn(),
        };
      });

      const status = await client.getHubStatus();

      expect(status).toEqual({
        name: 'My Hub',
        firmwareVersion: '2.0.0',
        apiVersion: '1.0',
      });
    });
  });

  describe('getOutlets', () => {
    it('should filter and map outlet devices', async () => {
      const mockDevices: DirigeraDevice[] = [
        {
          id: 'outlet-1',
          type: 'outlet',
          isReachable: true,
          attributes: {
            customName: 'Living Room Plug',
            model: 'INSPELNING',
            isOn: true,
            currentActivePower: 45.5,
            currentVoltage: 240,
            currentAmps: 0.19,
            totalEnergyConsumed: 12.5,
          },
          room: { id: 'room-1', name: 'Living Room' },
        },
        {
          id: 'light-1',
          type: 'light',
          isReachable: true,
          attributes: {
            customName: 'Ceiling Light',
          },
        },
        {
          id: 'outlet-2',
          type: 'outlet',
          isReachable: false,
          attributes: {
            customName: 'Bedroom Plug',
            isOn: false,
          },
        },
      ];

      mockRequest.mockImplementation((_url, _options, callback) => {
        callback(createMockResponse(200, mockDevices));
        return {
          on: vi.fn(),
          setTimeout: vi.fn(),
          end: vi.fn(),
        };
      });

      const outlets = await client.getOutlets();

      expect(outlets).toHaveLength(2);
      expect(outlets[0]).toEqual({
        deviceId: 'outlet-1',
        name: 'Living Room Plug',
        room: 'Living Room',
        model: 'INSPELNING',
        isOn: true,
        powerWatts: 45.5,
        voltage: 240,
        currentAmps: 0.19,
        energyKwh: 12.5,
        isReachable: true,
      });
      expect(outlets[1].isReachable).toBe(false);
    });

    it('should handle missing optional fields', async () => {
      const mockDevices: DirigeraDevice[] = [
        {
          id: 'outlet-1',
          type: 'outlet',
          isReachable: true,
          attributes: {
            customName: 'Basic Plug',
          },
        },
      ];

      mockRequest.mockImplementation((_url, _options, callback) => {
        callback(createMockResponse(200, mockDevices));
        return {
          on: vi.fn(),
          setTimeout: vi.fn(),
          end: vi.fn(),
        };
      });

      const outlets = await client.getOutlets();

      expect(outlets[0]).toEqual({
        deviceId: 'outlet-1',
        name: 'Basic Plug',
        room: null,
        model: null,
        isOn: false,
        powerWatts: 0,
        voltage: 0,
        currentAmps: 0,
        energyKwh: 0,
        isReachable: true,
      });
    });
  });
});
