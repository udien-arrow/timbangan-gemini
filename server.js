const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const { WebSocketServer } = require('ws');
const express = require('express');
const http = require('http');
const mysql = require('mysql2/promise');
const path = require('path');
const cors = require('cors');
const session = require('express-session');

// --- Konfigurasi ---
const WEB_SERVER_PORT = 8080;
const DB_CONFIG = {
  host: 'localhost',
  user: 'root', // Ganti dengan user database Anda
  password: '', // Ganti dengan password database Anda
  database: 'timbangan_db'
};
// --------------------

// Variabel global untuk koneksi serial, parser, dan status
let port;
let parser;
let currentStatus = { status: 'disconnected', message: 'Belum ada koneksi.' };

// Inisialisasi Express App dan HTTP Server
const app = express();

// --- Middleware ---
app.use(cors()); // Mengizinkan Cross-Origin Resource Sharing
app.use(express.json()); // Middleware untuk parsing body JSON dari request

// Session Middleware
app.use(session({
    secret: 'timbangan-rahasia-yang-sangat-panjang-dan-unik', // Ganti dengan string acak yang panjang
    resave: false,
    saveUninitialized: false, // Tidak menyimpan sesi untuk pengguna yang belum login
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 } // Sesi berlaku selama 24 jam
}));

const server = http.createServer(app);

// Inisialisasi WebSocket Server dan menempelkannya ke HTTP server
const wss = new WebSocketServer({ server, path: '/ws' });

// Buat koneksi pool ke MySQL
const dbPool = mysql.createPool(DB_CONFIG);

/**
 * Helper function to broadcast messages to all connected WebSocket clients.
 * @param {object} message The message object to send (will be stringified).
 */
function broadcast(message) {
    const data = JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client.readyState === client.OPEN) {
            client.send(data);
        }
    });
}

wss.on('connection', (ws) => {
  console.log('Klien web terhubung.');
  // Kirim status koneksi saat ini ke klien yang baru terhubung
  ws.send(JSON.stringify({ type: 'status', payload: currentStatus }));
  ws.on('close', () => {
    console.log('Klien web terputus.');
  })
});

/**
 * Memproses data dari timbangan dan mengirimkannya via WebSocket.
 * @param {Buffer} data Data mentah dari timbangan.
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
    broadcast({ type: 'data', payload: processedData });
}

/**
 * Fungsi untuk memulai atau me-restart koneksi ke port serial.
 */
async function initializeSerialConnection() {
    try {
        // 1. Tutup koneksi lama jika ada
        if (port && port.isOpen) {
            console.log('Menutup koneksi serial yang ada...');
            await new Promise((resolve, reject) => {
                port.close(err => {
                    if (err) {
                        console.error("Gagal menutup port lama:", err);
                        // Tetap lanjut meskipun gagal menutup
                    }
                    console.log('Koneksi lama berhasil ditutup.');
                    resolve();
                });
            });
            port = null;
        }

        // 2. Ambil pengaturan terbaru dari database
        console.log('Mengambil pengaturan dari database...');
        const [rows] = await dbPool.query('SELECT setting_key, setting_value FROM settings');
        const settings = rows.reduce((acc, row) => {
            acc[row.setting_key] = row.setting_value;
            return acc;
        }, {});

        const portPath = settings.port_path;
        const baudRate = parseInt(settings.baud_rate, 10) || 9600;
        const stopBits = parseInt(settings.stop_bits, 10) || 1;
        const parity = settings.parity || 'none';

        if (!portPath) {
            currentStatus = { status: 'disconnected', message: 'Pengaturan port belum diatur.' };
            broadcast({ type: 'status', payload: currentStatus });
            console.log('Inisialisasi dibatalkan: Port path tidak ditemukan di pengaturan.');
            return;
        }

        console.log(`Mencoba membuka port ${portPath} dengan baud rate ${baudRate}, stop bits ${stopBits}, parity ${parity}...`);
        currentStatus = { status: 'connecting', message: `Menghubungkan ke ${portPath}...` };
        broadcast({ type: 'status', payload: currentStatus });

        // 3. Buat instance SerialPort baru
        port = new SerialPort({
            path: portPath,
            baudRate: baudRate,
            dataBits: 8,
            stopBits: stopBits,
            parity: parity
        });

        parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));

        // 4. Tambahkan event listener
        port.on('open', () => {
            console.log(`Port serial ${portPath} berhasil dibuka.`);
            currentStatus = { status: 'connected', message: `Terhubung ke ${portPath}` };
            broadcast({ type: 'status', payload: currentStatus });
        });
        port.on('error', (err) => {
            console.error('Error pada port serial:', err.message);
            currentStatus = { status: 'error', message: `Error: ${err.message}` };
            broadcast({ type: 'status', payload: currentStatus });
        });
        port.on('close', () => {
            console.log(`Koneksi serial ${portPath} ditutup.`);
            // Hanya update status jika penutupan tidak disengaja
            if (currentStatus.status === 'connected' || currentStatus.status === 'connecting') {
                currentStatus = { status: 'disconnected', message: 'Koneksi terputus.' };
                broadcast({ type: 'status', payload: currentStatus });
            }
        });
        parser.on('data', handleScaleData);

    } catch (error) {
        console.error('Error saat inisialisasi koneksi serial:', error);
        currentStatus = { status: 'error', message: `Error inisialisasi: ${error.message}` };
        broadcast({ type: 'status', payload: currentStatus });
    }
}

