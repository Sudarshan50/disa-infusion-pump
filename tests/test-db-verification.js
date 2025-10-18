#!/usr/bin/env node

import mongoose from 'mongoose';
import Device from '../src/models/Device.js';
import Infusion from '../src/models/Infusion.js';

/**
 * Database verification script to check the current state
 * of devices and infusions before/after confirmation tests
 */

const DB_CONFIG = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/infusion-calm'
};

async function connectToDatabase() {
  try {
    await mongoose.connect(DB_CONFIG.uri);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function checkDeviceStatus(deviceId) {
  try {
    const device = await Device.findOne({ deviceId }).populate('activeInfusion');
    
    if (!device) {
      console.log(`❌ Device ${deviceId} not found`);
      return null;
    }

    console.log(`\n📱 Device: ${deviceId}`);
    console.log(`   Status: ${device.status}`);
    console.log(`   Active Infusion: ${device.activeInfusion ? device.activeInfusion._id : 'None'}`);
    console.log(`   Location: ${device.location}`);
    console.log(`   Last Updated: ${device.updatedAt}`);
    
    if (device.activeInfusion) {
      console.log(`   Infusion Details:`);
      console.log(`     • ID: ${device.activeInfusion._id}`);
      console.log(`     • Created: ${device.activeInfusion.createdAt}`);
      console.log(`     • Status: ${device.activeInfusion.status || 'No status field'}`);
    }

    return device;
  } catch (error) {
    console.error(`❌ Error checking device ${deviceId}:`, error);
    return null;
  }
}

async function checkInfusionStatus(infusionId) {
  try {
    const infusion = await Infusion.findById(infusionId).populate('device');
    
    if (!infusion) {
      console.log(`❌ Infusion ${infusionId} not found`);
      return null;
    }

    console.log(`\n💉 Infusion: ${infusionId}`);
    console.log(`   Status: ${infusion.status || 'No status field'}`);
    console.log(`   Device: ${infusion.device ? infusion.device.deviceId : 'None'}`);
    console.log(`   Created: ${infusion.createdAt}`);
    console.log(`   Last Updated: ${infusion.updatedAt}`);
    console.log(`   Patient Skipped: ${infusion.patientDetailSkipped}`);

    return infusion;
  } catch (error) {
    console.error(`❌ Error checking infusion ${infusionId}:`, error);
    return null;
  }
}

async function listAllDevices() {
  try {
    const devices = await Device.find({}).populate('activeInfusion');
    
    console.log(`\n📋 All Devices (${devices.length} total):`);
    console.log('=' .repeat(50));
    
    devices.forEach(device => {
      console.log(`${device.deviceId}: ${device.status} | Active: ${device.activeInfusion ? device.activeInfusion._id : 'None'}`);
    });
    
    return devices;
  } catch (error) {
    console.error('❌ Error listing devices:', error);
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
🔍 Database Status Checker
=========================

Usage:
  node test-db-verification.js [command] [arguments]

Commands:
  device <deviceId>        - Check specific device status
  infusion <infusionId>    - Check specific infusion status  
  list                     - List all devices
  check <deviceId> <infusionId> - Check both device and infusion

Examples:
  node test-db-verification.js device DEVICE-001
  node test-db-verification.js infusion 673f3f57b2b7c2d74c123456
  node test-db-verification.js check DEVICE-001 673f3f57b2b7c2d74c123456
  node test-db-verification.js list
`);
    process.exit(0);
  }

  await connectToDatabase();

  const command = args[0];

  switch (command) {
    case 'device':
      if (args[1]) {
        await checkDeviceStatus(args[1]);
      } else {
        console.log('❌ Please provide a device ID');
      }
      break;

    case 'infusion':
      if (args[1]) {
        await checkInfusionStatus(args[1]);
      } else {
        console.log('❌ Please provide an infusion ID');
      }
      break;

    case 'check':
      if (args[1] && args[2]) {
        await checkDeviceStatus(args[1]);
        await checkInfusionStatus(args[2]);
      } else {
        console.log('❌ Please provide both device ID and infusion ID');
      }
      break;

    case 'list':
      await listAllDevices();
      break;

    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Use --help for usage information');
  }

  await mongoose.disconnect();
  console.log('\n✅ Disconnected from database');
}

main().catch(console.error);