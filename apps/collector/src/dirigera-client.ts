import https from 'node:https';

export interface DirigeraDevice {
  id: string;
  type: string;
  attributes: {
    customName: string;
    model?: string;
    isOn?: boolean;
    currentActivePower?: number;
    currentVoltage?: number;
    currentAmps?: number;
    totalEnergyConsumed?: number;
  };
  room?: {
    id: string;
    name: string;
  };
  isReachable: boolean;
}

export interface OutletReading {
  deviceId: string;
  name: string;
  room: string | null;
  model: string | null;
  isOn: boolean;
  powerWatts: number;
  voltage: number;
  currentAmps: number;
  energyKwh: number;
  isReachable: boolean;
}

export class DirigeraClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(hubIp: string, token: string) {
    this.baseUrl = `https://${hubIp}:8443`;
    this.token = token;
  }

  private async request<T>(path: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);

      const req = https.request(
        url,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${this.token}`,
          },
          rejectUnauthorized: false, // Self-signed cert
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                resolve(JSON.parse(data) as T);
              } catch {
                reject(new Error(`Invalid JSON response: ${data}`));
              }
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
  }

  async getDevices(): Promise<DirigeraDevice[]> {
    return this.request<DirigeraDevice[]>('/v1/devices');
  }

  async getOutlets(): Promise<OutletReading[]> {
    const devices = await this.getDevices();

    return devices
      .filter((d) => d.type === 'outlet')
      .map((d) => ({
        deviceId: d.id,
        name: d.attributes.customName || 'Unknown',
        room: d.room?.name || null,
        model: d.attributes.model || null,
        isOn: d.attributes.isOn ?? false,
        powerWatts: d.attributes.currentActivePower ?? 0,
        voltage: d.attributes.currentVoltage ?? 0,
        currentAmps: d.attributes.currentAmps ?? 0,
        energyKwh: d.attributes.totalEnergyConsumed ?? 0,
        isReachable: d.isReachable,
      }));
  }

  async getHubStatus(): Promise<{ name: string; firmwareVersion: string; apiVersion: string }> {
    const status = await this.request<{
      attributes: { customName: string; firmwareVersion: string };
      apiVersion: string;
    }>('/v1/hub/status');

    return {
      name: status.attributes.customName,
      firmwareVersion: status.attributes.firmwareVersion,
      apiVersion: status.apiVersion,
    };
  }
}
