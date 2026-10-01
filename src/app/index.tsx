import { Buffer } from 'buffer';
import { useEffect, useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

// ป้องกัน Type Error บน TypeScript
(globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;

const manager = Platform.OS !== 'web' ? new BleManager() : null;

// UUIDs (ตรวจสอบให้ตรงกับใน ESP32 / Microcontroller)
const SERVICE_UUID = 'aee04821-1973-4e1f-a590-e84b10d580e7';
const CHAR_UUID = 'cde07b1a-889b-44b7-a99f-c888dddac729';

export default function Index() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // States
  const [initialData, setInitialData] = useState<string>('');
  const [myName, setMyName] = useState<string>('');
  const [buddyName, setBuddyName] = useState<string>('');
  const [writtenData, setWrittenData] = useState<string>('');
  const [finalData, setFinalData] = useState<string>('');
  const [predictedGrade, setPredictedGrade] = useState<string | null>(null);

  async function requestPermissions() {
    if (!manager) return false;
    manager.stopDeviceScan();

    if (Platform.OS === 'android') {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.ACCESS_FINE_LOCATION'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    }
    return true;
  }

  useEffect(() => {
    requestPermissions();
    return () => {
      if (manager) manager.stopDeviceScan();
    };
  }, []);

  const startScan = () => {
    if (!manager) return;
    setDevices([]);
    setIsScanning(true);

    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setIsScanning(false);
        return;
      }
      if (device) {
        setDevices((prev) => {
          const index = prev.findIndex((d) => d.id === device.id);
          if (index > -1) {
            const updated = [...prev];
            updated[index] = device;
            return updated;
          }
          return [...prev, device];
        });
      }
    });

    setTimeout(() => {
      if (manager) manager.stopDeviceScan();
      setIsScanning(false);
    }, 10000);
  };

  const connectToDevice = async (device: Device) => {
    if (!manager) return;
    manager.stopDeviceScan();
    setIsScanning(false);
    try {
      const connected = await manager.connectToDevice(device.id);
      const discovered = await connected.discoverAllServicesAndCharacteristics();
      setConnectedDevice(discovered);
    } catch (error) {
      Alert.alert('Connection Failed', 'Could not connect to the device.');
    }
  };

  const readInitialValue = async () => {
    if (!connectedDevice || !manager) return;
    try {
      const characteristic = await manager.readCharacteristicForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID
      );
      const rawData = Buffer.from(characteristic.value || '', 'base64').toString('utf-8');
      setInitialData(rawData || '(Empty Value)');
    } catch (error: any) {
      Alert.alert('Read Error', error?.message || 'Failed to read characteristic value.');
    }
  };

  const writeNamesValue = async () => {
    if (!connectedDevice || !manager) return;
    if (!myName.trim() || !buddyName.trim()) {
      Alert.alert('Missing Input', "Please enter both your name and your buddy's name.");
      return;
    }

    try {
      const payload = `${myName.trim()} & ${buddyName.trim()}`;
      const base64Value = Buffer.from(payload, 'utf-8').toString('base64');

      try {
        // ลองใช้ Write With Response ก่อน
        await manager.writeCharacteristicWithResponseForDevice(
          connectedDevice.id,
          SERVICE_UUID,
          CHAR_UUID,
          base64Value
        );
      } catch (e) {
        // ถ้าบอร์ดเปิดสิทธิ์เฉพาะ Without Response ให้สลับมาใช้คำสั่งนี้แทน
        await manager.writeCharacteristicWithoutResponseForDevice(
          connectedDevice.id,
          SERVICE_UUID,
          CHAR_UUID,
          base64Value
        );
      }

      setWrittenData(payload);
      Alert.alert('Success', 'Names written to device successfully!');
    } catch (error: any) {
      Alert.alert('Write Error', error?.message || 'Failed to write names to device.');
    }
  };

  const readAgainAndPredictGrade = async () => {
    if (!connectedDevice || !manager) return;
    try {
      const characteristic = await manager.readCharacteristicForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID
      );
      const rawData = Buffer.from(characteristic.value || '', 'base64').toString('utf-8');
      setFinalData(rawData || '(Empty Value)');

      const gradeList = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'A'];
      const scoreSeed = myName.length * 3 + buddyName.length * 7 + rawData.length;
      const predicted = gradeList[scoreSeed % gradeList.length];

      setPredictedGrade(predicted);
    } catch (error: any) {
      Alert.alert('Read Error', error?.message || 'Failed to read characteristic value.');
    }
  };

  const disconnectDevice = async () => {
    if (!connectedDevice || !manager) return;
    await manager.cancelDeviceConnection(connectedDevice.id);
    setConnectedDevice(null);
    setInitialData('');
    setMyName('');
    setBuddyName('');
    setWrittenData('');
    setFinalData('');
    setPredictedGrade(null);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1A1635" />

      {/* Decorative Night Stars Background */}
      <View style={styles.star1} />
      <View style={styles.star2} />
      <View style={styles.star3} />

      <View style={styles.header}>
        <Text style={styles.greetingText}>✨ Night Sky BLE Predictor</Text>
        <Text style={styles.headerTitle}>Grade Predictor</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {!connectedDevice ? (
          <View style={styles.scanSection}>
            <TouchableOpacity
              style={[styles.mainCapsuleButton, isScanning && styles.disabledButton]}
              onPress={startScan}
              disabled={isScanning}
            >
              <Text style={styles.mainButtonText}>
                {isScanning ? '✦ Scanning Devices...' : '✦ Scan Bluetooth Devices'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.sectionSubtitle}>Available Devices</Text>
            {devices.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.deviceCard}
                onPress={() => connectToDevice(item)}
              >
                <View style={styles.deviceInfo}>
                  <Text style={styles.deviceName}>
                    {item.name || item.localName || 'Unknown Device'}
                  </Text>
                  <Text style={styles.deviceId}>{item.id}</Text>
                </View>
                <View style={styles.connectBadge}>
                  <Text style={styles.connectBadgeText}>Connect ➔</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.dashboard}>
            {/* Status Card */}
            <View style={styles.statusCard}>
              <Text style={styles.connectedStatusText}>✦ CONNECTED TO ✦</Text>
              <Text style={styles.connectedName}>
                {connectedDevice.name || connectedDevice.localName || 'BLE Device'}
              </Text>
            </View>

            {/* STEP 1 */}
            <View style={styles.card}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>Step 1</Text>
              </View>
              <Text style={styles.cardTitle}>Read Initial Value</Text>
              <TouchableOpacity style={styles.actionButton} onPress={readInitialValue}>
                <Text style={styles.actionButtonText}>📖 Read Value</Text>
              </TouchableOpacity>
              {initialData !== '' && (
                <View style={styles.resultBox}>
                  <Text style={styles.resultLabel}>Current Value:</Text>
                  <Text style={styles.resultData}>{initialData}</Text>
                </View>
              )}
            </View>

            {/* STEP 2 */}
            <View style={styles.card}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>Step 2</Text>
              </View>
              <Text style={styles.cardTitle}>Write Names (You & Buddy)</Text>
              <TextInput
                style={styles.input}
                placeholder="Your Name"
                placeholderTextColor="#A098C4"
                value={myName}
                onChangeText={setMyName}
              />
              <TextInput
                style={styles.input}
                placeholder="Buddy's Name"
                placeholderTextColor="#A098C4"
                value={buddyName}
                onChangeText={setBuddyName}
              />
              <TouchableOpacity style={styles.actionButton} onPress={writeNamesValue}>
                <Text style={styles.actionButtonText}>✍️ Write Names to Device</Text>
              </TouchableOpacity>
              {writtenData !== '' && (
                <View style={styles.resultBox}>
                  <Text style={styles.resultLabel}>Written Data:</Text>
                  <Text style={styles.resultData}>{writtenData}</Text>
                </View>
              )}
            </View>

            {/* STEP 3 */}
            <View style={styles.card}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>Step 3</Text>
              </View>
              <Text style={styles.cardTitle}>Read Again & Predict Grade</Text>
              <TouchableOpacity style={styles.predictButton} onPress={readAgainAndPredictGrade}>
                <Text style={styles.predictButtonText}>🔮 Read & Predict Grade!</Text>
              </TouchableOpacity>

              {finalData !== '' && (
                <View style={styles.resultBox}>
                  <Text style={styles.resultLabel}>Read Value:</Text>
                  <Text style={styles.resultData}>{finalData}</Text>
                </View>
              )}

              {predictedGrade && (
                <View style={styles.gradeContainer}>
                  <Text style={styles.gradeHeader}>Predicted Grade</Text>
                  <Text style={styles.gradeText}>{predictedGrade}</Text>
                  <Text style={styles.gradeSubtext}>
                    For {myName || 'You'} & {buddyName || 'Buddy'}
                  </Text>
                </View>
              )}
            </View>

            {/* Disconnect Button */}
            <TouchableOpacity style={styles.disconnectButton} onPress={disconnectDevice}>
              <Text style={styles.disconnectText}>✕ Disconnect Device</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#1A162B',
  },
  star1: {
    position: 'absolute',
    top: 60,
    right: 40,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFF',
    opacity: 0.8,
  },
  star2: {
    position: 'absolute',
    top: 140,
    left: 30,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E8D7F6',
    opacity: 0.6,
  },
  star3: {
    position: 'absolute',
    top: 250,
    right: 80,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#FFF',
    opacity: 0.5,
  },
  header: {
    paddingTop: 24,
    paddingBottom: 12,
    alignItems: 'center',
  },
  greetingText: {
    fontSize: 14,
    color: '#BDB3E2',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '300',
    color: '#F3EBF9',
    marginTop: 4,
  },
  container: {
    padding: 20,
  },
  scanSection: {
    gap: 16,
  },
  mainCapsuleButton: {
    backgroundColor: '#F3EBF9',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  disabledButton: {
    backgroundColor: '#8C82B3',
  },
  mainButtonText: {
    color: '#1A162B',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#BDB3E2',
    marginTop: 10,
    letterSpacing: 0.5,
  },
  deviceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    padding: 16,
    borderRadius: 16,
    marginVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  deviceInfo: {
    flex: 1,
    marginRight: 10,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F3EBF9',
  },
  deviceId: {
    fontSize: 12,
    color: '#A098C4',
    marginTop: 2,
  },
  connectBadge: {
    backgroundColor: 'rgba(232, 215, 246, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  connectBadgeText: {
    fontSize: 12,
    color: '#E8D7F6',
    fontWeight: '600',
  },
  dashboard: {
    gap: 16,
  },
  statusCard: {
    backgroundColor: 'rgba(232, 215, 246, 0.12)',
    padding: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232, 215, 246, 0.25)',
  },
  connectedStatusText: {
    fontSize: 11,
    color: '#C4B9E6',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  connectedName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F3EBF9',
    marginTop: 4,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    gap: 12,
    position: 'relative',
  },
  stepBadge: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(232, 215, 246, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  stepBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E8D7F6',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F3EBF9',
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#FFF',
  },
  actionButton: {
    backgroundColor: 'rgba(232, 215, 246, 0.2)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232, 215, 246, 0.3)',
  },
  actionButtonText: {
    color: '#F3EBF9',
    fontWeight: '600',
    fontSize: 14,
  },
  predictButton: {
    backgroundColor: '#F3EBF9',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
  },
  predictButtonText: {
    color: '#1A162B',
    fontWeight: 'bold',
    fontSize: 15,
  },
  resultBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    padding: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  resultLabel: {
    fontSize: 11,
    color: '#A098C4',
  },
  resultData: {
    fontSize: 14,
    color: '#F3EBF9',
    fontWeight: '600',
    marginTop: 2,
  },
  gradeContainer: {
    backgroundColor: 'rgba(232, 215, 246, 0.15)',
    padding: 18,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(232, 215, 246, 0.4)',
    marginTop: 8,
  },
  gradeHeader: {
    fontSize: 13,
    color: '#D2C7E8',
    letterSpacing: 0.5,
  },
  gradeText: {
    fontSize: 48,
    fontWeight: '300',
    color: '#FFF',
    marginVertical: 4,
  },
  gradeSubtext: {
    fontSize: 13,
    color: '#E8D7F6',
  },
  disconnectButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 14,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 10,
  },
  disconnectText: {
    color: '#FCA5A5',
    fontWeight: '600',
    fontSize: 14,
  },
});