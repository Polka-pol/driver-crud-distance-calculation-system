<?php

namespace App\Services;

use App\Core\Logger;
use App\Core\MapboxRateLimitException;
use App\Core\MapboxTokenException;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\RequestException;
use Exception;

/**
 * Service for handling Mapbox API operations
 */
class MapboxService
{
    private Client $httpClient;
    private string $mapboxAccessToken;

    public function __construct()
    {
        $this->httpClient = new Client([
            'base_uri' => 'https://api.mapbox.com',
            'timeout' => 30
        ]);

        $envToken = $_ENV['MAPBOX_ACCESS_TOKEN'] ?? getenv('MAPBOX_ACCESS_TOKEN');
        $this->mapboxAccessToken = is_string($envToken) ? $envToken : '';
    }

    /**
     * Get distance from Mapbox for single origin-destination pair
     *
     * @param array{lat: float|int|string, lon: float|int|string} $origin
     * @param array{lat: float|int|string, lon: float|int|string} $destination
     * @return array{distance: int, source: string}
     */
    public function getDistance(array $origin, array $destination): array
    {
        if (empty($this->mapboxAccessToken)) {
            throw new Exception("Mapbox access token is not configured.");
        }

        $originLon = $this->toFloat($origin['lon'], 'origin.lon');
        $originLat = $this->toFloat($origin['lat'], 'origin.lat');
        $destLon = $this->toFloat($destination['lon'], 'destination.lon');
        $destLat = $this->toFloat($destination['lat'], 'destination.lat');

        $originCoords = sprintf('%.6f,%.6f', $originLon, $originLat);
        $destCoords = sprintf('%.6f,%.6f', $destLon, $destLat);
        $endpoint = "/directions/v5/mapbox/driving/{$originCoords};{$destCoords}";

        $maxRetries = 10;
        $retryDelaySeconds = 5;

        for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
            try {
                $response = $this->httpClient->request('GET', $endpoint, [
                    'query' => ['access_token' => $this->mapboxAccessToken, 'geometries' => 'geojson']
                ]);

                $data = json_decode($response->getBody()->getContents(), true);

                if (!is_array($data) || !isset($data['routes']) || !is_array($data['routes'])) {
                    throw new Exception('No route found by Mapbox.');
                }
                $routes = $data['routes'];
                if (!isset($routes[0]) || !is_array($routes[0])) {
                    throw new Exception('No route found by Mapbox.');
                }

                $route = $routes[0];
                return [
                    'distance' => (int) (isset($route['distance']) && is_numeric($route['distance']) ? $route['distance'] : 0),
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
                            continue;
                        } else {
                            throw new MapboxRateLimitException("Mapbox servers are busy. Processing may take longer than usual due to rate limiting.");
                        }
                    }
                }

