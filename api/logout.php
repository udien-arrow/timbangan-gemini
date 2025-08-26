<?php
// Selalu mulai session untuk dapat mengakses dan menghancurkannya
session_start();

header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");

// 1. Hapus semua variabel session
$_SESSION = [];

// 2. Hancurkan session
session_destroy();

// 3. Hapus cookie session jika ada
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params["path"], $params["domain"], $params["secure"], $params["httponly"]);
}

// Kirim respons sukses
http_response_code(200);
echo json_encode(["success" => true, "message" => "Logout berhasil."]);
?>