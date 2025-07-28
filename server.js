const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { WebSocketServer } = require('ws');
const express = require('express');
const http = require('http');
const mysql = require('mysql2/promise');
const path = require('path');
const cors = require('cors');

// --- Konfigurasi ---
const WEB_SERVER_PORT = 8080;
const DB_CONFIG = {
  host: 'localhost',
  user: 'root', // Ganti dengan user database Anda
  password: '', // Ganti dengan password database Anda
  database: 'timbangan_db'
};
// --------------------

// Variabel global untuk koneksi serial dan parser
let port;
let parser;

// Inisialisasi Express App dan HTTP Server
const app = express();
app.use(cors()); // Mengizinkan Cross-Origin Resource Sharing
app.use(express.json()); // Middleware untuk parsing body JSON dari request

// Sajikan file frontend (index.html dan lainnya) dari direktori saat ini
app.use(express.static(__dirname));
const server = http.createServer(app);

// Inisialisasi WebSocket Server dan menempelkannya ke HTTP server
const wss = new WebSocketServer({ server });

// Buat koneksi pool ke MySQL
const dbPool = mysql.createPool(DB_CONFIG);

wss.on('connection', (ws) => {
  console.log('Klien web terhubung.');
  ws.on('close', () => {
    console.log('Klien web terputus.');
  })
});

/**
 * Fungsi untuk memproses data dari timbangan dan mengirimkannya via WebSocket.
 * @param {string} data Data mentah dari timbangan.
 */
function handleScaleData(data) {
    const rawData = data.toString().trim();
    console.log(`Data diterima dari timbangan: "${rawData}"`);

    let processedData = rawData;
    const match = rawData.match(/([+-]?\d+)(kg)/i);

    if (match) {
        // Asumsi: "+0000270kg" berarti 270 gram.
        const weightInGrams = parseInt(match[1], 10);
        processedData = `${weightInGrams} g`;
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
}

/**
 * Fungsi untuk memulai atau me-restart koneksi ke port serial.
 */
async function initializeSerialConnection() {
    try {
        // 1. Tutup koneksi lama jika ada
        if (port && port.isOpen) {
            console.log('Menutup koneksi serial yang lama...');
            await new Promise(resolve => port.close(resolve));
            console.log('Koneksi lama ditutup.');
        }

        // 2. Ambil pengaturan terbaru dari database
        console.log('Mengambil pengaturan dari database...');
        const [rows] = await dbPool.query('SELECT * FROM settings');
        const settings = rows.reduce((acc, row) => {
            acc[row.setting_key] = row.setting_value;
            return acc;
        }, {});

        const portPath = settings.port_path || 'COM1';
        const baudRate = parseInt(settings.baud_rate, 10) || 9600;
        const stopBits = parseInt(settings.stop_bits, 10) || 1;
        const parity = settings.parity || 'none';

        console.log(`Mencoba membuka port ${portPath} dengan baud rate ${baudRate}, stop bits ${stopBits}, parity ${parity}...`);

        // 3. Buat instance SerialPort baru
        port = new SerialPort({
            path: portPath,
            baudRate: baudRate,
            dataBits: 8,
            stopBits: stopBits,
            parity: parity,
            autoOpen: false, // Kita akan buka secara manual
        });

        parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

        // 4. Tambahkan event listener
        port.on('open', () => console.log(`Port serial ${portPath} berhasil dibuka.`));
        port.on('error', (err) => console.error('Error pada port serial:', err.message));
        parser.on('data', handleScaleData);

        // 5. Buka port
        port.open((err) => {
            if (err) {
                console.error(`Gagal membuka port ${portPath}:`, err.message);
            }
        });

    } catch (error) {
        console.error('Error saat inisialisasi koneksi serial:', error);
    }
}

// === API Endpoints ===

// Endpoint untuk mengambil pengaturan saat ini
app.get('/api/settings', async (req, res) => {
    try {
        const [rows] = await dbPool.query('SELECT setting_key, setting_value FROM settings');
        const settings = rows.reduce((acc, row) => {
            acc[row.setting_key] = row.setting_value;
            return acc;
        }, {});
        res.json(settings);
    } catch (error) {
        console.error('API Error - Gagal mengambil settings:', error);
        res.status(500).json({ message: 'Gagal mengambil pengaturan dari database.' });
    }
});

// Endpoint untuk mencari transaksi pending berdasarkan plat nomor untuk hari ini
app.get('/api/transactions/pending/:plateNumber', async (req, res) => {
    const { plateNumber } = req.params;
    try {
        const query = `
            SELECT * FROM transactions 
            WHERE plate_number = ? AND status = 'pending' AND DATE(created_at) = CURDATE()
            ORDER BY created_at DESC LIMIT 1
        `;
        const [rows] = await dbPool.query(query, [plateNumber]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ message: 'Tidak ada transaksi pending untuk plat nomor ini hari ini.' });
        }
    } catch (error) {
        console.error('API Error - Gagal mencari transaksi pending:', error);
        res.status(500).json({ message: 'Gagal mencari data di database.' });
    }
});