                Logger::error("Mapbox Directions API error after {$attempt} attempts", ['origin' => $origin, 'destination' => $destination, 'error' => $e->getMessage()]);
                throw new Exception("Failed to get directions from Mapbox API after {$attempt} attempts.");
            }
        }

        throw new Exception("Failed to get directions from Mapbox API after all retries.");
    }

    /**
     * Get distances for multiple origins using Mapbox Matrix API
     *
     * @param array{lat: float|int|string, lon: float|int|string} $destination
     * @param list<array{
     *   driverId?: int|string,
     *   id?: int|string,
     *   origin?: array,
     *   coordinates?: array
     * }> $originsChunk
     * @return array<string|int, array{distance:int, source:string}>
     */
    public function getDistancesMatrix(array $destination, array $originsChunk): array
    {
        if (empty($this->mapboxAccessToken)) {
            throw new Exception("Mapbox access token is not configured.");
        }

        $coordinates = [];
        $destLon = $this->toFloat($destination['lon'], 'destination.lon');
        $destLat = $this->toFloat($destination['lat'], 'destination.lat');
        $coordinates[] = sprintf('%.6f,%.6f', $destLon, $destLat); // Destination first

        foreach ($originsChunk as $origin) {

            // Handle structure from DistanceController: ['driverId' => ..., 'origin' => ['lat' => ..., 'lon' => ...]]
            if (isset($origin['origin']) && is_array($origin['origin'])) {
                $o = $origin['origin'];
                if (array_key_exists('lat', $o) && array_key_exists('lon', $o)) {
                    $oLon = $this->toFloat($o['lon'], 'origin.lon');
                    $oLat = $this->toFloat($o['lat'], 'origin.lat');
                    $coordinates[] = sprintf('%.6f,%.6f', $oLon, $oLat);
                    continue;
                }
            }
            if (isset($origin['coordinates']) && is_array($origin['coordinates'])) {
                // Fallback for old structure: ['coordinates' => ['lat' => ..., 'lon' => ...]]
                $c = $origin['coordinates'];
                if (array_key_exists('lat', $c) && array_key_exists('lon', $c)) {
                    $oLon = $this->toFloat($c['lon'], 'coordinates.lon');
                    $oLat = $this->toFloat($c['lat'], 'coordinates.lat');
                    $coordinates[] = sprintf('%.6f,%.6f', $oLon, $oLat);
                    continue;
                }
            }
            throw new Exception("Invalid origin structure: missing coordinates");
        }

        $coordsString = implode(';', $coordinates);
        $sources = implode(';', range(1, count($originsChunk))); // Skip destination (index 0)
        $destinations = '0'; // Only destination

        $endpoint = "/directions-matrix/v1/mapbox/driving/{$coordsString}";



        $maxRetries = 10;
        $retryDelaySeconds = 5;

        for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
            try {
                $response = $this->httpClient->request('GET', $endpoint, [
                    'query' => [
                        'access_token' => $this->mapboxAccessToken,
                        'sources' => $sources,
                        'destinations' => $destinations,
                        'annotations' => 'distance'
                    ]
                ]);

                $responseBody = $response->getBody()->getContents();
                $data = json_decode($responseBody, true);

                // Validate basic response structure
                if (!is_array($data) || !isset($data['distances']) || !is_array($data['distances'])) {
                    throw new Exception('Invalid response from Mapbox Matrix API: missing distances array.');
                }

                // Validate distances array has expected number of rows
                if (count($data['distances']) < count($originsChunk)) {
                    throw new Exception('Invalid response from Mapbox Matrix API: insufficient distance data.');
                }

                $results = [];
                foreach ($originsChunk as $index => $origin) {
                    // Validate this specific distance exists
                    if (!isset($data['distances'][$index]) || !is_array($data['distances'][$index]) || !array_key_exists(0, $data['distances'][$index])) {
                        continue;
                    }

                    $distance = $data['distances'][$index][0];

                    if ($distance !== null) {
                        // Extract driverId from the correct structure
                        $driverId = $origin['driverId'] ?? $origin['id'] ?? $index;
                        $results[$driverId] = [
                            'distance' => (int) (is_numeric($distance) ? $distance : 0),
                            'source' => 'mapbox'
                        ];
                    }
                }

                return $results;
            } catch (RequestException $e) {
                if ($e->getResponse()) {
                    $statusCode = $e->getResponse()->getStatusCode();
                    $responseBody = $e->getResponse()->getBody()->getContents();

                    if ($statusCode === 401) {
                        throw new MapboxTokenException("Mapbox API token is invalid or expired.");
                    }

                    if ($statusCode === 429) {
                        Logger::warning("Mapbox Matrix API rate limit hit. Attempt {$attempt}/{$maxRetries}. Retrying in {$retryDelaySeconds}s...");
                        if ($attempt < $maxRetries) {
                            sleep($retryDelaySeconds);
                            continue;
                        } else {
                            throw new MapboxRateLimitException("Mapbox servers are busy.");
                        }
                    }
                }

                Logger::error("Mapbox Matrix API error after {$attempt} attempts", ['error' => $e->getMessage()]);
                throw new Exception("Failed to get distances from Mapbox Matrix API after {$attempt} attempts.");
            }
        }

        throw new Exception("Failed to get distances from Mapbox Matrix API after all retries.");
    }

    /**
     * Normalize a numeric-ish value to float, throwing a descriptive error when invalid.
     *
     * @param float|int|string|null $value
     */
    private function toFloat($value, string $field): float
    {
        if ($value === null || $value === '') {
            throw new Exception("Missing required coordinate field: {$field}");
        }
        if (is_string($value)) {
            $value = trim($value);
        }
        if (!is_numeric($value)) {
            throw new Exception("Invalid coordinate value for {$field}: must be numeric");
        }
        return (float) $value;
    }
}
