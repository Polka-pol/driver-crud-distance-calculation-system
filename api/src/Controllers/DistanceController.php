<?php

namespace App\Controllers;

use App\Services\GeocoderService;
use App\Services\DistanceCacheService;
use App\Services\MapboxService;
use App\Core\Database;
use App\Core\Logger;
use App\Core\ActivityLogger;
use App\Core\EDTTimeConverter;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Exception;
use PDO;
use App\Core\HybridAuth;
use App\Core\MapboxTokenException;
use App\Core\MapboxRateLimitException;

class DistanceController
{
    private $pdo;
    private $geocoder;
    private $cacheService;
    private $mapboxService;

    public function __construct()
    {
        $this->pdo = Database::getConnection();
        $this->geocoder = new GeocoderService();
        $this->cacheService = new DistanceCacheService($this->pdo);
        $this->mapboxService = new MapboxService();
    }

    /**
     * Handles single distance calculation requests.
     */
    public static function process()
    {
        $controller = new self();
        $controller->calculate();
    }

    /**
     * Handles batch distance calculation requests.
     */
    public static function batchProcess()
    {
        $controller = new self();
        $controller->calculateBatch();
    }

    /**
     * Calculates a single distance.
     */
    public function calculate()
    {
        $input = json_decode(file_get_contents('php://input'), true);
        $originQuery = $input['origin'] ?? null;
        $destinationQuery = $input['destination'] ?? null;

        if (!$originQuery || !$destinationQuery) {
            http_response_code(400);
            echo json_encode(['error' => 'Origin and destination are required.']);
            return;
        }

        try {
            // Normalize addresses for cache lookup first (no geocoding yet)
            $normalizedFrom = $this->normalizeAddress($originQuery);
            $normalizedTo = $this->normalizeAddress($destinationQuery);

            // 1. Check cache first
            $cachedDistance = $this->cacheService->checkCache($normalizedFrom, $normalizedTo);
            if ($cachedDistance) {
                http_response_code(200);
                echo json_encode($cachedDistance);
                return;
            }

            // 2. If not in cache, geocode locations
            $origin = $this->geocoder->getBestCoordinatesForLocation($originQuery);
            $destination = $this->geocoder->getBestCoordinatesForLocation($destinationQuery);

            if (!$origin || !$destination) {
                http_response_code(404);
                echo json_encode(['error' => 'Could not geocode one or both locations.']);
                return;
            }

            // 3. Call Mapbox Directions API
            $mapboxDistance = $this->mapboxService->getDistance($origin, $destination);

            // 4. Cache the new result using the same normalized addresses used for lookup
            $this->cacheService->cacheDistance($normalizedFrom, $normalizedTo, $mapboxDistance);

            http_response_code(200);
            echo json_encode($mapboxDistance);
        } catch (MapboxTokenException $e) {
            http_response_code(503);
            echo json_encode(['error' => 'Mapbox service temporarily unavailable.']);
        } catch (MapboxRateLimitException $e) {
            http_response_code(429);
            echo json_encode(['error' => 'Mapbox rate limit exceeded.']);
        } catch (Exception $e) {
            Logger::error('Distance calculation failed', ['error' => $e->getMessage()]);
            http_response_code(500);
            echo json_encode(['error' => 'Distance calculation failed.']);
        }
    }

    /**
     * Calculates distances for multiple origins to a single destination.
     */
    public function calculateBatch()
    {
        $input = json_decode(file_get_contents('php://input'), true);
        $destinationQuery = $input['destination'] ?? null;
        $queryType = $input['query_type'] ?? 'cache_check_with_stats';

        if (!$destinationQuery) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing destination.']);
            return;
        }

        // Check if origins are provided in the request (filtered by frontend)
        if (isset($input['origins']) && !empty($input['origins'])) {
            // Use filtered origins from frontend
            $originQueries = $this->prepareOriginsFromFrontend($input['origins']);
            Logger::info("Using filtered origins from frontend", [
                'count' => count($originQueries),
                'destination' => $destinationQuery
            ]);
        } else {
            // Fallback: fetch all from database (for backward compatibility)
            $originQueries = $this->fetchOriginsFromDatabase();
            Logger::info("Using all origins from database", [
                'count' => count($originQueries),
                'destination' => $destinationQuery
            ]);
        }

        if (empty($originQueries)) {
            http_response_code(404);
            echo json_encode(['error' => 'No trucks found in request or database.']);
            return;
        }

                    // Distance calculation batch started