// Endpoint untuk mengambil satu transaksi berdasarkan ID
app.get('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const query = 'SELECT * FROM transactions WHERE id = ?';
        const [rows] = await dbPool.query(query, [id]);
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ message: 'Transaksi tidak ditemukan.' });
        }
    } catch (error) {
        console.error('API Error - Gagal mengambil transaksi:', error);
        res.status(500).json({ message: 'Gagal mengambil data dari database.' });
    }
});

// Endpoint untuk menyimpan data Timbang 1 (Transaksi Baru)
app.post('/api/transactions', async (req, res) => {
    const {
        vendor_name,
        item_name,
        plate_number,
        do_number,
        weight_1,
    } = req.body;

    // Validasi sederhana untuk Timbang 1
    if (!vendor_name || !item_name || !plate_number || !do_number || !weight_1) {
        return res.status(400).json({ message: 'Semua field dan Timbang 1 harus diisi.' });
    }

    try {
        const query = `
            INSERT INTO transactions (vendor_name, item_name, plate_number, do_number, weight_1, status) 
            VALUES (?, ?, ?, ?, ?, 'pending')
        `;
        const values = [vendor_name, item_name, plate_number, do_number, weight_1];
        await dbPool.query(query, values);
        res.status(201).json({ message: 'Data Timbang 1 berhasil disimpan.' });
    } catch (error) {
        console.error('API Error - Gagal menyimpan Timbang 1:', error);
        res.status(500).json({ message: 'Gagal menyimpan data ke database.' });
    }
});

// Endpoint untuk memperbarui dengan Timbang 2 (Update Transaksi)
app.put('/api/transactions/:id', async (req, res) => {
    const { id } = req.params;
    const {
        weight_2,
        gross_weight,
        tare_weight,
        net_weight
    } = req.body;

    if (!weight_2 || !gross_weight || !tare_weight || net_weight === undefined) {
        return res.status(400).json({ message: 'Data Timbang 2 tidak lengkap.' });
    }

    try {
        const query = `
            UPDATE transactions SET
            weight_2 = ?, gross_weight = ?, tare_weight = ?, net_weight = ?, status = 'completed'
            WHERE id = ?
        `;
        const values = [weight_2, gross_weight, tare_weight, net_weight, id];
        await dbPool.query(query, values);
        res.json({ message: 'Transaksi berhasil diselesaikan.', transactionId: id });
    } catch (error) {
        console.error('API Error - Gagal memperbarui transaksi:', error);
        res.status(500).json({ message: 'Gagal menyimpan data ke database.' });
    }
});

// Endpoint untuk mengambil 10 data timbangan terakhir yang sudah selesai
app.get('/api/transactions', async (req, res) => {
    try {
        // Mengambil semua kolom yang relevan dari tabel transactions
        const query = `
            SELECT do_number, vendor_name, item_name, net_weight, created_at FROM transactions 
            WHERE status = 'completed' ORDER BY created_at DESC LIMIT 10
        `;
        const [rows] = await dbPool.query(query);
        res.json(rows);
    } catch (error) {
        console.error('API Error - Gagal mengambil riwayat transaksi yang selesai:', error);
        res.status(500).json({ message: 'Gagal mengambil riwayat dari database.' });
    }
});

// Endpoint untuk menyimpan pengaturan baru
app.post('/api/settings', async (req, res) => {
    const { port_path, baud_rate, stop_bits, parity } = req.body;
    if (!port_path || !baud_rate || !stop_bits || !parity) {
        return res.status(400).json({ message: 'Semua field pengaturan harus diisi.' });
    }

    try {
        console.log('Menyimpan pengaturan baru:', req.body);
        // Gunakan query dengan placeholder (?) untuk keamanan (mencegah SQL Injection)
        const query = 'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)';
        await dbPool.query(query, ['port_path', port_path]);
        await dbPool.query(query, ['baud_rate', baud_rate]);
        await dbPool.query(query, ['stop_bits', stop_bits]);
        await dbPool.query(query, ['parity', parity]);

        // Restart koneksi serial dengan pengaturan baru
        await initializeSerialConnection();

        res.json({ message: 'Pengaturan berhasil disimpan dan koneksi serial di-restart.' });
    } catch (error) {
        console.error('API Error - Gagal menyimpan settings:', error);
        res.status(500).json({ message: 'Gagal menyimpan pengaturan ke database.' });
    }
});

// Jalankan server
server.listen(WEB_SERVER_PORT, async () => {
    console.log(`Server berjalan di http://localhost:${WEB_SERVER_PORT}`);
    // Inisialisasi koneksi serial saat server pertama kali berjalan
    await initializeSerialConnection();
});
