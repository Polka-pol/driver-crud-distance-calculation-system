-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: dr542239.mysql.ukraine.com.ua:3306
-- Generation Time: Aug 12, 2025 at 12:05 PM
-- Server version: 5.7.44-53-log
-- PHP Version: 7.4.33

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `dr542239_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `truck_location_history`
--

CREATE TABLE `truck_location_history` (
  `id` int(11) NOT NULL,
  `truck_id` int(11) NOT NULL,
  `truck_number` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `changed_by_user_id` int(11) DEFAULT NULL,
  `changed_by_username` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `truck_location_history`
--

INSERT INTO `truck_location_history` (`id`, `truck_id`, `truck_number`, `old_location`, `new_location`, `changed_by_user_id`, `changed_by_username`, `created_at`) VALUES
(820, 122, '108', 'Smyrna, TN 37167', 'Smyrna, TN', 15, 'Vladyslav', '2025-08-11 22:20:51'),
(3, 1203, '127', 'Fife, WA 98424', 'Akron, OH 44333', 18, 'Carl Banks', '2025-08-04 21:47:25'),
(58, 474, '464', 'Deer Park, NY 11729', 'Lawrence, NY 11559', 18, 'Carl Banks', '2025-08-05 13:04:38'),
(59, 107, '101', 'Des Moines, IA 50315', 'Sabetha, KS 66534', 18, 'Carl Banks', '2025-08-05 13:05:31'),
(60, 1129, '587', 'Waco, TX 76708', 'Carrollton, TX 75006', 18, 'Carl Banks', '2025-08-05 13:06:54'),
(61, 285, '329', 'Morrisville, NC 27560', 'Franklinton, NC 27525', 18, 'Carl Banks', '2025-08-05 13:07:45');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `truck_location_history`
--
ALTER TABLE `truck_location_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_truck_id` (`truck_id`),
  ADD KEY `idx_created_at` (`created_at`),
  ADD KEY `idx_changed_by_user` (`changed_by_user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `truck_location_history`
--
ALTER TABLE `truck_location_history`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=824;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `truck_location_history`
--
ALTER TABLE `truck_location_history`
  ADD CONSTRAINT `truck_location_history_ibfk_1` FOREIGN KEY (`truck_id`) REFERENCES `Trucks` (`ID`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
