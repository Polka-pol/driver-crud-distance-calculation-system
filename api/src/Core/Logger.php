<?php

namespace App\Core;

use Monolog\Logger as MonologLogger;
use Monolog\Handler\StreamHandler;
use Monolog\Handler\RotatingFileHandler;
use Exception;

class Logger
{
    private static $logger;

    public static function getLogger()
    {
        if (!self::$logger) {
            self::initialize();
        }
        return self::$logger;
    }

    private static function initialize()
    {
        try {
            self::$logger = new MonologLogger('connex_app');

            // Log errors to a rotating file to prevent it from getting too large.
            // Changed to WARNING level to reduce log spam
            $logPath = __DIR__ . '/../../logs/app.log';
            $handler = new RotatingFileHandler($logPath, 7, MonologLogger::WARNING);
            self::$logger->pushHandler($handler);
        } catch (Exception $e) {
            // Fallback to default error logging if Monolog fails
            error_log('Failed to initialize Monolog logger: ' . $e->getMessage());
            // Create a dummy logger to avoid breaking the application
            self::$logger = new class {
                public function info($message, array $context = [])
                {
                }
                public function warning($message, array $context = [])
                {
                }
                public function error($message, array $context = [])
                {
                }
            };
        }
    }

    public static function info(string $message, array $context = [])
    {
        // INFO logging disabled to reduce log spam
        // self::getLogger()->info($message, $context);
    }

    public static function warning(string $message, array $context = [])
    {
        self::getLogger()->warning($message, $context);
    }

    public static function error(string $message, array $context = [])
    {
        self::getLogger()->error($message, $context);
    }
}
