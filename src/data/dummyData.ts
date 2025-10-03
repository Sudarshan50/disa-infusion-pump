export const DUMMY_ADMIN = {
  name: "Dr. A. Verma",
  email: "admin@hospital.example",
  lastLogin: "2025-09-28T10:24:00+05:30",
};

export type DeviceStatus = "Healthy" | "Running" | "Issue" | "Degraded";

export interface Patient {
  name: string;
  age: number;
  weight: number;
  bedNo: string;
  drugInfused: string;
  allergies: string;
}

export interface Infusion {
  flowRateMlMin: number;
  plannedTimeMin: number;
  plannedVolumeMl: number;
  bolus: {
    enabled: boolean;
    volumeMl: number;
  };
}

export interface Device {
  deviceId: string;
  status: DeviceStatus;
  infusionsCompleted: number;
  lastOnline: string;
  patient?: Patient;
  infusion?: Infusion;
  progress?: {
    mode: "time" | "volume";
    timeRemainingMin: number;
    volumeRemainingMl: number;
  };
}

export const DUMMY_DEVICES: Device[] = [
  {
    deviceId: "PUMP_001",
    status: "Running",
    infusionsCompleted: 42,
    lastOnline: "2025-09-28T10:22:00+05:30",
    patient: {
      name: "Riya Sharma",
      age: 32,
      weight: 58,
      bedNo: "ICU-12",
      drugInfused: "Dopamine",
      allergies: "None",
    },
    infusion: {
      flowRateMlMin: 3.5,
      plannedTimeMin: 20,
      plannedVolumeMl: 70,
      bolus: { enabled: true, volumeMl: 5 },
    },
    progress: {
      mode: "time",
      timeRemainingMin: 12,
      volumeRemainingMl: 41,
    },
  },
  {
    deviceId: "PUMP_002",
    status: "Healthy",
    infusionsCompleted: 19,
    lastOnline: "2025-09-28T10:24:00+05:30",
  },
  {
    deviceId: "PUMP_003",
    status: "Issue",
    infusionsCompleted: 8,
    lastOnline: "2025-09-28T10:23:10+05:30",
  },
  {
    deviceId: "PUMP_004",
    status: "Degraded",
    infusionsCompleted: 65,
    lastOnline: "2025-09-28T08:11:05+05:30",
  },
];

export interface DeviceLog {
  ts: string;
  deviceId: string;
  action: string;
  actor: string;
  note: string;
}

export const DUMMY_LOGS: DeviceLog[] = [
  {
    ts: "2025-09-28T09:00:00+05:30",
    deviceId: "PUMP_001",
    action: "start",
    actor: "Dr. A. Verma",
    note: "Start Infusion wizard",
  },
  {
    ts: "2025-09-28T09:05:00+05:30",
    deviceId: "PUMP_001",
    action: "pause",
    actor: "Dr. A. Verma",
    note: "Clinical assessment",
  },
  {
    ts: "2025-09-28T09:06:00+05:30",
    deviceId: "PUMP_001",
    action: "resume",
    actor: "Dr. A. Verma",
    note: "Resumed per protocol",
  },
  {
    ts: "2025-09-28T09:15:00+05:30",
    deviceId: "PUMP_002",
    action: "schedule",
    actor: "Dr. A. Verma",
    note: "Scheduled for 12:30",
  },
];
