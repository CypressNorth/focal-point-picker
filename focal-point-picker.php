<?php

/**
 * Plugin Name: Focal Point Picker
 * Description: Zero-dependency focal point picker for WordPress images and videos
 * Plugin URI: https://github.com/cypressnorth/focal-point-picker
 * Version: 1.4.0
 * Author: Cypress North
 * Author URI: https://cypressnorth.com/
 * Tested up to: 6.9
 * Requires PHP: 8.2
 * License: GPL-3.0-or-later
 * License URI: http://www.gnu.org/licenses/gpl-3.0.html
 * GitHub Plugin URI: cypressnorth/focal-point-picker
 */

use Hirasso\FocalPointPicker\FocalPointPicker;
use Hirasso\FocalPointPicker\CLI;
use Hirasso\FocalPointPicker\FocalPoint;

/** Exit if accessed directly */
if (!\defined('ABSPATH')) {
    exit;
}

\define('WPFP_PLUGIN_URI', \untrailingslashit(\plugin_dir_url(__FILE__)));
\define('WPFP_PLUGIN_DIR', \untrailingslashit(__DIR__));

/**
 * Require the autoloader
 * - vendor/autoload.php in development (composer)
 * - autoload.dist.php in production (not composer)
 */
require_once match(\is_readable(__DIR__ . '/vendor/autoload.php')) {
    true => __DIR__ . '/vendor/autoload.php',
    default => __DIR__ . '/autoload.dist.php'
};

/**
 * Initialize the Admin Functionality
 */
FocalPointPicker::init();
CLI::init();

/**
 * Helper function to retrieve a focal point for an image
 */
if (!\function_exists('fcp_get_focalpoint')) {
    function fcp_get_focalpoint(WP_Post|int $post): FocalPoint
    {
        return new FocalPoint($post);
    }
}
