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
        
        $this->mapboxAccessToken = $_ENV['MAPBOX_ACCESS_TOKEN'] ?? '';
    }

    /**
     * Get distance from Mapbox for single origin-destination pair
     */
    public function getDistance(array $origin, array $destination): array
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
     */
    public function getDistancesMatrix(array $destination, array $originsChunk): array
    {
        if (empty($this->mapboxAccessToken)) {
            throw new Exception("Mapbox access token is not configured.");
        }

        $coordinates = [];
        $coordinates[] = "{$destination['lon']},{$destination['lat']}"; // Destination first

        foreach ($originsChunk as $origin) {
            // Validate that origin is an array
            if (!is_array($origin)) {
                throw new Exception("Invalid origin type: expected array, got " . gettype($origin));
            }

            // Handle structure from DistanceController: ['driverId' => ..., 'origin' => ['lat' => ..., 'lon' => ...]]
            if (isset($origin['origin']) && isset($origin['origin']['lat']) && isset($origin['origin']['lon'])) {
                $coordinates[] = "{$origin['origin']['lon']},{$origin['origin']['lat']}";
            } elseif (isset($origin['coordinates']) && isset($origin['coordinates']['lat']) && isset($origin['coordinates']['lon'])) {
                // Fallback for old structure: ['coordinates' => ['lat' => ..., 'lon' => ...]]
                $coordinates[] = "{$origin['coordinates']['lon']},{$origin['coordinates']['lat']}";
            } else {
                throw new Exception("Invalid origin structure: missing coordinates");
            }
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
                if (!isset($data['distances']) || !is_array($data['distances'])) {
                    throw new Exception('Invalid response from Mapbox Matrix API: missing distances array.');
                }

                // Validate distances array has expected number of rows
                if (count($data['distances']) < count($originsChunk)) {
                    throw new Exception('Invalid response from Mapbox Matrix API: insufficient distance data.');
                }

                $results = [];
                foreach ($originsChunk as $index => $origin) {
                    // Validate this specific distance exists
                    if (!isset($data['distances'][$index]) || !isset($data['distances'][$index][0])) {
                        continue;
                    }

                    $distance = $data['distances'][$index][0];
                    
                    if ($distance !== null) {
                        // Extract driverId from the correct structure
                        $driverId = $origin['driverId'] ?? $origin['id'] ?? $index;
                        $results[$driverId] = [
                            'distance' => (int) $distance,
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
} 