        try {
            // Use the new helper to prepare addresses for cache check
            $preparedAddresses = $this->prepareAddressesForCacheCheck($originQueries, $destinationQuery);

            // STEP 1: Geocode and normalize destination once (if not already done via prepareAddressesForCacheCheck logic)
            // For batch, we need the actual coordinates of the destination for Mapbox Matrix API.
            $geocoder = new GeocoderService();
            $destination = $geocoder->getBestCoordinatesForLocation($destinationQuery);
            if (!$destination) {
                http_response_code(404);
                echo json_encode(['error' => 'Could not geocode the destination location.']);
                return;
            }
            $normalizedToAddress = $this->normalizeAddress($destination['formattedAddress']);

            $results = [];
            $originsToGeocodeAndFetch = [];
            $cacheHits = 0;
            $geocodingFailures = 0;

            // STEP 2: Check cache for all processed origins
            // This will use the normalized addresses from prepareAddressesForCacheCheck
            $cacheMap = $this->cacheService->bulkCacheCheck($preparedAddresses, $normalizedToAddress);

            foreach ($preparedAddresses as $preparedOrigin) {
                $driverId = $preparedOrigin['driverId'];
                $normalizedFromAddress = $preparedOrigin['normalizedFromAddress'];
                $originalAddress = $preparedOrigin['originalAddress'];

                $cacheKey = $normalizedFromAddress . '|' . $normalizedToAddress;
                if (isset($cacheMap[$cacheKey])) {
                    $cachedResult = $cacheMap[$cacheKey];
                    $results[$driverId] = $cachedResult;
                    $cacheHits++;
                } else {
                    // If not in cache, add to list for geocoding and Mapbox call
                    $dataToFetch = [
                        'driverId' => $driverId,
                        'originalAddress' => $originalAddress,
                        'normalizedFromAddress' => $normalizedFromAddress // Keep for caching later
                    ];

                    // Pass along coordinates if they were fetched from the database
                    if (isset($preparedOrigin['coordinates'])) {
                        $dataToFetch['coordinates'] = $preparedOrigin['coordinates'];
                    }

                    $originsToGeocodeAndFetch[] = $dataToFetch;
                }
            }

            // STEP 3: Geocode and fetch remaining from Mapbox Matrix API for uncached origins
            $mapboxStats = [
                'db_coordinate_hits' => 0,
                'geocoded_addresses' => 0,
                'total_uncached_and_geocoding_needed' => count($originsToGeocodeAndFetch),
                'chunks_count' => 0,
                'api_calls' => 0,
                'successful_results' => 0,
                'failed_results' => 0,
                'cache_saves' => 0
            ];



            $geocodedOriginsForMapbox = [];
            foreach ($originsToGeocodeAndFetch as $originData) {
                $originCoords = null;
                $coordinateSource = 'unknown';

                // Check if we have coordinates from database
                if (isset($originData['coordinates'])) {
                    $originCoords = $originData['coordinates'];
                    $coordinateSource = 'database';
                    $mapboxStats['db_coordinate_hits']++;
                } else {
                    // Fallback to geocoding
                    $originCoords = $geocoder->getBestCoordinatesForLocation($originData['originalAddress']);
                    $coordinateSource = 'geocoding';
                    $mapboxStats['geocoded_addresses']++;
                }

                if ($originCoords) {
                    $geocodedOriginsForMapbox[] = [
                        'driverId' => $originData['driverId'],
                        'normalizedFromAddress' => $originData['normalizedFromAddress'],
                        'coordinate_source' => $coordinateSource,
                        'origin' => [
                            'formattedAddress' => $originData['originalAddress'], // for logging
                            'lat' => $originCoords['lat'],
                            'lon' => $originCoords['lon']
                        ]
                    ];
                } else {
                    $results[$originData['driverId']] = [
                        'distance' => null,
                        'source' => 'geocoding_failed',
                        'coordinate_source' => $coordinateSource
                    ];
                    $geocodingFailures++;
                }
            }

            $matrixChunks = array_chunk($geocodedOriginsForMapbox, 24); // Mapbox limit is 25 (1 dest + 24 origins)
            $mapboxStats['chunks_count'] = count($matrixChunks);

            // Mapbox processing phase started

            foreach ($matrixChunks as $chunkIndex => $chunk) {
                // Process chunk

                // Check if we have only one origin - use Directions API instead of Matrix API
                if (count($chunk) === 1) {
                    $processedOrigin = $chunk[0];
                    $driverId = $processedOrigin['driverId'];

                    try {
                        // Use Directions API for single origin to avoid Mapbox Matrix API minimum requirement
                        $origin = $processedOrigin['origin'];

                        $distanceData = $this->mapboxService->getDistance($origin, $destination);
                        $mapboxStats['api_calls']++;

                        if ($distanceData && $distanceData['distance'] !== null) {
                            // Use pre-processed normalized addresses
                            $this->cacheService->cacheDistance($processedOrigin['normalizedFromAddress'], $normalizedToAddress, $distanceData);

                            $results[$driverId] = $distanceData;
                            $mapboxStats['successful_results']++;
                            $mapboxStats['cache_saves']++;
                        } else {
                            $results[$driverId] = ['distance' => null, 'source' => 'mapbox_failed'];
                            $mapboxStats['failed_results']++;
                        }
                    } catch (Exception $e) {
                        $results[$driverId] = ['distance' => null, 'source' => 'mapbox_failed'];
                        $mapboxStats['failed_results']++;
                    }
                } else {
                    // Multiple origins - use Matrix API
                    // Convert to format expected by Matrix API
                    $originCoordsForMatrix = [];
                    foreach ($chunk as $processedOrigin) {
                        $originCoordsForMatrix[] = $processedOrigin; // Pass the full processedOrigin structure
                    }

                    $matrixResults = $this->mapboxService->getDistancesMatrix($destination, $originCoordsForMatrix);
                    $mapboxStats['api_calls']++;

                    foreach ($chunk as $processedOrigin) {
                        $driverId = $processedOrigin['driverId'];
                        $distanceData = $matrixResults[$driverId] ?? null; // Matrix results are keyed by driverId after MapboxService refactor

                        if ($distanceData && $distanceData['distance'] !== null) {
                            $distanceData['source'] = 'mapbox';
                            // Use pre-processed normalized addresses
                            $this->cacheService->cacheDistance($processedOrigin['normalizedFromAddress'], $normalizedToAddress, $distanceData);

                            $results[$driverId] = $distanceData;
                            $mapboxStats['successful_results']++;
                            $mapboxStats['cache_saves']++;
                        } else {
                            $results[$driverId] = ['distance' => null, 'source' => 'mapbox_failed'];
                            $mapboxStats['failed_results']++;
                        }
                    }
                }
            }

            // Mapbox processing completed



            // Return the results
            http_response_code(200);
            echo json_encode($results);
        } catch (MapboxTokenException $e) {
            http_response_code(503);
            echo json_encode(['error' => 'Service Unavailable', 'message' => $e->getMessage()]);
        } catch (MapboxRateLimitException $e) {
            http_response_code(503);
            echo json_encode(['error' => 'Rate Limited', 'message' => $e->getMessage()]);
        } catch (Exception $e) {
            Logger::error("Batch distance calculation failed", ['error' => $e->getMessage()]);
            http_response_code(500);
            echo json_encode(['error' => 'Batch distance calculation failed', 'message' => $e->getMessage()]);
        }
    }

    public function checkCacheBatch()
    {
        $data = json_decode(file_get_contents('php://input'), true);
        $destinationQuery = $data['destination'] ?? null;
        $originQueries = $data['origins'] ?? null;

        if (!$destinationQuery) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing destination.']);
            return;
        }

        // Always fetch from database to get all truck data consistently
        $originQueries = $this->fetchOriginsFromDatabase();
        if (empty($originQueries)) {
            http_response_code(404);
            echo json_encode(['error' => 'No trucks found in database.']);
            return;
        }

        try {
            // Prepare addresses for cache check (no geocoding here)
            $preparedAddresses = $this->prepareAddressesForCacheCheck($originQueries, $destinationQuery);

            // STEP 1: Normalize destination once for cache lookup and geocode it
            $normalizedToAddress = $this->normalizeAddress($destinationQuery);
            $destinationCoords = $this->geocoder->getBestCoordinatesForLocation($destinationQuery);

            // STEP 2: Fast bulk cache check using prepared data
            $cacheMap = $this->cacheService->bulkCacheCheck($preparedAddresses, $normalizedToAddress);

            // STEP 3: Categorize results based on cache hits
            $cachedResults = [];
            $uncachedOrigins = [];

            foreach ($preparedAddresses as $preparedOrigin) {
                $driverId = $preparedOrigin['driverId'];
                $normalizedFromAddress = $preparedOrigin['normalizedFromAddress'];
                $originalAddress = $preparedOrigin['originalAddress'];

                $cacheKey = $normalizedFromAddress . '|' . $normalizedToAddress;

                if (isset($cacheMap[$cacheKey])) {
                    $cachedResults[$driverId] = $cacheMap[$cacheKey];
                } else {
                    // Keep original structure for uncached origins with coordinates if available
                    $uncachedItem = [
                        'id' => $driverId,
                        'address' => $originalAddress
                    ];

                    // Add coordinates if available from prepared data
                    if (isset($preparedOrigin['coordinates'])) {
                        $uncachedItem['coordinates'] = $preparedOrigin['coordinates'];
                        $uncachedItem['coordinate_source'] = $preparedOrigin['coordinate_source'] ?? 'database';
                    }

                    $uncachedOrigins[] = $uncachedItem;
                }
            }

            $cacheHits = count($cachedResults);
            $uncachedCount = count($uncachedOrigins);
            $totalDrivers = count($originQueries);
            $geocodingFailures = 0; // In this method, geocoding is not performed, so this is 0

            // Cache check completed - no logging for normal operations

            // FAST RESPONSE - send immediately to client
            http_response_code(200);
            echo json_encode([
                'cached' => $cachedResults,
                'uncached' => $uncachedOrigins,
                'destination_coordinates' => $destinationCoords,
                'stats' => [
                    'total_drivers' => $totalDrivers,
                    'cache_hits' => $cacheHits,
                    'uncached_count' => $uncachedCount,
                    'geocoding_failures' => $geocodingFailures // Always 0 for this method
                ]
            ]);

            // Finish the request to client immediately
            if (function_exists('fastcgi_finish_request')) {
                fastcgi_finish_request();
            }

            // BACKGROUND PHASE: Logging (doesn't block client)
            $this->backgroundStatsLogging([
                'destination' => $destinationQuery,
                'total_drivers' => $totalDrivers,
                'cache_hits' => $cacheHits,
                'uncached_count' => $uncachedCount,
                'geocoding_failures' => $geocodingFailures,
                'processed_origins' => $preparedAddresses, // Pass prepared addresses here
                'normalized_destination' => $normalizedToAddress
            ]);
        } catch (Exception $e) {
            Logger::error("Cache check failed for batch", ['error' => $e->getMessage()]);
            http_response_code(500);
            echo json_encode(['error' => 'Cache check failed', 'message' => $e->getMessage()]);
        }
    }

    private function logDistanceStats(string $destination, int $totalOrigins, int $cacheHits, int $mapboxRequests): void
    {
        if (!$this->pdo) {
            return;
        }

        $user = \App\Core\HybridAuth::getCurrentUser();
        if (!$user) {
            Logger::warning('Could not log distance stats, user not found in session.');
            return;
        }

        // Get both MySQL ID and Supabase UUID
        $userId = \App\Core\UserService::getMysqlId($user);
        $supabaseUserId = \App\Core\UserService::getSupabaseId($user);

        $sql = "INSERT INTO distance_log (user_id, supabase_user_id, source_address, total_origins, cache_hits, mapbox_requests, created_at)
                VALUES (:user_id, :supabase_user_id, :source_address, :total_origins, :cache_hits, :mapbox_requests, :created_at)";

        try {
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute([
                ':user_id' => $userId,
                ':supabase_user_id' => $supabaseUserId,
                ':source_address' => $destination,
                ':total_origins' => $totalOrigins,
                ':cache_hits' => $cacheHits,
                ':mapbox_requests' => $mapboxRequests,
                ':created_at' => \App\Core\TimeService::nowUtc()->format('Y-m-d H:i:s')
            ]);
        } catch (Exception $e) {
            Logger::error("Failed to log distance stats", ['error' => $e->getMessage()]);
        }
    }

    private function getDistancesFromMapboxMatrix(array $destination, array $originsChunk): array
    {
        if (empty($this->mapboxAccessToken)) {
            throw new Exception("Mapbox access token is not configured.");
        }

        $coords = [];
        $coords[] = "{$destination['lon']},{$destination['lat']}";
        foreach ($originsChunk as $origin) {
            $coords[] = "{$origin['origin']['lon']},{$origin['origin']['lat']}";
        }
        $coordinatesString = implode(';', $coords);
        $endpoint = "/directions-matrix/v1/mapbox/driving/{$coordinatesString}";

        $maxRetries = 10;
        $retryDelaySeconds = 5;

        for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
            try {
                $response = $this->httpClient->request('GET', $endpoint, [
                    'query' => [
                        'access_token' => $this->mapboxAccessToken,
                        'sources' => '0',
                        'annotations' => 'distance'
                    ]
                ]);

                $data = json_decode($response->getBody()->getContents(), true);

                if ($data['code'] !== 'Ok' || !isset($data['distances'])) {
                    throw new Exception('Invalid response from Mapbox Matrix API. Response: ' . json_encode($data));
                }

                $distances = $data['distances'][0];
                $results = [];

                for ($i = 1; $i < count($distances); $i++) {
                    $results[$i - 1] = [
                        'distance' => $distances[$i]
                    ];
                }
                return $results; // Success, exit loop
            } catch (RequestException $e) {
                if ($e->getResponse()) {
                    $statusCode = $e->getResponse()->getStatusCode();
                    $responseBody = $e->getResponse()->getBody()->getContents();

                    if ($statusCode === 401 && (strpos($responseBody, 'Invalid Token') !== false || strpos($responseBody, 'Not Authorized') !== false)) {
                        Logger::error("Mapbox Matrix API - Invalid Token", ['error' => $e->getMessage()]);
                        throw new MapboxTokenException("Mapbox API token is invalid or expired. Please contact support to update the token.");
                    }

                    if ($statusCode === 429) {
                        Logger::warning("Mapbox Matrix API rate limit hit. Attempt {$attempt}/{$maxRetries}. Retrying in {$retryDelaySeconds}s...", ['error' => $e->getMessage()]);
                        if ($attempt < $maxRetries) {
                            sleep($retryDelaySeconds);
                            continue; // Next attempt
                        } else {
                            // Max retries reached for rate limiting
                            throw new MapboxRateLimitException("Mapbox servers are busy. Processing may take longer than usual due to rate limiting.");
                        }
                    }
                }

                // For all other errors or if max retries are reached
                Logger::error("Mapbox Matrix API error after {$attempt} attempts", ['error' => $e->getMessage()]);
                return array_fill(0, count($originsChunk), null);
            }
        }

        // Should not be reached if loop is correct
        return array_fill(0, count($originsChunk), null);
    }

    private function checkDistanceCache(string $from, string $to): ?array
    {
        // Normalize addresses and delegate to the normalized version
        $normalizedFrom = $this->normalizeAddress($from);
        $normalizedTo = $this->normalizeAddress($to);

        return $this->checkDistanceCacheNormalized($normalizedFrom, $normalizedTo);
    }

    /**
     * Check cache with already normalized addresses (no additional normalization needed)
     */
    private function checkDistanceCacheNormalized(string $normalizedFrom, string $normalizedTo): ?array
    {
        if (!$this->pdo) {
            return null;
        }

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
     * Cache distance with already normalized addresses (no additional normalization needed)
     */
    private function cacheDistanceNormalized(string $normalizedFrom, string $normalizedTo, array $distanceData): void
    {
        if (!$this->pdo) {
            return;
        }

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
            Logger::error("Failed to cache normalized distance", [
                'normalizedFrom' => $normalizedFrom,
                'normalizedTo' => $normalizedTo,
                'error' => $e->getMessage()
            ]);
        }
    }

    private function getDistanceFromMapbox(array $origin, array $destination): array
    {
        if (empty($this->mapboxAccessToken)) {
            throw new Exception("Mapbox access token is not configured.");
        }

        $originCoords = "{$origin['lon']},{$origin['lat']}";
        $destCoords = "{$destination['lon']},{$destination['lat']}";
        $endpoint = "/directions/v5/mapbox/driving/{$originCoords};{$destCoords}";

        $maxRetries = 10;
        $retryDelaySeconds = 5;

        for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
            try {
                $response = $this->httpClient->request('GET', $endpoint, [
                    'query' => ['access_token' => $this->mapboxAccessToken, 'geometries' => 'geojson']
                ]);

                $data = json_decode($response->getBody()->getContents(), true);

                if (empty($data['routes'][0])) {
                    throw new Exception('No route found by Mapbox.');
                }

                $route = $data['routes'][0];
                return [
                    'distance' => (int) $route['distance'],
                    'source' => 'mapbox'
                ];
            } catch (RequestException $e) {
                if ($e->getResponse()) {
                    $statusCode = $e->getResponse()->getStatusCode();
                    $responseBody = $e->getResponse()->getBody()->getContents();

                    if ($statusCode === 401 && (strpos($responseBody, 'Invalid Token') !== false || strpos($responseBody, 'Not Authorized') !== false)) {
                        Logger::error("Mapbox Directions API - Invalid Token", ['origin' => $origin, 'destination' => $destination, 'error' => $e->getMessage()]);
                        throw new MapboxTokenException("Mapbox API token is invalid or expired. Please contact support to update the token.");
                    }

                    if ($statusCode === 429) {
                        Logger::warning("Mapbox Directions API rate limit hit. Attempt {$attempt}/{$maxRetries}. Retrying in {$retryDelaySeconds}s...", ['error' => $e->getMessage()]);
                        if ($attempt < $maxRetries) {
                            sleep($retryDelaySeconds);
                            continue; // Next attempt
                        } else {
                            // Max retries reached for rate limiting
                            throw new MapboxRateLimitException("Mapbox servers are busy. Processing may take longer than usual due to rate limiting.");
                        }
                    }
                }

                // For all other errors or if max retries are reached
                Logger::error("Mapbox Directions API error after {$attempt} attempts", ['origin' => $origin, 'destination' => $destination, 'error' => $e->getMessage()]);
                throw new Exception("Failed to get directions from Mapbox API after {$attempt} attempts.");
            }
        }

        throw new Exception("Failed to get directions from Mapbox API after all retries.");
    }

    private function cacheDistance(string $from, string $to, array $distanceData): void
    {
        // Normalize addresses and delegate to the normalized version
        $normalizedFrom = $this->normalizeAddress($from);
        $normalizedTo = $this->normalizeAddress($to);

        $this->cacheService->cacheDistance($normalizedFrom, $normalizedTo, $distanceData);
    }

    /**
     * Simplified address normalization - only lowercase since autofill already normalizes format
     * Autofill provides addresses in format: "City, ST ZIP"
     */
    private function normalizeAddress(string $address): string
    {
        return trim(strtolower($address));
    }

    /**
     * Bulk update cache usage stats for multiple records
     */
    private function bulkUpdateCacheUsage(array $cacheResults): void
    {
        if (!$this->pdo || empty($cacheResults)) {
            return;
        }

        // Try optimized UNION ALL approach first
        if ($this->tryUnionAllBulkUpdate($cacheResults)) {
            return; // Success!
        }

        // If UNION ALL fails, try fallback - no logging
        $this->fallbackIndividualUpdates($cacheResults);
    }

    /**
     * Optimized bulk update using UNION ALL (MySQL version compatible)
     */
    private function tryUnionAllBulkUpdate(array $cacheResults): bool
    {
        try {
            // Build UNION ALL queries - more compatible than VALUES
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

            if (empty($unionClauses)) {
                return false;
            }

            // Build efficient bulk update with UNION ALL + JOIN
            $sql = "UPDATE driver_distances d
                    JOIN (
                        " . implode(' ', $unionClauses) . "
                    ) AS updates 
                    ON d.from_address = updates.from_addr 
                    AND d.to_address = updates.to_addr
                    SET d.last_used = CURRENT_TIMESTAMP";

            // Execute the optimized query
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            $affectedRows = $stmt->rowCount();

            // Bulk cache update completed - no logging for normal operations

            return true; // Success!
        } catch (Exception $e) {
            Logger::error("❌ UNION ALL bulk cache update failed", [
                'error' => $e->getMessage(),
                'sql_method' => 'UNION_ALL_JOIN',
                'records_attempted' => count($cacheResults),
                'error_type' => get_class($e)
            ]);

            return false; // Will trigger fallback
        }
    }

    /**
     * Fallback method: Individual updates in transaction
     * Used if bulk UPDATE with UNION ALL fails
     */
    private function fallbackIndividualUpdates(array $cacheResults): void
    {
        if (!$this->pdo || empty($cacheResults)) {
            return;
        }

        try {
            // Begin transaction for atomicity
            $this->pdo->beginTransaction();

            // Prepare statement once for all updates
            $sql = "UPDATE driver_distances 
                    SET last_used = CURRENT_TIMESTAMP 
                    WHERE from_address = ? AND to_address = ?";
            $stmt = $this->pdo->prepare($sql);

            // Execute individual updates
            $successCount = 0;
            $failureCount = 0;

            foreach ($cacheResults as $index => $row) {
                try {
                    if ($stmt->execute([$row['from_address'], $row['to_address']])) {
                        $successCount++;
                    } else {
                        $failureCount++;
                    }
                } catch (Exception $rowException) {
                    $failureCount++;
                    // Log individual row failures only if significant
                    if ($failureCount <= 5) {
                        Logger::warning("Individual update failed for row", [
                            'row_index' => $index,
                            'from_address' => $row['from_address'],
                            'error' => $rowException->getMessage()
                        ]);
                    }
                }

                // Progress logging removed for performance
            }

            // Commit transaction
            $this->pdo->commit();

            // Fallback individual updates completed - no logging for normal operations
        } catch (Exception $e) {
            // Rollback on any major failure
            try {
                $this->pdo->rollback();
            } catch (Exception $rollbackException) {
                Logger::error("Failed to rollback transaction", [
                    'original_error' => $e->getMessage(),
                    'rollback_error' => $rollbackException->getMessage()
                ]);
            }

            Logger::error("❌ Fallback individual updates failed", [
                'error' => $e->getMessage(),
                'error_type' => get_class($e),
                'records_attempted' => count($cacheResults),
                'sql_method' => 'INDIVIDUAL_TRANSACTION'
            ]);
        }
    }

    /**
     * Background statistics logging (non-blocking)
     */
    private function backgroundStatsLogging(array $stats): void
    {
        try {
            $user = \App\Core\HybridAuth::getCurrentUser();
            if (!$user) {
                return;
            }

            // Skip backend logging - frontend will log accurate stats via logStats() endpoint
            // Backend doesn't have accurate mapbox_requests count (only uncached_count)
            // Frontend has the real breakdown: cache_hits + preliminary_calculations + mapbox_requests
        } catch (Exception $e) {
            // Even if logging fails, don't impact user experience
            Logger::error("Background stats logging failed", [
                'error' => $e->getMessage(),
                'stats' => $stats
            ]);

            // Save to temporary file for retry
            $this->saveFailedStatsForRetry($stats, $e->getMessage());
        }
    }

    /**
     * Background results caching using pre-processed addresses (no re-geocoding!)
     */
    private function backgroundResultsCaching(array $data): void
    {
        try {
            $results = $data['results'];
            $processedOrigins = $data['processed_origins'];
            $normalizedToAddress = $data['normalized_destination'];

            $stats = [
                'total_results' => count($results),
                'successful_caches' => 0,
                'cache_skipped_null' => 0,
                'cache_skipped_missing_origin' => 0,
                'cache_operations' => [],
                'source_breakdown' => [
                    'cache' => 0,
                    'mapbox' => 0,
                    'geocoding_failed' => 0,
                    'mapbox_failed' => 0
                ]
            ];

            // Background caching phase started

            // Build lookup map for processed origins by driver ID
            $originsMap = [];
            foreach ($processedOrigins as $processedOrigin) {
                $originsMap[$processedOrigin['driverId']] = $processedOrigin;
            }

            foreach ($results as $driverId => $distanceData) {
                // Track source statistics
                if (isset($distanceData['source'])) {
                    $source = $distanceData['source'];
                    if (isset($stats['source_breakdown'][$source])) {
                        $stats['source_breakdown'][$source]++;
                    }
                }

                // Skip null or failed results
                if (!$distanceData || $distanceData['distance'] === null) {
                    $stats['cache_skipped_null']++;
                    continue;
                }

                // Skip if no processed origin data available
                if (!isset($originsMap[$driverId])) {
                    $stats['cache_skipped_missing_origin']++;
                    continue;
                }

                // Cache the result using pre-processed address data (NO RE-GEOCODING!)
                $normalizedFromAddress = $originsMap[$driverId]['normalizedFromAddress'];
                $this->cacheService->cacheDistance($normalizedFromAddress, $normalizedToAddress, $distanceData);

                $stats['successful_caches']++;
            }

            // Background caching completed - no logging for normal operations
        } catch (Exception $e) {
            Logger::error("❌ Background caching phase failed", [
                'error' => $e->getMessage(),
                'destination' => $data['destination'] ?? 'unknown',
                'error_type' => get_class($e)
            ]);
        }
    }



    /**
     * Save failed stats for retry mechanism
     */
    private function saveFailedStatsForRetry(array $stats, string $error): void
    {
        try {
            $failedData = [
                'timestamp' => \App\Core\TimeService::nowUtc()->format('Y-m-d H:i:s'),
                'stats' => $stats,
                'error' => $error
            ];

            $logDir = __DIR__ . '/../../logs';
            if (!is_dir($logDir)) {
                mkdir($logDir, 0755, true);
            }

            file_put_contents(
                $logDir . '/failed_stats_' . date('Y-m-d') . '.json',
                json_encode($failedData) . "\n",
                FILE_APPEND | LOCK_EX
            );
        } catch (Exception $e) {
            // Last resort - just log the error
            error_log("Failed to save stats for retry: " . $e->getMessage());
        }
    }

    /**
     * Prepare addresses for cache check by normalizing them. No geocoding is performed here.
     */
    private function prepareAddressesForCacheCheck(array $originQueries, string $destinationQuery): array
    {
        $normalizedToAddress = $this->normalizeAddress($destinationQuery);
        $preparedAddresses = [];



        foreach ($originQueries as $originData) {
            $driverId = $originData['id'];
            $originAddress = $originData['address'];
            $normalizedFromAddress = $this->normalizeAddress($originAddress);

            $preparedAddress = [
                'driverId' => $driverId,
                'originalAddress' => $originAddress,
                'normalizedFromAddress' => $normalizedFromAddress,
                'normalizedToAddress' => $normalizedToAddress
            ];

            // Add coordinates if available
            if (isset($originData['coordinates'])) {
                $preparedAddress['coordinates'] = $originData['coordinates'];
                $preparedAddress['coordinate_source'] = $originData['coordinate_source'] ?? 'database';
            }

            $preparedAddresses[] = $preparedAddress;
        }
        return $preparedAddresses;
    }

    private function bulkCacheCheckOptimized(array $processedOrigins, string $normalizedToAddress): array
    {
        if (!$this->pdo) {
            return [];
        }

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

            if (empty($addressPairs)) {
                return [];
            }

            // Single SQL query for all cache checks (parameterized)
            $sql = "SELECT from_address, to_address, distance_meters 
                    FROM driver_distances 
                    WHERE (from_address, to_address) IN (" . implode(',', $addressPairs) . ")";

            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            $cacheResults = $stmt->fetchAll(PDO::FETCH_ASSOC);

            // Process results into cache map
            foreach ($cacheResults as $row) {
                $cacheKey = $row['from_address'] . '|' . $row['to_address'];
                $cacheMap[$cacheKey] = [
                    'distance' => (int) $row['distance_meters'],
                    'source' => 'cache'
                ];
            }

            // Update usage stats in background (non-blocking)
            if (!empty($cacheResults)) {
                $this->bulkUpdateCacheUsage($cacheResults);
            }

            // Bulk cache check completed - no logging for normal operations

            return $cacheMap;
        } catch (Exception $e) {
            Logger::error("Bulk cache check failed", ['error' => $e->getMessage()]);
            return [];
        }
    }

    /**
     * Fetch truck origins from database for distance calculation
     */
    private function fetchOriginsFromDatabase(): array
    {
        if (!$this->pdo) {
            return [];
        }

        try {
            $sql = "SELECT ID, CityStateZip, latitude, longitude FROM Trucks WHERE CityStateZip IS NOT NULL AND CityStateZip != ''";
            $stmt = $this->pdo->prepare($sql);
            $stmt->execute();
            $trucks = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $origins = [];
            $dbCoordsCount = 0;
            $needsGeocodingCount = 0;

            foreach ($trucks as $truck) {
                $origin = [
                    'id' => (int)$truck['ID'],
                    'address' => trim($truck['CityStateZip'])
                ];

                // Add coordinates if available
                if (
                    $truck['latitude'] !== null && $truck['longitude'] !== null &&
                    $truck['latitude'] != 0 && $truck['longitude'] != 0
                ) {
                    $origin['coordinates'] = [
                        'lat' => (float)$truck['latitude'],
                        'lon' => (float)$truck['longitude']
                    ];
                    $origin['coordinate_source'] = 'database';
                    $dbCoordsCount++;
                } else {
                    $origin['coordinate_source'] = 'needs_geocoding';
                    $needsGeocodingCount++;
                }

                $origins[] = $origin;
            }



            return $origins;
        } catch (Exception $e) {
            Logger::error("Failed to fetch truck origins from database", ['error' => $e->getMessage()]);
            return [];
        }
    }

    /**
     * Calculate distances for a specific load - creates LoadOffers automatically
     */
    public function calculateDistancesForLoad($loadId)
    {
        HybridAuth::protect(['dispatcher', 'manager', 'admin']);

        try {
            // Get load data
            $stmt = $this->pdo->prepare("
                SELECT origin_address, destination_address 
                FROM Loads 
                WHERE id = ?
            ");
            $stmt->execute([$loadId]);
            $load = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$load) {
                http_response_code(404);
                echo json_encode(['error' => 'Load not found']);
                return;
            }

            // Get all active drivers
            $stmt = $this->pdo->prepare("
                SELECT ID, DriverName, CityStateZip, latitude, longitude
                FROM Trucks 
                WHERE isActive = 1 AND CityStateZip IS NOT NULL
            ");
            $stmt->execute();
            $drivers = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $results = [];
            $mapboxRequests = 0;
            $cacheHits = 0;
            $dbCoordHits = 0;
            $geocodedCoords = 0;

            // Pre-geocode the destination address once to avoid repeated calls in the loop
            $toCoords = $this->geocoder->getBestCoordinatesForLocation($load['origin_address']);

            if (!$toCoords) {
                Logger::error('Failed to geocode pickup address for load', [
                    'load_id' => $loadId,
                    'pickup_address' => $load['origin_address']
                ]);
                // Decide how to handle this - maybe return an error response
                // For now, we will proceed but distance calculation will fail for uncached drivers
            }

            foreach ($drivers as $driver) {
                $driverLocation = $driver['CityStateZip'];
                $pickupAddress = $load['origin_address'];

                // Check cache first
                $normalizedFrom = $this->normalizeAddress($driverLocation);
                $normalizedTo = $this->normalizeAddress($pickupAddress);
                $cached = $this->cacheService->checkCache($normalizedFrom, $normalizedTo);

                $distanceMiles = null;
                $coordinateSource = 'unknown';

                if ($cached) {
                    $distanceMiles = $this->metersToMiles($cached['distance']);
                    $cacheHits++;
                    $coordinateSource = 'distance_cache';
                } else {
                    // Optimized coordinate handling - use database coordinates if available
                    $fromCoords = null;

                    if (
                        $driver['latitude'] !== null && $driver['longitude'] !== null &&
                        $driver['latitude'] != 0 && $driver['longitude'] != 0
                    ) {
                        $fromCoords = [
                            'lat' => (float)$driver['latitude'],
                            'lon' => (float)$driver['longitude']
                        ];
                        $coordinateSource = 'database';
                        $dbCoordHits++;
                    } else {
                        $fromCoords = $this->geocoder->getBestCoordinatesForLocation($driverLocation);
                        $coordinateSource = 'geocoding';
                        $geocodedCoords++;
                    }

                    if ($fromCoords && $toCoords) {
                        try {
                            $mapboxResult = $this->mapboxService->getDistance($fromCoords, $toCoords);
                            $this->cacheService->cacheDistance($normalizedFrom, $normalizedTo, $mapboxResult);
                            $distanceMiles = $this->metersToMiles($mapboxResult['distance']);
                            $mapboxRequests++;
                        } catch (Exception $e) {
                            Logger::warning("Mapbox distance calculation failed", [
                                'driver_id' => $driver['ID'],
                                'from' => $driverLocation,
                                'to' => $pickupAddress,
                                'coordinate_source' => $coordinateSource,
                                'error' => $e->getMessage()
                            ]);
                        }
                    } else {
                         Logger::warning('Missing coordinates for distance calculation', [
                            'driver_id' => $driver['ID'],
                            'from_coords_source' => $coordinateSource,
                            'from_coords' => $fromCoords ? 'available' : 'missing',
                            'to_coords' => $toCoords ? 'available' : 'missing'
                         ]);
                    }
                }

                // Create or update load offer
                $this->createOrUpdateLoadOffer($loadId, $driver['ID'], $distanceMiles);

                $results[] = [
                    'driver_id' => $driver['ID'],
                    'driver_name' => $driver['DriverName'],
                    'location' => $driverLocation,
                    'distance_to_pickup_miles' => $distanceMiles,
                    'cached' => ($coordinateSource === 'distance_cache'),
                    'coordinate_source' => $coordinateSource
                ];
            }



            // Calculate delivery distance (pickup → delivery)
            $normalizedOrigin = $this->normalizeAddress($load['origin_address']);
            $normalizedDest = $this->normalizeAddress($load['destination_address']);
            $deliveryDistance = $this->cacheService->checkCache($normalizedOrigin, $normalizedDest);

            if (!$deliveryDistance) {
                $originCoords = $this->geocoder->getBestCoordinatesForLocation($load['origin_address']);
                $destCoords = $this->geocoder->getBestCoordinatesForLocation($load['destination_address']);

                if ($originCoords && $destCoords) {
                    try {
                        $mapboxResult = $this->mapboxService->getDistance($originCoords, $destCoords);
                        $this->cacheService->cacheDistance($normalizedOrigin, $normalizedDest, $mapboxResult);
                        $deliveryDistance = $mapboxResult;
                        $mapboxRequests++;
                    } catch (Exception $e) {
                        Logger::warning("Mapbox delivery distance calculation failed", [
                        'origin' => $load['origin_address'],
                        'destination' => $load['destination_address'],
                        'error' => $e->getMessage()
                        ]);
                        $deliveryDistance = null;
                    }
                }
            } else {
                $cacheHits++;
            }

            // Update delivery distance in Loads table
            if ($deliveryDistance) {
                $stmt = $this->pdo->prepare("
                    UPDATE Loads 
                    SET delivery_distance_miles = ?, route_calculated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                ");
                $stmt->execute([
                    $this->metersToMiles($deliveryDistance['distance']),
                    $loadId
                ]);
            }

            http_response_code(200);
            echo json_encode([
                'load_id' => $loadId,
                'pickup_address' => $load['origin_address'],
                'delivery_address' => $load['destination_address'],
                'delivery_distance_miles' => $deliveryDistance ? $this->metersToMiles($deliveryDistance['distance']) : null,
                'drivers' => $results,
                'stats' => [
                    'total_drivers' => count($drivers),
                    'cache_hits' => $cacheHits,
                    'mapbox_requests' => $mapboxRequests
                ]
            ]);
        } catch (Exception $e) {
            Logger::error('Load distance calculation failed', [
                'load_id' => $loadId,
                'error' => $e->getMessage()
            ]);

            http_response_code(500);
            echo json_encode(['error' => 'Load distance calculation failed']);
        }
    }

    /**
     * Get cache statistics
     */
    public function getCacheStats()
    {
        HybridAuth::protect(['dispatcher', 'manager', 'admin']);

        try {
            $stmt = $this->pdo->prepare("
                SELECT 
                    COUNT(*) as total_cached_routes,
                    MIN(created_at) as oldest_entry,
                    MAX(last_used) as most_recent_use,
                    AVG(distance_meters) as avg_distance_meters
                FROM driver_distances
            ");
            $stmt->execute();
            $stats = $stmt->fetch(PDO::FETCH_ASSOC);

            $stats['avg_distance_miles'] = $this->metersToMiles($stats['avg_distance_meters']);

            http_response_code(200);
            echo json_encode([
                'cache_stats' => $stats,
                'timestamp' => \App\Core\TimeService::nowUtc()->format('Y-m-d H:i:s')
            ]);
        } catch (Exception $e) {
            Logger::error('Failed to get cache stats', ['error' => $e->getMessage()]);
            http_response_code(500);
            echo json_encode(['error' => 'Failed to get cache stats']);
        }
    }

    /**
     * Clean up old cache entries
     */
    public function cleanupCache()
    {
        HybridAuth::protect(['admin']);

        try {
            $stmt = $this->pdo->prepare("
                DELETE FROM driver_distances 
                WHERE last_used < DATE_SUB(NOW(), INTERVAL 1 YEAR)
            ");
            $stmt->execute();
            $deletedCount = $stmt->rowCount();

            http_response_code(200);
            echo json_encode([
                'message' => 'Cache cleanup completed',
                'deleted_entries' => $deletedCount
            ]);
        } catch (Exception $e) {
            Logger::error('Cache cleanup failed', ['error' => $e->getMessage()]);
            http_response_code(500);
            echo json_encode(['error' => 'Cache cleanup failed']);
        }
    }

    /**
     * Create or update load offer for driver
     */
    private function createOrUpdateLoadOffer($loadId, $driverId, $distanceMiles): void
    {
        try {
            $stmt = $this->pdo->prepare("
                INSERT INTO LoadOffers (load_id, driver_id, offer_status, driver_distance_miles, created_at)
                VALUES (?, ?, 'sent', ?, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE 
                driver_distance_miles = VALUES(driver_distance_miles),
                updated_at = :edt_time
            ");
            $stmt->execute([$loadId, $driverId, $distanceMiles, \App\Core\TimeService::nowUtc()->format('Y-m-d H:i:s')]);
        } catch (Exception $e) {
            Logger::error('Failed to create/update load offer', [
                'load_id' => $loadId,
                'driver_id' => $driverId,
                'error' => $e->getMessage()
            ]);
        }
    }



    /**
     * Prepare origins data from frontend request (filtered origins)
     */
    private function prepareOriginsFromFrontend(array $frontendOrigins): array
    {
        $origins = [];

        foreach ($frontendOrigins as $frontendOrigin) {
            $origin = [
                'id' => (int)$frontendOrigin['id'],
                'address' => trim($frontendOrigin['address'])
            ];

            // Add coordinates if provided by frontend
            if (
                isset($frontendOrigin['coordinates']) &&
                isset($frontendOrigin['coordinates']['lat']) &&
                isset($frontendOrigin['coordinates']['lon'])
            ) {
                $origin['coordinates'] = [
                    'lat' => (float)$frontendOrigin['coordinates']['lat'],
                    'lon' => (float)$frontendOrigin['coordinates']['lon']
                ];
                $origin['coordinate_source'] = $frontendOrigin['coordinate_source'] ?? 'frontend';
            } else {
                // Try to get coordinates from database for this specific driver
                try {
                    $stmt = $this->pdo->prepare("SELECT latitude, longitude FROM Trucks WHERE ID = ? AND latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0");
                    $stmt->execute([$frontendOrigin['id']]);
                    $coords = $stmt->fetch(PDO::FETCH_ASSOC);

                    if ($coords) {
                        $origin['coordinates'] = [
                            'lat' => (float)$coords['latitude'],
                            'lon' => (float)$coords['longitude']
                        ];
                        $origin['coordinate_source'] = 'database';
                    } else {
                        $origin['coordinate_source'] = 'needs_geocoding';
                    }
                } catch (Exception $e) {
                    Logger::error("Failed to fetch coordinates for driver {$frontendOrigin['id']}", ['error' => $e->getMessage()]);
                    $origin['coordinate_source'] = 'needs_geocoding';
                }
            }

            $origins[] = $origin;
        }

        return $origins;
    }

    /**
     * Log statistics from frontend (with correct breakdown of calculation types)
     */
    public function logStats()
    {
        HybridAuth::protect(['dispatcher', 'manager', 'admin']);

        $input = json_decode(file_get_contents('php://input'), true);

        if (!$input || !isset($input['destination'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Missing required fields']);
            return;
        }

        $destination = $input['destination'];
        $totalDrivers = $input['total_drivers'] ?? 0;
        $cacheHits = $input['cache_hits'] ?? 0;
        $preliminaryCalculations = $input['preliminary_calculations'] ?? 0;
        $mapboxRequests = $input['mapbox_requests'] ?? 0;

        try {
            $user = \App\Core\HybridAuth::getCurrentUser();
            if (!$user) {
                http_response_code(401);
                echo json_encode(['error' => 'User not authenticated']);
                return;
            }

            // Get both MySQL ID and Supabase UUID
            $userId = \App\Core\UserService::getMysqlId($user);
            $supabaseUserId = \App\Core\UserService::getSupabaseId($user);

            // Log to distance_log table with correct mapbox_requests count
            $sql = "INSERT INTO distance_log (user_id, supabase_user_id, source_address, total_origins, cache_hits, mapbox_requests, created_at)
                    VALUES (:user_id, :supabase_user_id, :source_address, :total_origins, :cache_hits, :mapbox_requests, :created_at)";

            $stmt = $this->pdo->prepare($sql);
            $stmt->execute([
                ':user_id' => $userId,
                ':supabase_user_id' => $supabaseUserId,
                ':source_address' => $destination,
                ':total_origins' => $totalDrivers,
                ':cache_hits' => $cacheHits,
                ':mapbox_requests' => $mapboxRequests,
                ':created_at' => \App\Core\TimeService::nowUtc()->format('Y-m-d H:i:s')
            ]);

            // Log to activity_logs table with detailed breakdown
            $cacheEfficiency = $totalDrivers > 0 ? round(($cacheHits / $totalDrivers) * 100, 1) : 0;

            ActivityLogger::log('distance_batch_calculated', [
                'destination' => $destination,
                'total_drivers' => $totalDrivers,
                'cache_hits' => $cacheHits,
                'preliminary_calculations' => $preliminaryCalculations,
                'mapbox_requests' => $mapboxRequests,
                'cache_efficiency_percent' => $cacheEfficiency,
                'query_type' => 'optimized_with_turf'
            ]);

            http_response_code(200);
            echo json_encode(['success' => true, 'message' => 'Statistics logged successfully']);
        } catch (Exception $e) {
            Logger::error('Failed to log distance statistics', [
                'error' => $e->getMessage(),
                'destination' => $destination,
                'stats' => $input
            ]);
            http_response_code(500);
            echo json_encode(['error' => 'Failed to log statistics']);
        }
    }

    /**
     * Convert meters to miles
     */
    private function metersToMiles($meters): float
    {
        return round($meters * 0.000621371, 2);
    }
}