// === Rute Publik (Tidak Perlu Login) ===

// Sajikan halaman login
app.get('/login.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Endpoint untuk proses login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ message: 'Username dan password harus diisi.' });
    }
    try {
        const [rows] = await dbPool.query('SELECT id, password FROM users WHERE username = ?', [username]);
        if (rows.length === 0) {
            return res.status(401).json({ message: 'Username atau password salah.' });
        }
        const user = rows[0];
        // PENTING: Di aplikasi production, gunakan bcrypt.compare(password, user.password)
        if (password === user.password) {
            req.session.userId = user.id;
            req.session.username = username;
            res.json({ message: 'Login berhasil.' });
        } else {
            res.status(401).json({ message: 'Username atau password salah.' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
    }
});

// Endpoint untuk proses logout
app.post('/api/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'Gagal logout.' });
        }
        res.clearCookie('connect.sid'); // Nama cookie default dari express-session
        res.json({ message: 'Logout berhasil.' });
    });
});


// === Middleware untuk Proteksi Rute ===
// Semua rute di bawah ini sekarang memerlukan login
app.use((req, res, next) => {
    // WebSocket connections don't have sessions, so we skip this check for them.
    // The initial HTTP upgrade request for WebSocket is handled by the server before this middleware.
    if (req.ws) {
        return next();
    }
    if (req.session && req.session.userId) {
        return next(); // Pengguna sudah login, lanjutkan
    }
    // Jika belum login, alihkan ke halaman login
    res.redirect('/login.html');
});

// === Rute Terproteksi ===

// Sajikan file-file statis (index.html, master.html, dll)
app.use(express.static(__dirname));

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
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
        return res.status(400).json({ message: 'ID Transaksi tidak valid.' });
    }

    try {
        console.log(`[DEBUG] Mencari transaksi di database dengan ID: ${id}`);
        const query = 'SELECT * FROM transactions WHERE id = ?';
        const [rows] = await dbPool.query(query, [id]);
        console.log(`[DEBUG] Hasil query database:`, rows);

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
        // Langkah 1: Cek apakah No. Surat Jalan sudah ada untuk mencegah duplikasi.
        const [existing] = await dbPool.query('SELECT id FROM transactions WHERE do_number = ?', [do_number]);
        if (existing.length > 0) {
            return res.status(409).json({ message: `No. Surat Jalan "${do_number}" sudah terdaftar.` });
        }

        // Langkah 2: Jika tidak ada, lanjutkan menyimpan data.
        const query = `
            INSERT INTO transactions (vendor_name, item_name, plate_number, do_number, weight_1, status) 
            VALUES (?, ?, ?, ?, ?, 'pending')
        `;
        const values = [vendor_name, item_name, plate_number, do_number, weight_1];
        await dbPool.query(query, values);
        res.status(201).json({ message: 'Data Timbang 1 berhasil disimpan.' });
    } catch (error) {
        // Fallback jika ada race condition dan constraint di database (jika kolom do_number di-set UNIQUE)
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: `No. Surat Jalan "${do_number}" sudah terdaftar.` });
        }
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
        res.json({ message: 'Transaksi berhasil diselesaikan.', id: parseInt(id, 10) });
    } catch (error) {
        console.error('API Error - Gagal memperbarui transaksi:', error);
        res.status(500).json({ message: 'Gagal menyimpan data ke database.' });
    }
});

