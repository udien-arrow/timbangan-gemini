<?php
//echo password_hash('admin123', PASSWORD_DEFAULT);
// Selalu mulai session di awal script
session_start();

/**
 * Mengatur header HTTP untuk respons.
 * Ini penting agar browser tahu bahwa responsnya adalah JSON dan
 * untuk mengizinkan permintaan dari domain/port yang berbeda (CORS)
 * selama pengembangan.
 */
header("Access-Control-Allow-Origin: *"); // Di produksi, ganti '*' dengan domain frontend Anda, misal: 'http://localhost'
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Pastikan request yang masuk adalah metode POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405); // Method Not Allowed
    echo json_encode(["success" => false, "message" => "Metode tidak diizinkan."]);
    exit();
}

// Ambil data JSON yang dikirim dari frontend
$data = json_decode(file_get_contents("php://input"));

// Validasi dasar: pastikan username dan password tidak kosong
if (empty($data->username) || empty($data->password)) {
    http_response_code(400); // Bad Request
    echo json_encode(["success" => false, "message" => "Username dan password harus diisi."]);
    exit();
}

/**
 * --- Simulasi Autentikasi Pengguna ---
 * Di aplikasi nyata, bagian ini akan terhubung ke database untuk mengambil
 * data pengguna berdasarkan username.
 */

// Kredensial yang valid (untuk contoh)
$valid_username = "admin";

// PENTING: Jangan pernah menyimpan password dalam bentuk teks biasa!
// Simpan hash-nya di database. Password untuk contoh ini adalah "password123".
// Anda bisa membuat hash ini dengan: echo password_hash('password123', PASSWORD_DEFAULT);
echo password_hash('admin123', PASSWORD_DEFAULT);
$hashed_password_from_db = '$2y$10$ChVpOk0Y/tT.T/qJf0aSleYrOFNGzJUgfYSvowGnGcJ651KKf14Zq'; // Contoh hash

// Verifikasi username dan password
if ($data->username === $valid_username && password_verify($data->password, $hashed_password_from_db)) {
    // Jika kredensial valid, set session untuk menandai pengguna sudah login
    $_SESSION['is_logged_in'] = true;
    $_SESSION['username'] = $data->username;
    $_SESSION['user_id'] = 1; // Contoh ID pengguna dari database

    // Kirim respons sukses
    http_response_code(200);
    echo json_encode(["success" => true, "message" => "Login berhasil."]);
} else {
    // Jika kredensial tidak valid, kirim respons error
    http_response_code(401); // Unauthorized
    echo json_encode(["success" => false, "message" => "Username atau password salah."]);
}
?>