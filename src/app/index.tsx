import { Buffer } from 'buffer';
import { useEffect, useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
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

// UUIDs สำหรับเชื่อมต่อ BLE Device
const SERVICE_UUID = 'aee04821-1973-4e1f-a590-e84b10d580e7';
const CHAR_UUID = 'cde07b1a-889b-44b7-a99f-c888dddac729';

export default function Index() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // States สำหรับเก็บข้อมูลแต่ละขั้นตอน
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

  // สแกนค้นหาอุปกรณ์ BLE
  const startScan = () => {
    if (!manager) return;
    setDevices([]);
    setIsScanning(true);
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setIsScanning(false);
        return;
      }
      if (device && device.name) {
        setDevices((prev) => {
          if (prev.some((d) => d.id === device.id)) return prev;
          return [...prev, device];
        });
      }
    });

    // หยุดสแกนอัตโนมัติเมื่อครบ 10 วินาที
    setTimeout(() => {
      if (manager) manager.stopDeviceScan();
      setIsScanning(false);
    }, 10000);
  };

  // เชื่อมต่ออุปกรณ์
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

  // Step 1: Read Characteristic Value ครั้งแรก
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
    } catch (error) {
      Alert.alert('Read Error', 'Failed to read characteristic value.');
    }
  };

  // Step 2: Write Value (Your name and your buddy)
  const writeNamesValue = async () => {
    if (!connectedDevice || !manager) return;
    if (!myName.trim() || !buddyName.trim()) {
      Alert.alert('Missing Input', 'Please enter both your name and your buddy\'s name.');
      return;
    }

    try {
      const payload = `${myName.trim()} & ${buddyName.trim()}`;
      const base64Value = Buffer.from(payload, 'utf-8').toString('base64');

      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        SERVICE_UUID,
        CHAR_UUID,
        base64Value
      );
      setWrittenData(payload);
      Alert.alert('Success', 'Names written to device successfully!');
    } catch (error) {
      Alert.alert('Write Error', 'Failed to write names to device.');
    }
  };

  // Step 3: Read Characteristic Value อีกครั้งเพื่อ Predict Grade
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

      // ระบบทำนายเกรด (คำนวณจากความยาวของชื่อทั้งสองคนและค่าที่อ่านได้)
      const gradeList = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'A'];
      const scoreSeed = myName.length * 3 + buddyName.length * 7 + rawData.length;
      const predicted = gradeList[scoreSeed % gradeList.length];

      setPredictedGrade(predicted);
    } catch (error) {
      Alert.alert('Read Error', 'Failed to read characteristic value.');
    }
  };

  // ตัดการเชื่อมต่อ
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>bluetooth Device is ready to pair</Text>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {!connectedDevice ? (
          <View style={styles.scanSection}>
            <TouchableOpacity
              style={[styles.mainButton, isScanning && styles.disabledButton]}
              onPress={startScan}
              disabled={isScanning}
            >
              <Text style={styles.mainButtonText}>
                {isScanning ? 'Scanning Devices...' : 'Scan Bluetooth Devices'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.sectionSubtitle}>Available Devices:</Text>
            {devices.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.deviceCard}
                onPress={() => connectToDevice(item)}
              >
                <View>
                  <Text style={styles.deviceName}>{item.name || 'Unknown Device'}</Text>
                  <Text style={styles.deviceId}>{item.id}</Text>
                </View>
                <Text style={styles.connectBadge}>Connect ➔</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.dashboard}>
            {/* Status Header */}
            <View style={styles.statusCard}>
              <Text style={styles.connectedText}>🟢 Connected to</Text>
              <Text style={styles.connectedName}>{connectedDevice.name || 'BLE Device'}</Text>
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
                placeholderTextColor="#999"
                value={myName}
                onChangeText={setMyName}
              />
              <TextInput
                style={styles.input}
                placeholder="Buddy's Name"
                placeholderTextColor="#999"
                value={buddyName}
                onChangeText={setBuddyName}
              />
              <TouchableOpacity style={[styles.actionButton, styles.writeButton]} onPress={writeNamesValue}>
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
              <TouchableOpacity style={[styles.actionButton, styles.predictButton]} onPress={readAgainAndPredictGrade}>
                <Text style={styles.actionButtonText}>🔮 Read & Predict Grade!</Text>
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
              <Text style={styles.disconnectText}>❌ Disconnect Device</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F6F9' },
  header: {
    paddingVertical: 18,
    backgroundColor: '#ffa66e',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  container: { padding: 16 },
  scanSection: { gap: 15 },
  mainButton: {
    backgroundColor: '#0b0c0c',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledButton: { backgroundColor: '#A0C4FF' },
  mainButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  sectionSubtitle: { fontSize: 16, fontWeight: '600', color: '#444', marginTop: 10 },
  deviceCard: {
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 10,
    marginVertical: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E8ED',
  },
  deviceName: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  deviceId: { fontSize: 12, color: '#888', marginTop: 2 },
  connectBadge: { fontSize: 13, color: '#4A90E2', fontWeight: '600' },
  dashboard: { gap: 16 },
  statusCard: {
    backgroundColor: '#E3F2FD',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BBDEFB',
  },
  connectedText: { fontSize: 12, color: '#1976D2', fontWeight: '500' },
  connectedName: { fontSize: 18, fontWeight: 'bold', color: '#0D47A1', marginTop: 2 },
  card: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E1E8ED',
    gap: 10,
    position: 'relative',
  },
  stepBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#F0F4F8',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  stepBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#64748B' },
  cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  actionButton: {
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  writeButton: { backgroundColor: '#8B5CF6' },
  predictButton: { backgroundColor: '#10B981' },
  actionButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  resultBox: {
    backgroundColor: '#F1F5F9',
    padding: 10,
    borderRadius: 6,
    marginTop: 4,
  },
  resultLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  resultData: { fontSize: 14, color: '#0F172A', fontWeight: 'bold', marginTop: 2 },
  gradeContainer: {
    backgroundColor: '#ECFDF5',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#10B981',
    marginTop: 8,
  },
  gradeHeader: { fontSize: 14, color: '#047857', fontWeight: 'bold' },
  gradeText: { fontSize: 44, fontWeight: '800', color: '#065F46', marginVertical: 4 },
  gradeSubtext: { fontSize: 13, color: '#059669', fontWeight: '500' },
  disconnectButton: {
    backgroundColor: '#EF4444',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  disconnectText: { color: '#FFF', fontWeight: 'bold', fontSize: 15 },
});