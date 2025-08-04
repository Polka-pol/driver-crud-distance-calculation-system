<?php

namespace App\Services;

use App\Core\Logger;
use PDO;
use Exception;

/**
 * Service for handling distance caching operations
 */
class DistanceCacheService
{
    private ?PDO $pdo;

    public function __construct(?PDO $pdo = null)
    {
        $this->pdo = $pdo;
    }

    /**
     * Check cache for a single distance pair
     */
    public function checkCache(string $normalizedFrom, string $normalizedTo): ?array
    {
        if (!$this->pdo) return null;

        $sql = "SELECT distance_meters FROM driver_distances WHERE from_address = ? AND to_address = ?";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$normalizedFrom, $normalizedTo]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($result) {
            // Update usage stats
            $updateSql = "UPDATE driver_distances SET last_used = CURRENT_TIMESTAMP WHERE from_address = ? AND to_address = ?";
            $updateStmt = $this->pdo->prepare($updateSql);
            $updateStmt->execute([$normalizedFrom, $normalizedTo]);
            
            return [
                'distance' => (int) $result['distance_meters'],
                'source' => 'cache'
            ];
        }

        return null;
    }

    /**
     * Bulk cache check for multiple address pairs
     */
    public function bulkCacheCheck(array $processedOrigins, string $normalizedToAddress): array
    {
        if (!$this->pdo) return [];

        try {
            $cacheMap = [];
            $addressPairs = [];
            $params = [];
            
            foreach ($processedOrigins as $processedOrigin) {
                $normalizedFromAddress = $processedOrigin['normalizedFromAddress'];
                $addressPairs[] = "(?, ?)";
                $params[] = $normalizedFromAddress;
                $params[] = $normalizedToAddress;
            }

            if (empty($addressPairs)) return [];

            $sql = "SELECT from_address, to_address, distance_meters 
                    FROM driver_distances 
                    WHERE (from_address, to_address) IN (" . implode(',', $addressPairs) . ")";
            
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            $cacheResults = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($cacheResults as $row) {
                $cacheKey = $row['from_address'] . '|' . $row['to_address'];
                $cacheMap[$cacheKey] = [
                    'distance' => (int) $row['distance_meters'],
                    'source' => 'cache'
                ];
            }

            if (!empty($cacheResults)) {
                $this->bulkUpdateCacheUsage($cacheResults);
            }

            return $cacheMap;

        } catch (Exception $e) {
            Logger::error("Bulk cache check failed", ['error' => $e->getMessage()]);
            return [];
        }
    }

    /**
     * Cache a distance result
     */
    public function cacheDistance(string $normalizedFrom, string $normalizedTo, array $distanceData): void
    {
        if (!$this->pdo) return;

        $sql = "INSERT INTO driver_distances (from_address, to_address, distance_meters)
                VALUES (:from, :to, :distance)
                ON DUPLICATE KEY UPDATE
                    last_used = CURRENT_TIMESTAMP,
                    distance_meters = VALUES(distance_meters)";

        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute([
                ':from' => $normalizedFrom,
                ':to' => $normalizedTo,
                ':distance' => $distanceData['distance']
            ]);
            
        } catch (Exception $e) {
            Logger::error("Failed to cache distance", [
                'normalizedFrom' => $normalizedFrom, 
                'normalizedTo' => $normalizedTo, 
                'error' => $e->getMessage()
            ]);
        }
    }

    /**
     * Bulk update cache usage stats
     */
    private function bulkUpdateCacheUsage(array $cacheResults): void
    {
        if (!$this->pdo || empty($cacheResults)) return;
        
        if ($this->tryUnionAllBulkUpdate($cacheResults)) {
            return;
        }
        
        $this->fallbackIndividualUpdates($cacheResults);
    }

    /**
     * Optimized bulk update using UNION ALL
     */
    private function tryUnionAllBulkUpdate(array $cacheResults): bool
    {
        try {
            $unionClauses = [];
            $params = [];
            
            foreach ($cacheResults as $index => $row) {
                if ($index === 0) {
                    $unionClauses[] = "SELECT ? as from_addr, ? as to_addr";
                } else {
                    $unionClauses[] = "UNION ALL SELECT ?, ?";
                }
                $params[] = $row['from_address'];
                $params[] = $row['to_address'];
            }

            if (empty($unionClauses)) return false;
            
            $sql = "UPDATE driver_distances d
                    JOIN (
                        " . implode(' ', $unionClauses) . "
                    ) AS updates 
                    ON d.from_address = updates.from_addr 
                    AND d.to_address = updates.to_addr
                    SET d.last_used = CURRENT_TIMESTAMP";
            
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            
            return true;
            
        } catch (Exception $e) {
            Logger::error("UNION ALL bulk cache update failed", [
                'error' => $e->getMessage(),
                'records_attempted' => count($cacheResults)
            ]);
            
            return false;
        }
    }

    /**
     * Fallback: Individual updates in transaction
     */
    private function fallbackIndividualUpdates(array $cacheResults): void
    {
        if (!$this->pdo || empty($cacheResults)) return;
        
        try {
            $this->pdo->beginTransaction();
            
            $sql = "UPDATE driver_distances 
                    SET last_used = CURRENT_TIMESTAMP 
                    WHERE from_address = ? AND to_address = ?";
            $stmt = $this->pdo->prepare($sql);
            
            foreach ($cacheResults as $row) {
                $stmt->execute([$row['from_address'], $row['to_address']]);
            }
            
            $this->pdo->commit();
            
        } catch (Exception $e) {
            $this->pdo->rollBack();
            Logger::error("Fallback individual cache updates failed", [
                'error' => $e->getMessage(),
                'records_attempted' => count($cacheResults)
            ]);
        }
    }
} 