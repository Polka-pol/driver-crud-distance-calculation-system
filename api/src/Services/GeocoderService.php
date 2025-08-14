<?php

namespace App\Services;

use App\Core\Database;
use App\Core\Logger;
use PDO;
use Exception;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;

/**
 * A service class to handle geocoding from various sources.
 * This abstracts the logic away from controllers, allowing for reuse.
 */
class GeocoderService
{
    private $pdo;
    private $mapboxAccessToken;

    public function __construct()
    {
        $this->pdo = Database::getConnection();
        $this->mapboxAccessToken = $_ENV['MAPBOX_ACCESS_TOKEN'] ?? '';
    }

    /**
     * The main public method to get a list of location suggestions.
     * It cascades through caching layers and falls back to Mapbox.
     *
     * @param string $query The location query (e.g., "Henderson, KY").
     * @return array A list of suggestion arrays.
     */
    public function getLocationSuggestions(string $query): array
    {
        if (empty($query) || strlen($query) < 3) {
            return [];
        }

        // --- Step 1: Search in address_cache ---
        $addressCacheResults = $this->searchAddressCache($query);

        if (!empty($addressCacheResults)) {
            // Geocoding cache hit - no logging for normal operations
            return $addressCacheResults;
        }

        // --- Step 2: Search in geocoding_cache ---
        $geocodingCacheResults = $this->searchGeocodingCache($query);

        if (!empty($geocodingCacheResults)) {
            // Geocoding cache hit - no logging for normal operations
            return $geocodingCacheResults;
        }

        // --- Step 3: Search via Mapbox API ---
        $mapboxResults = $this->searchMapbox($query);

        if (!empty($mapboxResults)) {
            // Mapbox API call completed - no logging for normal operations
            return $mapboxResults;
        }

        // No suggestions found - no logging for normal operations
        return [];
    }

    /**
     * The main public method to get the single best coordinate for a location query.
     *
     * @param string $query The location query (e.g., "Henderson, KY 42420").
     * @return array|null An associative array with address details including ['lat', 'lon'], or null if not found.
     */
    public function getBestCoordinatesForLocation(string $query): ?array
    {
        $suggestions = $this->getLocationSuggestions($query);

        if (empty($suggestions)) {
            // Geocoding failed - no logging for normal operations
            return null;
        }

        // Geocoding successful - no logging for normal operations

        // The first result is always the best due to our sorting and filtering logic
        return $suggestions[0];
    }

    /**
     * Reverse geocoding: convert coordinates to address.
     * Checks address_cache first, then falls back to Mapbox reverse geocoding.
     *
     * @param float $lat Latitude
     * @param float $lon Longitude
     * @return array|null Address data or null if not found
     */
    public function reverseGeocode(float $lat, float $lon): ?array
    {
        // Step 1: Check address_cache for nearby locations (within ~1km radius)
        $cacheResult = $this->searchAddressCacheByCoordinates($lat, $lon);
        if ($cacheResult) {
            return $cacheResult;
        }

        // Step 2: Use Mapbox reverse geocoding API
        $mapboxResult = $this->reverseGeocodeMapbox($lat, $lon);
        if ($mapboxResult) {
            // Cache the result for future use
            $this->cacheReverseGeocodeResult($mapboxResult, $lat, $lon);
            return $mapboxResult;
        }

        // Reverse geocoding failed - no logging needed for normal operation

        return null;
    }

