-- Migration script to extend truck_location_history table
-- Add new columns for tracking whenwillbethere and status changes
-- Run this in phpMyAdmin to modify the existing table

-- Add columns for whenwillbethere tracking
ALTER TABLE `truck_location_history` 
ADD COLUMN `old_whenwillbethere` datetime DEFAULT NULL AFTER `new_location`,
ADD COLUMN `new_whenwillbethere` datetime DEFAULT NULL AFTER `old_whenwillbethere`;

-- Add columns for status tracking  
ALTER TABLE `truck_location_history`
ADD COLUMN `old_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `new_whenwillbethere`,
ADD COLUMN `new_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `old_status`;

-- Add column to track which fields were changed (for better UI display)
ALTER TABLE `truck_location_history`
ADD COLUMN `changed_fields` JSON DEFAULT NULL AFTER `new_status`;

-- Add index for better performance on truck_id queries
ALTER TABLE `truck_location_history`
ADD INDEX `idx_truck_id_created` (`truck_id`, `created_at` DESC);

-- Optional: Add a comment to the table describing the new structure
ALTER TABLE `truck_location_history` 
COMMENT = 'Extended logging table for tracking changes to truck location, whenwillbethere, and status fields';
