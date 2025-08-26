<?php

namespace App\Controllers;

use App\Services\GeocoderService;
use App\Core\Logger;
use App\Core\Database;
use App\Core\HybridAuth;
use Firebase\JWT\JWT;
use Exception;
use PDO;

class SearchController
{
    /**
     * Handles the smart search requests by using the GeocoderService.
     */
    public static function search()
    {
        $query = $_GET['query'] ?? '';
        $source = 'no-results';

        try {
            $geocoder = new GeocoderService();
            $suggestions = $geocoder->getLocationSuggestions($query);

            if (!empty($suggestions)) {
                // The source is embedded in each suggestion, we can just grab it from the first one.
                $source = $suggestions[0]['source'];
            }

            http_response_code(200);
            // The frontend now expects a direct array of suggestions.
            // The source is already embedded within each suggestion object.
            echo json_encode($suggestions);
        } catch (Exception $e) {
            Logger::error("Search failed for query '{$query}'", ['error' => $e->getMessage()]);
            http_response_code(500);
            echo json_encode([
                'error' => 'Search failed',
                'message' => $e->getMessage()
            ]);
        }
    }

    /**
     * Handles reverse geocoding requests (coordinates to address).
     * This method is NOT protected - used for general purposes.
     */
    public static function reverseGeocode()
    {
        $lat = $_GET['lat'] ?? null;
        $lon = $_GET['lon'] ?? null;

        if (!$lat || !$lon) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Latitude and longitude are required'
            ]);
            return;
        }

        try {
            $geocoder = new GeocoderService();
            $result = $geocoder->reverseGeocode((float)$lat, (float)$lon);

            if ($result) {
                http_response_code(200);
                echo json_encode([
                    'success' => true,
                    'data' => $result
                ]);
            } else {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'No address found for the given coordinates'
                ]);
            }
        } catch (Exception $e) {
            Logger::error("Reverse geocoding failed for lat: {$lat}, lon: {$lon}", ['error' => $e->getMessage()]);
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Reverse geocoding failed'
            ]);
        }
    }

    /**
     * Handles protected reverse geocoding requests for drivers.
     * Requires valid driver JWT token.
     */
    public static function driverReverseGeocode()
    {
        // Validate driver JWT token
        $driverData = self::getDriverFromToken();
        if (!$driverData) {
            return; // Error response already sent
        }

        $lat = $_GET['lat'] ?? null;
        $lon = $_GET['lon'] ?? null;

        if (!$lat || !$lon) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Latitude and longitude are required'
            ]);
            return;
        }

        try {
            $geocoder = new GeocoderService();
            $result = $geocoder->reverseGeocode((float)$lat, (float)$lon);

            if ($result) {
                http_response_code(200);
                echo json_encode([
                    'success' => true,
                    'data' => $result
                ]);
            } else {
                http_response_code(404);
                echo json_encode([
                    'success' => false,
                    'message' => 'No address found for the given coordinates'
                ]);
            }
        } catch (Exception $e) {
            Logger::error("Driver reverse geocoding failed", [
                'error' => $e->getMessage(),
                'lat' => $lat,
                'lon' => $lon,
                'driver_id' => $driverData['id']
            ]);
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Reverse geocoding failed'
            ]);
        }
    }

    /**
     * Check for recent searches of specific addresses from activity logs.
     * Returns info about who searched for similar addresses recently.
     */
    public static function getRecentSearches()
    {
        $query = $_GET['query'] ?? '';

        if (empty($query) || strlen($query) < 3) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'message' => 'Query must be at least 3 characters long'
            ]);
            return;
        }

        try {
            $user = HybridAuth::getCurrentUser();
            if (!$user || !isset($user->id)) {
                http_response_code(401);
                echo json_encode([
                    'success' => false,
                    'message' => 'Authentication required'
                ]);
                return;
            }

            $pdo = Database::getConnection();

            // Look for similar addresses in activity logs from today only
            $stmt = $pdo->prepare("
                SELECT 
                    UNIX_TIMESTAMP(a.created_at) as created_timestamp,
                    a.details,
                    u.username,
                    u.full_name,
                    u.role
                FROM activity_logs a
                JOIN users u ON a.user_id = u.id
                WHERE a.action = 'distance_batch_calculated'
                AND a.user_id != :current_user_id
                AND DATE(a.created_at) = CURDATE()
                AND JSON_EXTRACT(a.details, '$.destination') IS NOT NULL
                ORDER BY a.created_at DESC
                LIMIT 50
            ");

            $stmt->execute([':current_user_id' => $user->id]);
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $matches = [];
            $queryLower = strtolower(trim($query));

            foreach ($results as $row) {
                $details = json_decode($row['details'], true);
                $destination = $details['destination'] ?? '';
                $destinationLower = strtolower(trim($destination));

                // Check for exact match or very similar address
                if (self::isAddressSimilar($queryLower, $destinationLower)) {
                    $matches[] = [
                        'destination' => $destination,
                        'user' => $row['full_name'] ?: $row['username'],
                        'role' => $row['role'],
                        'time_ago' => self::getTimeAgo($row['created_timestamp']),
                        'created_at' => date('Y-m-d H:i:s', $row['created_timestamp'])
                    ];
                }
            }

            // Remove duplicates and keep only the most recent for each user
            $uniqueMatches = [];
            foreach ($matches as $match) {
                $key = $match['user'] . '|' . $match['destination'];
                if (!isset($uniqueMatches[$key]) || $match['created_at'] > $uniqueMatches[$key]['created_at']) {
                    $uniqueMatches[$key] = $match;
                }
            }

            // Sort by most recent and limit to 3 matches
            $finalMatches = array_values($uniqueMatches);
            usort($finalMatches, function ($a, $b) {
                return strtotime($b['created_at']) - strtotime($a['created_at']);
            });

            $finalMatches = array_slice($finalMatches, 0, 3);

            http_response_code(200);
            echo json_encode([
                'success' => true,
                'matches' => $finalMatches
            ]);
        } catch (Exception $e) {
            Logger::error("Recent searches check failed", [
                'error' => $e->getMessage(),
                'query' => $query
            ]);
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'message' => 'Failed to check recent searches'
            ]);
        }
    }

    /**
     * Check if two addresses are similar enough to be considered the same.
     */
    private static function isAddressSimilar($query, $destination)
    {
        // Exact match
        if ($query === $destination) {
            return true;
        }

        // Remove common words and punctuation for comparison
        $normalizeAddress = function ($addr) {
            $addr = preg_replace('/[^\w\s]/', ' ', $addr);
            $addr = preg_replace('/\s+/', ' ', $addr);
            $addr = trim($addr);

            // Remove common words
            $commonWords = ['street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'lane', 'ln', 'boulevard', 'blvd', 'circle', 'cir', 'court', 'ct', 'place', 'pl', 'way', 'usa', 'united', 'states'];
            $words = explode(' ', $addr);
            $words = array_filter($words, function ($word) use ($commonWords) {
                return !in_array(strtolower($word), $commonWords) && strlen($word) > 1;
            });

            return implode(' ', $words);
        };

        $normalizedQuery = $normalizeAddress($query);
        $normalizedDestination = $normalizeAddress($destination);

        // Check if query is contained in destination or vice versa
        if (
            strpos($normalizedDestination, $normalizedQuery) !== false ||
            strpos($normalizedQuery, $normalizedDestination) !== false
        ) {
            return true;
        }

        // Check similarity using Levenshtein distance for short addresses
        if (strlen($normalizedQuery) < 20 && strlen($normalizedDestination) < 20) {
            $distance = levenshtein($normalizedQuery, $normalizedDestination);
            $maxLength = max(strlen($normalizedQuery), strlen($normalizedDestination));
            $similarity = 1 - ($distance / $maxLength);

            return $similarity > 0.8; // 80% similarity threshold
        }

        return false;
    }

    /**
     * Get human-readable time ago string.
     */
    private static function getTimeAgo($timestamp)
    {
        if (empty($timestamp)) {
            return 'recently';
        }

        $diff = time() - $timestamp;

        if ($diff < 60) {
            return 'just now';
        } elseif ($diff < 3600) {
            return floor($diff / 60) . 'm ago';
        } elseif ($diff < 86400) {
            return floor($diff / 3600) . 'h ago';
        } else {
            return floor($diff / 86400) . 'd ago';
        }
    }

    /**
     * Helper method to get driver data from JWT token.
     */
    private static function getDriverFromToken()
    {
        if (!isset($_SERVER['HTTP_AUTHORIZATION'])) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Authorization header missing.']);
            return null;
        }

        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
        list($jwt) = sscanf($authHeader, 'Bearer %s');

        if (!$jwt) {
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Invalid authorization header.']);
            return null;
        }

        try {
            $secretKey = $_ENV['JWT_SECRET'];
            if (empty($secretKey)) {
                throw new \Exception("JWT secret key is not configured.");
            }

            $decoded = JWT::decode($jwt, new \Firebase\JWT\Key($secretKey, 'HS256'));

            if (!isset($decoded->data) || $decoded->data->role !== 'driver') {
                http_response_code(403);
                echo json_encode(['success' => false, 'message' => 'Invalid token or insufficient permissions.']);
                return null;
            }

            return (array)$decoded->data;
        } catch (\Exception $e) {
            Logger::warning('Driver JWT validation failed', ['error' => $e->getMessage()]);
            http_response_code(401);
            echo json_encode(['success' => false, 'message' => 'Invalid or expired token.']);
            return null;
        }
    }
}