    /**
     * Search address_cache for locations near the given coordinates.
     */
    private function searchAddressCacheByCoordinates(float $lat, float $lon): ?array
    {
        if (!$this->pdo) {
            return null;
        }

        // Round coordinates to match database precision (8 decimal places for lat, 8 for lon)
        $roundedLat = round($lat, 8);
        $roundedLon = round($lon, 8);

        // First try exact match with rounded coordinates
        $sql = "SELECT formatted_address, city, state, zip_code, lat, lon
                FROM address_cache 
                WHERE ABS(lat - ?) < 0.00000001 AND ABS(lon - ?) < 0.00000001
                LIMIT 1";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$roundedLat, $roundedLon]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);

        // If no exact match, search within approximately 1km radius (0.009 degrees ≈ 1km)
        if (!$result) {
            $sql = "SELECT formatted_address, city, state, zip_code, lat, lon
                    FROM address_cache 
                    WHERE ABS(lat - ?) < 0.009 AND ABS(lon - ?) < 0.009
                    ORDER BY (POW(lat - ?, 2) + POW(lon - ?, 2)) ASC
                    LIMIT 1";

            $stmt = $this->pdo->prepare($sql);
            $stmt->execute([$roundedLat, $roundedLon, $roundedLat, $roundedLon]);
            $result = $stmt->fetch(PDO::FETCH_ASSOC);
        }

        if ($result) {
            $countryInfo = $this->getCountryByState($result['state']);
            return [
                'formattedAddress' => $result['formatted_address'],
                'city' => $result['city'],
                'state' => $result['state'],
                'zip_code' => $result['zip_code'],
                'lat' => (float)$result['lat'],
                'lon' => (float)$result['lon'],
                'source' => 'cache',
                'sourceLabel' => $this->formatSourceLabel('cache'),
                'country' => $countryInfo['country'],
                'countryCode' => $countryInfo['countryCode'],
                'flag' => $countryInfo['flag']
            ];
        }

        return null;
    }

    /**
     * Use Mapbox reverse geocoding API to get address from coordinates.
     */
    private function reverseGeocodeMapbox(float $lat, float $lon): ?array
    {
        if (empty($this->mapboxAccessToken)) {
            Logger::error("CRITICAL: MAPBOX_ACCESS_TOKEN is not set for reverse geocoding.");
            return null;
        }

        $client = new Client(['base_uri' => 'https://api.mapbox.com', 'timeout' => 5.0]);

        try {
            $endpoint = "/geocoding/v5/mapbox.places/{$lon},{$lat}.json";

            $response = $client->request('GET', $endpoint, [
                'query' => [
                    'access_token' => $this->mapboxAccessToken,
                    'country' => 'us,ca',
                    'types' => 'postcode,place,address'
                ]
            ]);

            $body = $response->getBody()->getContents();
            $data = json_decode($body, true);

            if (json_last_error() === JSON_ERROR_NONE && !empty($data['features'])) {
                $feature = $data['features'][0]; // Take the most relevant result

                $context = $feature['context'] ?? [];
                $city = null;
                $state = null;
                $zip = null;

                // Parse context for city, state, and ZIP
                foreach ($context as $ctx) {
                    $id = $ctx['id'] ?? '';
                    if (strpos($id, 'place') === 0) {
                        $city = $ctx['text'] ?? null;
                    }
                    if (strpos($id, 'region') === 0) {
                        $state = $ctx['short_code'] ?? null;
                        if ($state && strpos($state, '-') !== false) {
                            $parts = explode('-', $state);
                            $state = end($parts);
                        }
                    }
                    if (strpos($id, 'postcode') === 0) {
                        $zip = $ctx['text'] ?? null;
                    }
                }

                // Check if the feature itself is a postcode or place
                if (in_array('postcode', $feature['place_type'] ?? [])) {
                    $zip = $feature['text'] ?? null;
                }
                if (in_array('place', $feature['place_type'] ?? [])) {
                    $city = $feature['text'] ?? null;
                }

                if ($city && $state) {
                    $formattedAddress = $city . ', ' . $state . ($zip ? ' ' . $zip : '');
                    $countryInfo = $this->getCountryByState($state);

                    // Mapbox reverse geocoding successful

                    return [
                        'formattedAddress' => $formattedAddress,
                        'city' => $city,
                        'state' => $state,
                        'zip_code' => $zip,
                        'lat' => $lat,
                        'lon' => $lon,
                        'source' => 'mapbox',
                        'sourceLabel' => $this->formatSourceLabel('mapbox'),
                        'country' => $countryInfo['country'],
                        'countryCode' => $countryInfo['countryCode'],
                        'flag' => $countryInfo['flag']
                    ];
                }
            }

            // Mapbox reverse geocoding returned no usable results
        } catch (RequestException $e) {
            Logger::error("Mapbox reverse geocoding API request failed", [
                'lat' => $lat,
                'lon' => $lon,
                'error' => $e->getMessage()
            ]);
        }

        return null;
    }

