/*
 Navicat Premium Data Transfer

 Source Server         : LOCAL
 Source Server Type    : MySQL
 Source Server Version : 100425
 Source Host           : localhost:3306
 Source Schema         : timbangan_db

 Target Server Type    : MySQL
 Target Server Version : 100425
 File Encoding         : 65001

 Date: 29/07/2025 16:14:17
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for items
-- ----------------------------
DROP TABLE IF EXISTS `items`;
CREATE TABLE `items`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `item_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `item_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `unit` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `item_code`(`item_code`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 4 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of items
-- ----------------------------
INSERT INTO `items` VALUES (2, 'ITM-1753763488229', 'BRANG COBA 2', 'Liter', '2025-07-29 11:31:28');
INSERT INTO `items` VALUES (3, 'ITM-1753763894356', 'BRANG COBA 1', 'KG', '2025-07-29 11:38:14');

-- ----------------------------
-- Table structure for settings
-- ----------------------------
DROP TABLE IF EXISTS `settings`;
CREATE TABLE `settings`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `setting_key` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `setting_value` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `setting_key`(`setting_key`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 15 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of settings
-- ----------------------------
INSERT INTO `settings` VALUES (1, 'port_path', 'COM9');
INSERT INTO `settings` VALUES (2, 'baud_rate', '9600');
INSERT INTO `settings` VALUES (9, 'stop_bits', '1');
INSERT INTO `settings` VALUES (10, 'parity', 'none');

-- ----------------------------
-- Table structure for transactions
-- ----------------------------
DROP TABLE IF EXISTS `transactions`;
CREATE TABLE `transactions`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `vendor_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `item_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `plate_number` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `do_number` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `weight_1` int NOT NULL,
  `weight_2` int NULL DEFAULT NULL,
  `gross_weight` int NULL DEFAULT NULL,
  `tare_weight` int NULL DEFAULT NULL,
  `net_weight` int NULL DEFAULT NULL,
  `status` enum('pending','completed') CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'pending',
  `completed_at` timestamp NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp,
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_plate_status`(`plate_number`, `status`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 6 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of transactions
-- ----------------------------
INSERT INTO `transactions` VALUES (1, 'TES VENDOR', 'TES BARANG', 'L 120', 'S001', 2000, 1000, 2000, 1000, 1000, 'completed', NULL, '2025-07-28 16:10:09');
INSERT INTO `transactions` VALUES (2, 'VENDOR TES', 'BARANG TES', 'L 12345', 'SJ 001', 1500, 1000, 1500, 1000, 500, 'completed', NULL, '2025-07-28 16:15:54');
INSERT INTO `transactions` VALUES (3, 'TDS', 'ASDAS', 'B1234', 'SJ321', 20000, 10000, 20000, 10000, 10000, 'completed', '2025-07-28 16:23:27', '2025-07-28 16:23:09');
INSERT INTO `transactions` VALUES (4, 'asdas', 'asdasd', 'B12345', 'asdas', 10000, 50000, 50000, 10000, 40000, 'completed', '2025-07-28 16:40:44', '2025-07-28 16:40:28');
INSERT INTO `transactions` VALUES (5, 'PT COBA1', 'BRANG COBA 1', 'L 123 LL', 'SJ 123', 150, 1000, 1000, 150, 850, 'completed', '2025-07-29 11:26:18', '2025-07-29 11:25:47');

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `username`(`username`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 2 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of users
-- ----------------------------
INSERT INTO `users` VALUES (1, 'admin', 'admin123');

-- ----------------------------
-- Table structure for vendors
-- ----------------------------
DROP TABLE IF EXISTS `vendors`;
CREATE TABLE `vendors`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `vendor_code` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `vendor_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL,
  `phone` varchar(25) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `vendor_code`(`vendor_code`) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 3 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_general_ci ROW_FORMAT = Dynamic;

-- ----------------------------
-- Records of vendors
-- ----------------------------
INSERT INTO `vendors` VALUES (1, 'VDR-1753762943990', 'PT COBA1', 'ALAMAT COBA 1', '007', '2025-07-29 11:22:23');
INSERT INTO `vendors` VALUES (2, 'VDR-1753763476342', 'PT COBA 2', 'ALAMAT 2', '008', '2025-07-29 11:31:16');

SET FOREIGN_KEY_CHECKS = 1;
