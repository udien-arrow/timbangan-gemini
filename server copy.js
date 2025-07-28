const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { WebSocketServer } = require('ws');

// --- Konfigurasi ---
// Ganti 'COM3' dengan port serial Anda (misal: '/dev/ttyUSB0' di Linux)
const SERIAL_PORT_PATH = 'COM9'; 
// Sesuaikan pengaturan ini dengan manual timbangan Anda!
const SERIAL_PORT_OPTIONS = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none',
};
const WEBSOCKET_PORT = 8080;
// --------------------

console.log('Mencoba membuka port serial...');

// Inisialisasi port serial
const port = new SerialPort({ path: SERIAL_PORT_PATH, ...SERIAL_PORT_OPTIONS }, (err) => {
  if (err) {
    console.error('Error membuka port serial:', err.message);
    console.error('Pastikan port sudah benar dan tidak digunakan oleh aplikasi lain.');
    process.exit(1);
  }
});

// Parser untuk membaca data baris per baris (umumnya data timbangan diakhiri newline)
const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

// Inisialisasi WebSocket Server
const wss = new WebSocketServer({ port: WEBSOCKET_PORT });

console.log(`Server WebSocket berjalan di ws://localhost:${WEBSOCKET_PORT}`);

wss.on('connection', (ws) => {
  console.log('Klien web terhubung.');
  ws.on('close', () => {
    console.log('Klien web terputus.');
  });
});

// Event handler ketika ada data masuk dari timbangan
parser.on('data', (data) => {
  // Data mentah dari timbangan
  const rawData = data.toString().trim();
  console.log(`Data diterima dari timbangan: "${rawData}"`);

  // --- Logika Parsing Data ---
  // Tujuan: Mengubah data seperti "ST,GS,+0000270kg" menjadi "270 kg".
  let processedData = rawData; // Nilai default adalah data mentah jika parsing gagal

  // Gunakan regular expression untuk menemukan pola angka dan unit.
  // Pola ini mencari:
  // - Tanda plus/minus opsional ([+-]?)
  // - Satu atau lebih digit (\d+)
  // - Teks "kg" (tidak case-sensitive karena flag 'i')
  const match = rawData.match(/([+-]?\d+)(kg)/i);

  if (match) {
    // Jika pola ditemukan, `match` akan menjadi array, contoh: ["+0000270kg", "+0000270", "kg"]
    const weightValue = parseInt(match[1], 10); // Mengubah "+0000270" menjadi angka 270
    const unit = match[2]; // "kg"
    processedData = `${weightValue} ${unit}`; // Menggabungkan menjadi "270 kg"
  } else {
    console.warn(`Format data tidak dikenali, mengirim data mentah: "${rawData}"`);
  }

  console.log(`Data diproses untuk dikirim ke web: "${processedData}"`);

  // Kirim data yang sudah diproses ke semua klien web yang terhubung
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(processedData);
    }
  });
});

port.on('open', () => {
  console.log(`Port serial ${SERIAL_PORT_PATH} berhasil dibuka.`);
});

port.on('error', (err) => {
  console.error('Error pada port serial:', err.message);
});