    /**
     * Cache the reverse geocoding result in address_cache.
     */
    private function cacheReverseGeocodeResult(array $result, float $lat, float $lon): void
    {
        if (!$this->pdo || empty($result['formattedAddress'])) {
            return;
        }

        // Round coordinates to match database precision (8 decimal places)
        $roundedLat = round($lat, 8);
        $roundedLon = round($lon, 8);

        $sql = "INSERT INTO address_cache (search_query, formatted_address, city, state, zip_code, lat, lon, last_used)
                VALUES (:search_query, :formatted_address, :city, :state, :zip_code, :lat, :lon, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                    last_used = CURRENT_TIMESTAMP";

        $stmt = $this->pdo->prepare($sql);

        try {
            $stmt->execute([
                ':search_query' => "GPS:{$roundedLat},{$roundedLon}",
                ':formatted_address' => $result['formattedAddress'],
                ':city' => $result['city'],
                ':state' => $result['state'],
                ':zip_code' => $result['zip_code'],
                ':lat' => $roundedLat,
                ':lon' => $roundedLon,
            ]);

            // Cached reverse geocoding result
        } catch (Exception $e) {
            Logger::error("Failed to cache reverse geocoding result", [
                'lat' => $roundedLat,
                'lon' => $roundedLon,
                'error' => $e->getMessage()
            ]);
        }
    }

    /**
     * Searches the address_cache table.
     */
    private function searchAddressCache(string $query): array
    {
        if (!$this->pdo) {
            return [];
        }

        $results = [];
        $zipCode = $this->extractZipCodeFromQuery($query);

        $params = [];
        $sql = '';

        if ($zipCode) {
            $sql = "SELECT formatted_address, city, state, zip_code, lat, lon
                    FROM address_cache 
                    WHERE zip_code = ? AND formatted_address LIKE ?
                    ORDER BY last_used DESC
                    LIMIT 10";

            $likeQuery = preg_replace('/[,\\s]+/', ' ', str_replace($zipCode, '', $query));
            $likeQuery = trim($likeQuery);
            $params = [$zipCode, "%{$likeQuery}%"];

            $stmt = $this->pdo->prepare($sql);
            $stmt->execute($params);
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } else {
            // Extract potential city and state from query
            $extractedLocation = $this->extractCityStateFromQuery($query);

            if ($extractedLocation['city'] && $extractedLocation['state']) {
                // If no ZIP in query, only search for results without ZIP codes
                // If no results found, proceed to next stage (geocoding_cache -> mapbox)
                $sql = "SELECT formatted_address, city, state, zip_code, lat, lon
                    FROM address_cache 
                        WHERE city = ? AND state = ? AND (zip_code IS NULL OR zip_code = '')
                        ORDER BY last_used DESC
                    LIMIT 10";

                $params = [$extractedLocation['city'], $extractedLocation['state']];

                $stmt = $this->pdo->prepare($sql);
                $stmt->execute($params);
                $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } else {
                // If no clear city/state format, return empty to proceed to geocoding_cache
                return [];
            }
        }



        return array_map(function ($row) {
            $countryInfo = $this->getCountryByState($row['state']);
            $sourceLabel = $this->formatSourceLabel('cache');

            return [
                'formattedAddress' => $row['formatted_address'],
                'city' => $row['city'],
                'state' => $row['state'],
                'zip_code' => $row['zip_code'],
                'lat' => $row['lat'],
                'lon' => $row['lon'],
                'source' => 'cache',
                'sourceLabel' => $sourceLabel,
                'country' => $countryInfo['country'],
                'countryCode' => $countryInfo['countryCode'],
                'flag' => $countryInfo['flag']
            ];
        }, $results);
    }

    /**
     * Determine country based on state/province code
     */
    private function getCountryByState(string $state): array
    {
        $canadianProvinces = [
            'AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'
        ];

        $isCanadian = in_array(strtoupper($state), $canadianProvinces);

        return [
            'country' => $isCanadian ? 'Canada' : 'United States',
            'countryCode' => $isCanadian ? 'CA' : 'US',
            'flag' => $isCanadian ? '🇨🇦' : '🇺🇸'
        ];
    }

    /**
     * Format source label with emoji
     */
    private function formatSourceLabel(string $source): string
    {
        $sourceLabels = [
            'cache' => '⚡ Cache',
            'geocoding_cache' => '🗄️ Cached',
            'mapbox' => '🌐 Live'
        ];

        return $sourceLabels[$source] ?? "📍 {$source}";
    }

    /**
     * Extract city and state/province from query string
     * Supports both US states and Canadian provinces, including French characters
     */
    private function extractCityStateFromQuery(string $query): array
    {
        $result = ['city' => null, 'state' => null];

        // First try: "City, State/Province" format (with comma)
        // Updated regex to support French characters, hyphens, apostrophes
        if (preg_match('/^(.+?),\s*([A-Z]{2})(?:\s|$)/i', trim($query), $matches)) {
            $result['city'] = trim($matches[1]);
            $result['state'] = strtoupper(trim($matches[2]));
        }
        // Second try: "City State/Province" format (without comma, state at the end)
        elseif (preg_match('/^(.+)\s+([A-Z]{2})(?:\s|$)/i', trim($query), $matches)) {
            $result['city'] = trim($matches[1]);
            $result['state'] = strtoupper(trim($matches[2]));
        }

        return $result;
    }




    /**
     * Searches the geocoding_cache table.
     */
    private function searchGeocodingCache(string $query): array
    {
        if (!$this->pdo) {
            return [];
        }

        $sql = "SELECT feature_data FROM geocoding_cache WHERE query = ? LIMIT 1";
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([$query]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$row || empty($row['feature_data'])) {
            return [];
        }

        $features = json_decode($row['feature_data'], true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            Logger::error("JSON decode error for query '{$query}'", ['error' => json_last_error_msg()]);
            return [];
        }

        return $this->parseAndNormalizeFeatures($features, 'geocoding_cache', $query);
    }

    /**
     * Searches Mapbox API.
     */
    private function searchMapbox(string $query): array
    {
        if (empty($this->mapboxAccessToken)) {
            Logger::error("CRITICAL: MAPBOX_ACCESS_TOKEN is not set.");
            return [];
        }

        $client = new Client(['base_uri' => 'https://api.mapbox.com', 'timeout'  => 5.0]);

        try {
            $encodedQuery = urlencode($query);
            $endpoint = "/geocoding/v5/mapbox.places/{$encodedQuery}.json";

            $types = 'postcode,place,address,region';
            // Prioritize postcode search for US ZIP codes or Canadian postal codes
            if (preg_match('/\\b\\d{5}\\b/', $query) || preg_match('/\\b[A-Z]\\d[A-Z]\\s?\\d[A-Z]\\d\\b/i', $query)) {
                $types = 'postcode,place';
            }
            $response = $client->request('GET', $endpoint, [
                'query' => [
                    'access_token' => $this->mapboxAccessToken,
                    'country' => 'us,ca',
                    'types' => $types
                ]
            ]);
            $body = $response->getBody()->getContents();
            $data = json_decode($body, true);

            if (json_last_error() === JSON_ERROR_NONE && !empty($data['features'])) {
                $this->cacheGeocodingResponse($query, $data['features']);
                $results = $this->parseAndNormalizeFeatures($data['features'], 'mapbox', $query);

                // Mapbox API call successful - no logging for normal operations
                return $results;
            }

            // Mapbox API returned no features - no logging for normal operations
            return [];
        } catch (RequestException $e) {
            // Check if this is a 401 Unauthorized error from Mapbox (invalid token)
            if ($e->getResponse() && $e->getResponse()->getStatusCode() === 401) {
                $responseBody = $e->getResponse()->getBody()->getContents();
                if (strpos($responseBody, 'Invalid Token') !== false || strpos($responseBody, 'Not Authorized') !== false) {
                    Logger::error("Mapbox Geocoding API - Invalid Token", [
                        'query' => $query,
                        'error' => $e->getMessage()
                    ]);
                    // For geocoding, we don't throw an exception since it's not critical for the app to continue
                    // but we log the issue clearly
                    return [];
                }
            }

            Logger::error("Mapbox API request failed", [
                'query' => $query,
                'error' => $e->getMessage(),
                'status_code' => $e->getResponse() ? $e->getResponse()->getStatusCode() : 'no_response'
            ]);
            return [];
        }
    }

    /**
     * Parses features from geocoding, normalizes them, and warms up the address_cache.
     */
    private function parseAndNormalizeFeatures(array $features, string $source, string $query): array
    {
        if (empty($features)) {
            return [];
        }

        $normalizedSuggestions = [];
        $referenceContext = null;

        foreach ($features as $feature) {
            if (isset($feature['relevance']) && $feature['relevance'] < 0.5) {
                continue;
            }

            $context = $feature['context'] ?? [];
            $city = null;
            $state = null;
            $stateFullName = null;
            $zip = null;
            $lon = $feature['center'][0] ?? null;
            $lat = $feature['center'][1] ?? null;

            foreach ($context as $ctx) {
                $id = $ctx['id'] ?? '';
                if (strpos($id, 'place') === 0) {
                    $city = $ctx['text'] ?? null;
                }
                if (strpos($id, 'region') === 0) {
                    $stateFullName = $ctx['text'] ?? null;
                    $state = $ctx['short_code'] ?? $stateFullName;
                    if ($state && strpos($state, '-') !== false) {
                        $parts = explode('-', $state);
                        $state = end($parts);
                    }
                }
                if (strpos($id, 'postcode') === 0) {
                    $zip = $ctx['text'] ?? null;
                }
            }

            if (in_array('postcode', $feature['place_type'] ?? [])) {
                $zip = $feature['text'] ?? null;
            }
            if (in_array('place', $feature['place_type'] ?? [])) {
                $city = $feature['text'] ?? null;
            }

            if ($city && $state && $lat && $lon) {
                if ($referenceContext === null) {
                    $referenceContext = ['city' => $city, 'state' => $stateFullName];
                }

                if ($city !== $referenceContext['city'] || $stateFullName !== $referenceContext['state']) {
                    continue;
                }

                // Determine if query had ZIP to format address consistently
                $queryHasZip = $this->queryHasZipCode($query);

                // Format address according to query type:
                // If query has ZIP, include ZIP in formatted address
                // If query has no ZIP, exclude ZIP from formatted address
                $formattedAddress = $city . ', ' . $state;
                if ($queryHasZip && $zip) {
                    $formattedAddress .= ' ' . $zip;
                }

                $countryInfo = $this->getCountryByState($state);
                $sourceLabel = $this->formatSourceLabel($source);

                // Apply ZIP filtering: only include suggestions that match query type
                $suggestionHasZip = !empty($zip);
                if ($queryHasZip === $suggestionHasZip) {
                    $suggestion = [
                        'formattedAddress' => $formattedAddress,
                        'city' => $city, 'state' => $state, 'zip_code' => $zip,
                        'lat' => $lat, 'lon' => $lon, 'source' => $source,
                        'sourceLabel' => $sourceLabel,
                        'country' => $countryInfo['country'],
                        'countryCode' => $countryInfo['countryCode'],
                        'flag' => $countryInfo['flag']
                    ];

                    if (!in_array($suggestion, $normalizedSuggestions)) {
                        $normalizedSuggestions[] = $suggestion;
                    }
                }
            }
        }

        // No need to sort by ZIP since all suggestions now match the query type

        if (!empty($normalizedSuggestions)) {
            // Determine if original query had ZIP code
            $queryHasZip = $this->queryHasZipCode($query);
            $this->warmUpAddressCache($normalizedSuggestions, $query, $queryHasZip);
        }

        return $normalizedSuggestions;
    }

    /**
     * Check if query contains a ZIP/postal code
     */
    private function queryHasZipCode(string $query): bool
    {
        return preg_match('/\b\d{5}\b/', $query) || preg_match('/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i', $query);
    }

    /**
     * Extract ZIP/postal code from query
     */
    private function extractZipCodeFromQuery(string $query): ?string
    {
        // Check for US ZIP codes (5 digits)
        if (preg_match('/\b(\d{5})\b/', $query, $matches)) {
            return $matches[1];
        }
        // Check for Canadian postal codes (A1A 1A1 format)
        if (preg_match('/\b([A-Z]\d[A-Z]\s?\d[A-Z]\d)\b/i', $query, $matches)) {
            return strtoupper(str_replace(' ', '', $matches[1])); // Normalize format
        }
        return null;
    }

    /**
     * Caches the raw JSON response from Mapbox.
     */
    private function cacheGeocodingResponse(string $query, array $features): void
    {
        if (empty($features) || !$this->pdo) {
            return;
        }

        $sql = "INSERT INTO geocoding_cache (query, feature_data)
                VALUES (:query, :feature_data)
                ON DUPLICATE KEY UPDATE
                    feature_data = VALUES(feature_data),
                    last_used = CURRENT_TIMESTAMP";

        $stmt = $this->pdo->prepare($sql);
        try {
            $stmt->execute([':query' => $query, ':feature_data' => json_encode($features)]);
        } catch (Exception $e) {
            Logger::error("Failed to cache geocoding response for '{$query}'", ['error' => $e->getMessage()]);
        }
    }

    /**
     * Inserts or updates the address_cache with normalized data.
     * FIXED: Only caches addresses that match the query type (with/without ZIP)
     */
    private function warmUpAddressCache(array $suggestions, string $query, bool $queryHasZip): void
    {
        if (empty($suggestions) || !$this->pdo) {
            return;
        }

        // Filter suggestions based on query type
        $filteredSuggestions = array_filter($suggestions, function ($suggestion) use ($queryHasZip) {
            $suggestionHasZip = !empty($suggestion['zip_code']);
            return $queryHasZip === $suggestionHasZip; // Only keep matching types
        });

        $suggestionsToCache = array_slice($filteredSuggestions, 0, 5);
        if (empty($suggestionsToCache)) {
            return;
        }

        $sql = "INSERT INTO address_cache (search_query, formatted_address, city, state, zip_code, lat, lon, last_used)
                VALUES (:search_query, :formatted_address, :city, :state, :zip_code, :lat, :lon, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                    last_used = CURRENT_TIMESTAMP";

        $stmt = $this->pdo->prepare($sql);

        foreach ($suggestionsToCache as $s) {
            try {
                // Create address format that matches query type
                $formattedAddress = $s['city'] . ', ' . $s['state'];
                if ($queryHasZip && !empty($s['zip_code'])) {
                    $formattedAddress .= ' ' . $s['zip_code'];
                }

                $stmt->execute([
                    ':search_query' => $query,
                    ':formatted_address' => $formattedAddress,
                    ':city' => $s['city'],
                    ':state' => $s['state'],
                    ':zip_code' => $queryHasZip ? $s['zip_code'] : null,
                    ':lat' => $s['lat'],
                    ':lon' => $s['lon'],
                ]);
            } catch (Exception $e) {
                Logger::error("Failed to warm up address_cache for '{$formattedAddress}'", ['error' => $e->getMessage()]);
            }
        }
    }
}
