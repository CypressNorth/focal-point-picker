<?php

/*
 * Copyright (c) Rasso Hilber
 * https://rassohilber.com
 */

namespace Hirasso\FocalPointPicker;

use InvalidArgumentException;
use WP_Post;

final class FocalPoint
{
    public float $left;
    public float $top;

    public float $leftPercent;
    public float $topPercent;

    public float $x;
    public float $y;

    public float $xPercent;
    public float $yPercent;

    public function __construct(WP_Post|int $post)
    {
        $post = \get_post($post);

        if (!\wp_attachment_is_image($post) && !\wp_attachment_is('video', $post)) {
            throw new InvalidArgumentException("\$post is not an image");
        }

        $raw = \get_post_meta($post->ID, 'focalpoint', true);
        $default = FocalPointPicker::getDefaultPosition();

        $position = new Position(
            left: $raw['left'] ?? $default->left,
            top: $raw['top'] ?? $default->top,
        );

        $this->left = $position->left;
        $this->top = $position->top;

        $this->leftPercent = $this->left * 100;
        $this->topPercent = $this->top * 100;

        $this->x = $this->left;
        $this->y = $this->top;

        $this->xPercent = $this->x * 100;
        $this->yPercent = $this->y * 100;
    }

    /**
     * Is the focal point's value equal to the default value
     */
    public function isDefaultPosition(): bool
    {
        $defaultPosition = FocalPointPicker::getDefaultPosition();
        return $this->x === $defaultPosition->top && $this->y === $defaultPosition->left;
    }


}