// Endpoint untuk mengambil data timbangan yang sudah selesai (dengan fitur pencarian)
app.get('/api/transactions', async (req, res) => {
    try {
        const { plateNumber, startDate, endDate } = req.query;

        let baseQuery = `
            SELECT do_number, vendor_name, item_name, net_weight, created_at FROM transactions 
            WHERE status = 'completed'
        `;
        const params = [];
        const conditions = [];

        if (plateNumber) {
            conditions.push('plate_number LIKE ?');
            params.push(`%${plateNumber}%`);
        }

        if (startDate) {
            conditions.push('DATE(created_at) >= ?');
            params.push(startDate);
        }

        if (endDate) {
            conditions.push('DATE(created_at) <= ?');
            params.push(endDate);
        }

        if (conditions.length > 0) {
            baseQuery += ' AND ' + conditions.join(' AND ');
        }

        baseQuery += ' ORDER BY created_at DESC';

        // Batasi hasil hanya jika tidak ada parameter pencarian
        if (params.length === 0) {
            baseQuery += ' LIMIT 10';
        } else {
            baseQuery += ' LIMIT 100'; // Batasi hasil pencarian agar tidak terlalu besar
        }

        const [rows] = await dbPool.query(baseQuery, params);
        res.json(rows);
    } catch (error) {
        console.error('API Error - Gagal mengambil riwayat transaksi:', error);
        res.status(500).json({ message: 'Gagal mengambil riwayat dari database.' });
    }
});

// Endpoint untuk mengambil daftar port serial dan pengaturan saat ini
app.get('/api/serial/settings', async (req, res) => {
    try {
        const availablePorts = await SerialPort.list();
        const [rows] = await dbPool.query('SELECT setting_key, setting_value FROM settings');
        
        const savedSettings = rows.reduce((acc, row) => {
            acc[row.setting_key] = row.setting_value;
            return acc;
        }, {});

        const currentSettings = {
            path: savedSettings.port_path,
            baudRate: savedSettings.baud_rate ? parseInt(savedSettings.baud_rate, 10) : 9600,
            stopBits: savedSettings.stop_bits ? parseInt(savedSettings.stop_bits, 10) : 1,
            parity: savedSettings.parity || 'none'
        };

        res.json({
            ports: availablePorts,
            current: currentSettings
        });
    } catch (error) {
        console.error('API Error - Gagal mengambil pengaturan serial:', error);
        res.status(500).json({ message: 'Gagal mengambil pengaturan dari server.' });
    }
});

// Endpoint untuk menyimpan pengaturan serial baru
app.post('/api/serial/settings', async (req, res) => {
    const { path, baudRate, stopBits, parity } = req.body;
    if (!path || !baudRate || !stopBits || !parity) {
        return res.status(400).json({ message: 'Semua field pengaturan harus diisi.' });
    }

    try {
        console.log('Menyimpan pengaturan baru:', req.body);
        const query = 'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)';
        await dbPool.query(query, ['port_path', path]);
        await dbPool.query(query, ['baud_rate', baudRate]);
        await dbPool.query(query, ['stop_bits', stopBits]);
        await dbPool.query(query, ['parity', parity]);

        initializeSerialConnection(); // Restart koneksi di background
        res.json({ message: 'Pengaturan disimpan. Mencoba menghubungkan kembali...' });
    } catch (error) {
        console.error('API Error - Gagal menyimpan settings:', error);
        res.status(500).json({ message: 'Gagal menyimpan pengaturan ke database.' });
    }
});

// === Master Data Endpoints ===

// Endpoint untuk mengambil semua vendor
app.get('/api/vendors', async (req, res) => {
    try {
        const [rows] = await dbPool.query('SELECT id, vendor_code, vendor_name, address, phone FROM vendors ORDER BY vendor_name ASC');
        res.json(rows);
    } catch (error) {
        console.error('API Error - Gagal mengambil data vendor:', error);
        res.status(500).json({ message: 'Gagal mengambil data vendor dari database.' });
    }
});

// Endpoint untuk menyimpan vendor baru
app.post('/api/vendors', async (req, res) => {
    const { vendor_name, address, phone } = req.body;
    if (!vendor_name || !vendor_name.trim()) {
        return res.status(400).json({ message: 'Nama Vendor harus diisi.' });
    }
    try {
        // Buat kode vendor otomatis yang simpel, contoh: VDR-1678886400000
        const vendor_code = `VDR-${Date.now()}`;
        const query = 'INSERT INTO vendors (vendor_code, vendor_name, address, phone) VALUES (?, ?, ?, ?)';
        await dbPool.query(query, [vendor_code, vendor_name.trim(), address ? address.trim() : null, phone ? phone.trim() : null]);
        res.status(201).json({ message: 'Vendor baru berhasil disimpan.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: `Gagal membuat kode vendor unik, silakan coba lagi.` });
        }
        console.error('API Error - Gagal menyimpan vendor:', error);
        res.status(500).json({ message: 'Gagal menyimpan vendor ke database.' });
    }
});

// Endpoint untuk mengambil semua barang
app.get('/api/items', async (req, res) => {
    try {
        const [rows] = await dbPool.query('SELECT id, item_code, item_name, unit FROM items ORDER BY item_name ASC');
        res.json(rows);
    } catch (error) {
        console.error('API Error - Gagal mengambil data barang:', error);
        res.status(500).json({ message: 'Gagal mengambil data barang dari database.' });
    }
});

// Endpoint untuk MENGUPDATE vendor
app.put('/api/vendors/:id', async (req, res) => {
    const { id } = req.params;
    const { vendor_name, address, phone } = req.body;

    if (!vendor_name || !vendor_name.trim()) {
        return res.status(400).json({ message: 'Nama Vendor harus diisi.' });
    }

    try {
        const query = 'UPDATE vendors SET vendor_name = ?, address = ?, phone = ? WHERE id = ?';
        const [result] = await dbPool.query(query, [vendor_name.trim(), address ? address.trim() : null, phone ? phone.trim() : null, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Vendor tidak ditemukan.' });
        }
        res.json({ message: 'Data vendor berhasil diperbarui.' });
    } catch (error) {
        console.error('API Error - Gagal memperbarui vendor:', error);
        res.status(500).json({ message: 'Gagal memperbarui data vendor di database.' });
    }
});

// Endpoint untuk MENGHAPUS vendor
app.delete('/api/vendors/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const query = 'DELETE FROM vendors WHERE id = ?';
        const [result] = await dbPool.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Vendor tidak ditemukan.' });
        }
        res.json({ message: 'Vendor berhasil dihapus.' });
    } catch (error)
    {
        console.error('API Error - Gagal menghapus vendor:', error);
        res.status(500).json({ message: 'Gagal menghapus data dari database.' });
    }
});

// Endpoint untuk MENGUPDATE barang
app.put('/api/items/:id', async (req, res) => {
    const { id } = req.params;
    const { item_name, unit } = req.body;

    if (!item_name || !item_name.trim()) {
        return res.status(400).json({ message: 'Nama Barang harus diisi.' });
    }

    try {
        const query = 'UPDATE items SET item_name = ?, unit = ? WHERE id = ?';
        const [result] = await dbPool.query(query, [item_name.trim(), unit ? unit.trim() : null, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Barang tidak ditemukan.' });
        }
        res.json({ message: 'Data barang berhasil diperbarui.' });
    } catch (error) {
        console.error('API Error - Gagal memperbarui barang:', error);
        res.status(500).json({ message: 'Gagal memperbarui data barang di database.' });
    }
});

// Endpoint untuk menyimpan barang baru
app.post('/api/items', async (req, res) => {
    const { item_name, unit } = req.body;
    if (!item_name || !item_name.trim()) {
        return res.status(400).json({ message: 'Nama Barang harus diisi.' });
    }
    try {
        // Buat kode barang otomatis yang simpel, contoh: ITM-1678886400000
        const item_code = `ITM-${Date.now()}`;
        const query = 'INSERT INTO items (item_code, item_name, unit) VALUES (?, ?, ?)';
        await dbPool.query(query, [item_code, item_name.trim(), unit ? unit.trim() : null]);
        res.status(201).json({ message: 'Barang baru berhasil disimpan.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: `Gagal membuat kode barang unik, silakan coba lagi.` });
        }
        console.error('API Error - Gagal menyimpan barang:', error);
        res.status(500).json({ message: 'Gagal menyimpan barang ke database.' });
    }
});

// Endpoint untuk MENGHAPUS barang
app.delete('/api/items/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const query = 'DELETE FROM items WHERE id = ?';
        const [result] = await dbPool.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Barang tidak ditemukan.' });
        }
        res.json({ message: 'Barang berhasil dihapus.' });
    } catch (error) {
        console.error('API Error - Gagal menghapus barang:', error);
        res.status(500).json({ message: 'Gagal menghapus data dari database.' });
    }
});

// Rute utama, alihkan ke halaman penimbangan jika sudah login
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// Jalankan server
server.listen(WEB_SERVER_PORT, () => {
    console.log(`Server berjalan di http://localhost:${WEB_SERVER_PORT}`);
    // Inisialisasi koneksi serial saat server pertama kali berjalan
    initializeSerialConnection();
});
